/**
 * RepoSnapshotUploadClient — 上传客户端：凭证协商 + OSS 直传
 *
 * 上传链路阶段 4/6 · 面向业务 API 要上传凭证（GET
 * /api/v1/snapshot/upload-credential），把凭证缓存 1 小时，并按凭证把密文
 * 产物直传阿里云 OSS（PUT 预签名 / POST 表单二选一，见 05）。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../04-upload-client.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   RepoSnapshotUploadClient      客户端类（凭证缓存 / 目标协商 / 直传）
 *   buildUploadCredentialUrl      凭证请求 URL（workspace_id 查询参数）
 *   authHeaders                   Bearer 授权头
 *   uploadCredentialTokenHash     token 的 sha256（凭证归属校验用）
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   captureBeforePromptUnsafe() [01] → getUploadKey()
 *   flushActiveUpload() [06]         → requestUploadTarget() → uploadObject() → 05
 *
 * Node 内建别名已还原：crypto: createHash/randomUUID · fs: createReadStream/
 * openAsBlob · undici.fetch（保留 undiciFetch 名以区别全局 fetch）。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: RepoSnapshotUploadClient -> RepoSnapshotUploadClient */
/**
 * 上传客户端（类名 = bundle 内 keepNames 原名）。uploadCredentialsByHandle
 * 以随机 handle 缓存凭证（1 小时 TTL），换目标时校验「token 哈希 +
 * workspaceId」归属，防止跨工作区/跨账号错用凭证。
 */
var RepoSnapshotUploadClient = class {
  apiClient;
  objectUploadFetch;
  credentialTimeoutMs;
  objectUploadTimeoutMs;
  uploadCredentialsByHandle = new Map();
  constructor(deps) {
    ((this.apiClient = deps.apiClient),
      (this.objectUploadFetch = deps.objectUploadFetch),
      (this.credentialTimeoutMs =
        deps.credentialTimeoutMs ?? DEFAULT_CREDENTIAL_TIMEOUT_MS),
      (this.objectUploadTimeoutMs =
        deps.objectUploadTimeoutMs ?? DEFAULT_OBJECT_UPLOAD_TIMEOUT_MS));
  }
  /**
   * GET /api/v1/snapshot/upload-credential（Bearer 认证）。响应经
   * resolveUploadCredentialData（08）校验 + assertSupportedEncryption 断言
   * 加密算法受支持；服务端拒绝（code!=0）或无 data 时返回 null。
   */
  async getUploadCredential(authToken, workspaceId, signal) {
    let credentialUrl = buildUploadCredentialUrl(workspaceId),
      response = await readApiJson(this.apiClient, credentialUrl, {
        method: "GET",
        headers: authHeaders(authToken),
        timeoutMs: this.credentialTimeoutMs,
        signal: signal,
      }),
      credential = resolveUploadCredentialData(response);
    return credential
      ? (assertSupportedEncryption(credential), credential)
      : null;
  }
  /** 清理过期凭证缓存；取凭证前/换目标前都会调用。 */
  pruneExpiredUploadCredentials(nowMs = Date.now()) {
    for (let [handle, entry] of this.uploadCredentialsByHandle)
      entry.expiresAt <= nowMs && this.uploadCredentialsByHandle.delete(handle);
  }
  /**
   * 01 的入口：要凭证 → 缓存 → 组装内部 uploadKey 结构
   * （RSA 公钥 PEM / keyId=服务端 key_version / snapshotId+baseSnapshotId /
   * maxSizeBytes）。workspaceId 实参是本地的 workspaceKeyHash（01 传入）。
   */
  async getUploadKey(authToken, workspaceId, traceId, options) {
    let credential = await this.getUploadCredential(
      authToken,
      workspaceId,
      options?.signal,
    );
    if (!credential) return null;
    this.pruneExpiredUploadCredentials();
    let handle = randomUUID();
    return (
      // 凭证缓存 1 小时（CREDENTIAL_CACHE_TTL_MS），换目标时按 handle 取回
      this.uploadCredentialsByHandle.set(handle, {
        credential: credential,
        tokenHash: uploadCredentialTokenHash(authToken),
        workspaceId: workspaceId,
        expiresAt: Date.now() + CREDENTIAL_CACHE_TTL_MS,
      }),
      {
        schema: REPO_SNAPSHOT_UPLOAD_KEY_SCHEMA, // = "repo_snapshot_upload_key/v1"
        uploadCredentialHandle: handle,
        snapshotId: credential.snapshot.snapshot_id,
        ...(credential.snapshot.base_snapshot_id?.trim()
          ? { baseSnapshotId: credential.snapshot.base_snapshot_id.trim() }
          : {}),
        keyId: String(credential.encryption.key_version),
        keyWrapAlgorithm: "rsa-oaep-sha256",
        publicKeySpkiPem: normalizePublicKeySpkiPem(
          credential.encryption.public_key,
        ),
        ...(credential.max_size !== undefined
          ? { maxSizeBytes: credential.max_size }
          : {}),
      }
    );
  }
  /**
   * 凭证 → OSS 直传目标。handle 不存在/过期 → key_expired；归属校验
   * （workspaceKeyHash 与 token 哈希不匹配）同样 key_expired；通过则交给
   * buildObjectUploadTarget（05）组装表单与回调。
   */
  async requestUploadTarget(authToken, request, traceId, options) {
    this.pruneExpiredUploadCredentials();
    let cached = this.uploadCredentialsByHandle.get(
      request.uploadCredentialHandle,
    );
    return cached
      ? cached.workspaceId !== request.workspaceKeyHash ||
        cached.tokenHash !== uploadCredentialTokenHash(authToken)
        ? {
            ok: false,
            reason: "key_expired",
            message:
              "repo snapshot upload credential handle does not match request identity",
          }
        : buildObjectUploadTarget({
            request: request,
            credential: cached.credential,
          })
      : {
          ok: false,
          reason: "key_expired",
          message:
            "repo snapshot upload credential handle unavailable or expired",
        };
  }
  /** 一次性消费：该凭证对应的上传结束后即从缓存移除。 */
  consumeUploadCredential(handle) {
    this.uploadCredentialsByHandle.delete(handle);
  }
  /**
   * OSS 直传统一入口：按凭证给的方法走 PUT（05.uploadPutObject）或 POST
   * （05.uploadPostObject）。整体超时 60s；失败不重试 —— 重试/退避在 06 状态机。
   */
  async uploadObject(request) {
    let fetchImpl = this.objectUploadFetch ?? undiciFetch,
      timeoutSignal = AbortSignal.timeout(this.objectUploadTimeoutMs),
      mergedSignal = request.signal
        ? AbortSignal.any([request.signal, timeoutSignal])
        : timeoutSignal;
    try {
      let response =
          request.target.method === "PUT"
            ? await uploadPutObject({
                fetchImpl: fetchImpl,
                target: request.target,
                artifactPath: request.artifactPath,
                signal: mergedSignal,
              })
            : await uploadPostObject({
                fetchImpl: fetchImpl,
                target: request.target,
                artifactPath: request.artifactPath,
                signal: mergedSignal,
              }),
        errorBody = response.ok
          ? undefined
          : await readResponseBodyPreview(response);
      return response.ok
        ? { ok: true, etag: response.headers.get("etag") ?? undefined }
        : {
            ok: false,
            reason: "object_upload_failed",
            message: errorBody
              ? `HTTP ${response.status}: ${errorBody}`
              : `HTTP ${response.status}`,
          };
    } catch (response) {
      return {
        ok: false,
        reason: "object_upload_failed",
        message:
          response instanceof Error ? response.message : String(response),
      };
    }
  }
};

/* keepNames: buildUploadCredentialUrl -> buildUploadCredentialUrl */
/** 凭证端点 + workspace_id 查询参数；端点常量可被环境变量覆盖。 */
function buildUploadCredentialUrl(workspaceId) {
  let url = new URL(UPLOAD_CREDENTIAL_ENDPOINT);
  return (url.searchParams.set("workspace_id", workspaceId), url.toString());
}

/* keepNames: qlt -> authHeaders */
/** Bearer 授权头（登录态 token）。 */
function authHeaders(authToken) {
  return { Authorization: `Bearer ${authToken}` };
}

/* keepNames: uploadCredentialTokenHash -> uploadCredentialTokenHash */
/** token 的 sha256（hex）。缓存凭证记哈希不记原文，归属校验用。 */
function uploadCredentialTokenHash(authToken) {
  return createHash("sha256").update(authToken).digest("hex");
}
