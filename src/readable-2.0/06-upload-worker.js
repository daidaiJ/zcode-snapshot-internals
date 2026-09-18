/**
 * RepoSnapshotUploadWorker — 上传状态机（失败退避 / 晋升 / 丢弃）
 *
 * 上传链路阶段 6a · 消费 07 的待传队列：按工作区串行地「取一条待传 →
 * 换取 OSS 目标 → 直传 → 收尾」。上传失败会按原因分流：基线失效、凭证
 * 过期、体积超限、普通失败（计数退避）；成功则推进基线并晋升下一条。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../06-upload-worker.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   RepoSnapshotUploadWorker   状态机类
 *   readWorkspaceSizeBytes     从 manifest 读工作区体量（超限记录用）
 *   readEnvelope / readManifest 读信封 / 清单 JSON
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   captureBeforePromptUnsafe() [01] → flushWorkspace()
 *     → flushWorkspaceLoop() → flushActiveUpload()（单步，循环直到无待传）
 *       ├─ requestUploadTarget() / uploadObject() → 04 → 05
 *       └─ discard/fail/markAccepted…             → 07
 *
 * Node 内建别名已还原：fs/promises.readFile/stat。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: RepoSnapshotUploadWorker -> RepoSnapshotUploadWorker */
/**
 * 上传状态机（类名 = bundle 内 keepNames 原名）。flushesByWorkspaceKey
 * 保证同一工作区同时只有一个上传链在跑；每步结果决定继续循环还是收工。
 */
var RepoSnapshotUploadWorker = class {
  stateRepo;
  uploadClient;
  tokenProvider;
  pendingManager;
  flushesByWorkspaceKey = new Map();
  constructor(deps) {
    ((this.stateRepo = deps.stateRepo),
      (this.uploadClient = deps.uploadClient),
      (this.tokenProvider = deps.tokenProvider),
      (this.pendingManager =
        deps.pendingManager ??
        new RepoSnapshotPendingManager({ stateRepo: deps.stateRepo })));
  }
  /**
   * 把本轮 flush 链式挂到该工作区上一个 flush 后面（串行化，防并发双传），
   * 循环单步直到没有可传的待传项。01 采集完登记队列后调用这里。
   */
  async flushWorkspace(trigger) {
    let workspaceKey = buildRepoSnapshotWorkspaceKey(trigger),
      flushPromise = (
        this.flushesByWorkspaceKey.get(workspaceKey) ?? Promise.resolve()
      )
        .catch(() => {})
        .then(() => this.flushWorkspaceLoop(trigger))
        .catch(() => {})
        .finally(() => {
          this.flushesByWorkspaceKey.get(workspaceKey) === flushPromise &&
            this.flushesByWorkspaceKey.delete(workspaceKey);
        });
    (this.flushesByWorkspaceKey.set(workspaceKey, flushPromise),
      await flushPromise);
  }
  /** flushActiveUpload 返回 true = 还有后续（如晋升了下一条），继续循环。 */
  async flushWorkspaceLoop(trigger) {
    for (; await this.flushActiveUpload(trigger););
  }
  /**
   * 状态机单步：取一条待传（activeUpload 优先，回落 latestPendingUpload），
   * 走「记尝试 → 换目标 → 直传 → 收尾」。返回值 = 是否还有后续。
   *
   * 失败分流：
   *   基线失效（base_not_found/base_invalid/hash_mismatch）→ 清本地基线，丢弃本轮
   *   key_expired / payload_too_large                      → 丢弃本轮，可能晋升下一条
   *   其它失败                                             → 计失败数；超限(3次/24h)才丢，否则保留待重试
   * 成功 → markAcceptedManifest 推进基线（下轮增量锚点）并晋升下一条。
   */
  async flushActiveUpload(trigger) {
    let state = await this.stateRepo.read(trigger),
      // 优先传 activeUpload（登记中的当前轮），没有才补传 latest（上一轮遗留）
      pending = state.activeUpload ?? state.pendingUpload;
    if (!pending) return false;
    let authToken = await this.tokenProvider();
    if (!authToken) return false;
    // 记一次尝试（attemptCount+1）；返回 null = 待传已被其它流程处理（stale）
    let attempt = await this.pendingManager.recordUploadAttempt(
      trigger,
      pending,
    );
    if (!attempt) return (this.consumePendingCredential(pending), true);
    if (attempt.failureCountedAt) {
      if (!state.latestPendingUpload)
        return (this.consumePendingCredential(attempt), false);
      let discardOutcome = await this.pendingManager.discardPendingUpload(
        trigger,
        attempt,
      );
      return (
        this.consumePendingCredential(attempt),
        discardOutcome === "promoted"
      );
    }
    let credentialHandle = attempt.uploadCredentialHandle?.trim();
    if (!credentialHandle)
      return (
        (await this.pendingManager.discardPendingUpload(trigger, attempt)) ===
        "promoted"
      );
    let targetRequest = await this.buildUploadTargetRequest({
        stateWorkspaceKey: state.workspaceKey,
        pending: attempt,
        uploadCredentialHandle: credentialHandle,
      }),
      target = await this.uploadClient.requestUploadTarget(
        authToken,
        targetRequest,
        trigger.traceId,
      );
    if (!target.ok) {
      if (
        target.reason === "base_not_found" ||
        target.reason === "base_invalid" ||
        target.reason === "hash_mismatch"
      )
        return (
          // 服务端说基线不存在/不匹配：清掉本地基线 —— 下轮只能走 baseline 全量
          await this.stateRepo.clearAcceptedManifest(trigger),
          await this.pendingManager.discardPendingUpload(trigger, attempt, {
            discardLatest: true,
          }),
          this.consumePendingCredential(attempt),
          state.latestPendingUpload &&
            this.consumePendingCredential(state.latestPendingUpload),
          false
        );
      if (target.reason === "key_expired") {
        let discardOutcome = await this.pendingManager.discardPendingUpload(
          trigger,
          attempt,
        );
        return (
          this.consumePendingCredential(attempt),
          discardOutcome === "promoted"
        );
      }
      if (target.reason === "payload_too_large") {
        let workspaceSizeBytes = await readWorkspaceSizeBytes(
          attempt.manifestPath,
        );
        await this.pendingManager.recordCompressedSize(trigger, {
          encryptedSizeBytes:
            targetRequest.encryptedArtifact.encryptedSizeBytes,
          workspaceSizeBytes: workspaceSizeBytes,
          manifestHash: attempt.nextManifestHash,
          recordedAt: Date.now(),
        });
        let discardOutcome = await this.pendingManager.discardPendingUpload(
          trigger,
          attempt,
        );
        return (
          this.consumePendingCredential(attempt),
          discardOutcome === "promoted"
        );
      }
      let failOutcome = await this.pendingManager.failPendingUpload(
        trigger,
        attempt,
      );
      return (
        failOutcome !== "retained" && this.consumePendingCredential(attempt),
        failOutcome === "promoted"
      );
    }
    if (
      !(
        await this.uploadClient.uploadObject({
          target: target.objectUpload,
          artifactPath: attempt.encryptedArtifactPath,
          traceId: trigger.traceId,
        })
      ).ok
    ) {
      let failOutcome = await this.pendingManager.failPendingUpload(
        trigger,
        attempt,
      );
      return (
        failOutcome !== "retained" && this.consumePendingCredential(attempt),
        failOutcome === "promoted"
      );
    }
    return (
      this.consumePendingCredential(attempt),
      // OSS 回调成功即视为服务端接受：基线推进到本轮 manifest（07）
      (await this.pendingManager.markAcceptedManifest(trigger, attempt, {
        manifestHash: attempt.nextManifestHash,
        manifestPath: attempt.manifestPath,
        extraManifestHash: attempt.nextExtraManifestHash,
        extraManifestPath: attempt.extraManifestPath,
      })) === "promoted"
    );
  }
  /** 所有收尾路径统一消费凭证，避免 1h 缓存里挂着已用过的 handle。 */
  consumePendingCredential(attempt) {
    let handle = attempt.uploadCredentialHandle?.trim();
    handle && this.uploadClient.consumeUploadCredential(handle);
  }
  /**
   * 换目标请求体：读信封 JSON + stat 密文 + 算密文 sha256，连同基线链
   * （baseManifestHash）一起交给服务端校验 —— 服务端验基线就是在这里。
   */
  async buildUploadTargetRequest(args) {
    let [envelope, encryptedStat, encryptedSha256] = await Promise.all([
      readEnvelope(args.pending.encryptionEnvelopePath),
      stat(args.pending.encryptedArtifactPath),
      sha256File(args.pending.encryptedArtifactPath),
    ]);
    return {
      schema: REPO_SNAPSHOT_UPLOAD_TARGET_SCHEMA, // = "repo_snapshot_upload_target/v1"
      workspaceKeyHash: getRepoSnapshotWorkspaceHash(args.stateWorkspaceKey),
      uploadCredentialHandle: args.uploadCredentialHandle,
      kind: args.pending.kind,
      manifestHash: args.pending.nextManifestHash,
      baseManifestHash: args.pending.baseManifestHash,
      attribution: args.pending.attribution,
      encryptedArtifact: {
        ...envelope,
        encryptedSizeBytes: encryptedStat.size,
        encryptedSha256: encryptedSha256,
      },
    };
  }
};

/* keepNames: pdt -> readWorkspaceSizeBytes */
/** 从 manifest.stats 读工作区体量；读不到（缺失/损坏）返回 undefined。 */
async function readWorkspaceSizeBytes(manifestPath) {
  try {
    let includedBytes = (await readManifest(manifestPath)).stats?.includedBytes;
    return typeof includedBytes == "number" && Number.isFinite(includedBytes)
      ? includedBytes
      : undefined;
  } catch {
    return;
  }
}

/* keepNames: ddt -> readEnvelope */
/** 读信封 JSON（含 encryptedDataKey 等，供换目标请求体使用）。 */
async function readEnvelope(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

/* keepNames: udt -> readManifest */
/** 读 manifest JSON（目前只用其 stats.includedBytes）。 */
async function readManifest(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}
