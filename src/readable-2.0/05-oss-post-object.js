/**
 * OSS 直传 — PUT 预签名 / POST 表单（含回调登记）
 *
 * 上传链路阶段 5/6 · 密文产物不经业务服务器，直接 PUT/POST 到阿里云 OSS；
 * POST 表单里带 OSS callback（base64），由 OSS 在落盘后回调业务服务器登记
 * 快照 —— 服务端由此知道这轮快照已接受，成为下一轮增量的基线。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../05-oss-post-object.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   uploadPutObject                   PUT 预签名直传
 *   uploadPostObject                  POST 表单直传（文件名固定 repo-snapshot.tar.gz.enc）
 *   buildObjectUploadTarget           凭证 + 待传请求 → OSS 表单目标与回调体
 *   encodeOssCallback                 callback 字段：base64(JSON{url,body,type})
 *   replaceOssCallbackPlaceholders    回调体 ${placeholder} 填充
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   RepoSnapshotUploadClient.uploadObject() [04]
 *     → requestUploadTarget() 内部 buildObjectUploadTarget()
 *     → uploadPutObject() / uploadPostObject()
 *
 * Node 内建别名已还原：fs: createReadStream/openAsBlob。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: uploadPutObject -> uploadPutObject */
/**
 * PUT 预签名直传：以凭证给的表头为基础，附加快名校验头，body 为密文文件
 * 流（duplex half）；redirect: error 防止把密文跟到别的域。
 */
async function uploadPutObject(request) {
  let headers = new Headers(request.target.headers),
    checksum = request.target.checksum;
  return (
    checksum?.headerName &&
      checksum.value &&
      headers.set(checksum.headerName, checksum.value),
    request.fetchImpl(request.target.url, {
      method: "PUT",
      redirect: "error",
      headers: headers,
      body: createReadStream(request.artifactPath),
      duplex: "half",
      signal: request.signal,
    })
  );
}

/* keepNames: uploadPostObject -> uploadPostObject */
/**
 * POST 表单直传：凭证下发 policy/x-oss-signature/安全 token 等表单域，
 * 文件字段名固定 repo-snapshot.tar.gz.enc（OSS 回调与审计都认这个名）。
 */
async function uploadPostObject(request) {
  let form = new FormData();
  for (let [field, value] of Object.entries(request.target.formFields ?? {}))
    form.set(field, value);
  let fileBlob = await openAsBlob(request.artifactPath, {
    type: "application/octet-stream",
  });
  return (
    form.set("file", fileBlob, "repo-snapshot.tar.gz.enc"),
    request.fetchImpl(request.target.url, {
      method: "POST",
      redirect: "error",
      headers: request.target.headers,
      body: form,
      signal: request.signal,
    })
  );
}

/* keepNames: rdt -> buildObjectUploadTarget */
/**
 * 凭证 + 待传请求 → OSS POST 目标：
 *  1. 体积预检：超 max_size 直接 payload_too_large（06 会记录体量并丢弃）
 *  2. 回调体模板填占位符：update_type（baseline/increment → 服务端命名）、
 *     checksum（sha256:密文哈希）、encrypted_aes_key（RSA 封装的密钥，base64）
 *  3. callback 字段 = base64(JSON{url, body, content_type})，OSS 落盘后回调
 *     业务服务器登记 —— 服务端由此知道快照已接受，成为下轮增量基线。
 */
function buildObjectUploadTarget(input) {
  let { request: request, credential: credential } = input,
    maxSizeBytes = credential.max_size;
  if (
    maxSizeBytes !== undefined &&
    request.encryptedArtifact.encryptedSizeBytes > maxSizeBytes
  )
    return {
      ok: false,
      reason: "payload_too_large",
      message: `repo snapshot encrypted artifact exceeds upload credential max_size ${maxSizeBytes} bytes`,
      maxSizeBytes: maxSizeBytes,
    };
  let snapshotId = credential.snapshot.snapshot_id;
  if (!snapshotId)
    return {
      ok: false,
      reason: "invalid",
      message: "missing snapshot_id in upload credential response",
    };
  let updateType = toServerUpdateType(request.kind),
    attributionFields = ossAttributionValues(request.attribution),
    checksum = `sha256:${request.encryptedArtifact.plaintextSha256}`,
    callbackBody = replaceOssCallbackPlaceholders(credential.callback.body, {
      update_type: updateType,
      checksum: checksum,
      encrypted_aes_key: request.encryptedArtifact.encryptedDataKey,
      "x:update_type": updateType,
      "x:checksum": checksum,
      "x:encrypted_aes_key": request.encryptedArtifact.encryptedDataKey,
      "x:base_snapshot_id": credential.snapshot.base_snapshot_id ?? "",
      // 归因元数据（会话/消息/模型等）展开进回调体，服务端据此入库存档
      ...ossAttributionPlaceholderValues(request.attribution),
    });
  return {
    ok: true,
    snapshotId: snapshotId,
    objectKey: credential.oss.path,
    objectUpload: {
      method: "POST",
      url: credential.oss.host,
      expiresAt: Date.now() + 3600 * 1e3,
      maxBytes: Math.max(request.encryptedArtifact.encryptedSizeBytes, 1),
      formFields: {
        success_action_status: "200",
        policy: credential.oss.policy,
        "x-oss-signature": credential.oss.x_oss_signature,
        "x-oss-signature-version": credential.oss.x_oss_signature_version,
        "x-oss-credential": credential.oss.x_oss_credential,
        "x-oss-date": credential.oss.x_oss_date,
        key: credential.oss.path,
        "x-oss-security-token": credential.oss.x_oss_security_token,
        ...attributionFields,
        callback: encodeOssCallback({
          callback: credential.callback,
          callbackBody: callbackBody,
        }),
      },
      callback: { mode: "oss-callback" },
    },
  };
}

/* keepNames: edt -> encodeOssCallback */
/** OSS callback 协议字段：base64(JSON{callbackUrl, callbackBody, callbackBodyType})。 */
function encodeOssCallback(input) {
  return Buffer.from(
    JSON.stringify({
      callbackUrl: input.callback.url,
      callbackBody: input.callbackBody,
      callbackBodyType: input.callback.content_type,
    }),
    "utf-8",
  ).toString("base64");
}

/* keepNames: replaceOssCallbackPlaceholders -> replaceOssCallbackPlaceholders */
/** 回调体模板 ${name} 填充；URL 编码后替换，未注册的占位符原样保留。 */
function replaceOssCallbackPlaceholders(template, values) {
  return template.replaceAll(/\$\{([^}]+)\}/g, (matched, key) =>
    Object.hasOwn(values, key)
      ? encodeURIComponent(values[key] ?? "")
      : matched,
  );
}
