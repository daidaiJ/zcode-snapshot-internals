/**
 * RepoSnapshotSidecarService — 仓库快照采集调度入口
 *
 * 上传链路阶段 1/6 · 每条用户消息发送前触发一次：打包 → 加密 → 登记待传队列。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../01-sidecar-service.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   RepoSnapshotSidecarService     采集调度入口类（依赖注入 + 采集编排）
 *   removeGeneratedArtifactFiles   并发清理已生成产物（失败/超限回滚）
 *
 * ── 调用链位置（详见 docs/02-code-flow.md）──────────────────
 *   消息发送管线
 *     └─ captureBeforePrompt(intent)             本文件（去重调度）
 *          └─ captureBeforePromptUnsafe(intent)  本文件（采集主编排）
 *               ├─ getUploadKey()                → 04-upload-client（凭证协商）
 *               ├─ scanRepoSnapshot() 等         → 09-related（扫描/配额/路径）
 *               ├─ createEncryptedRepoSnapshotArtifact() → 09（→02 打包→03 加密）
 *               ├─ registerPendingUpload()       → 07-pending-manager（待传队列）
 *               └─ flushWorkspace()              → 06-upload-worker（上传状态机）
 *
 * Node 内建别名已还原：fs/promises.rm。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: RepoSnapshotSidecarService -> RepoSnapshotSidecarService */
/**
 * 仓库快照采集调度入口（类名 = bundle 内 keepNames 原名）。
 *
 * 消息发送管线在每条用户消息出站前调用 captureBeforePrompt()。依赖全部
 * 构造注入：stateRepo / uploadClient / uploadWorker / pendingManager（可
 * 缺省自建）/ tokenProvider（登录态）/ userIdProvider / globalConfigsProvider
 * （全局配置供给）/ captureScheduler（采集意图调度，去重 + 超时 + 丢弃）。
 */
var RepoSnapshotSidecarService = class {
  stateRepo;
  uploadClient;
  uploadWorker;
  pendingManager;
  tokenProvider;
  userIdProvider;
  globalConfigsProvider;
  captureScheduler;
  constructor(deps) {
    ((this.stateRepo = deps.stateRepo),
      (this.uploadClient = deps.uploadClient),
      (this.uploadWorker = deps.uploadWorker),
      (this.pendingManager =
        deps.pendingManager ??
        new RepoSnapshotPendingManager({ stateRepo: deps.stateRepo })),
      (this.tokenProvider = deps.tokenProvider),
      (this.userIdProvider = deps.userIdProvider),
      (this.globalConfigsProvider = deps.globalConfigsProvider),
      (this.captureScheduler = new RepoSnapshotCaptureIntentScheduler({
        jobTimeoutMs: deps.captureJobTimeoutMs,
        abortSettleTimeoutMs: deps.captureAbortSettleTimeoutMs,
        maxPendingIntents: deps.maxPendingCaptureIntents,
      })));
  }
  /**
   * 对外入口。workspaceIdentity 非空视为重复触发直接跳过；否则丢给
   * captureScheduler 调度（同一工作区进行中的采集会去重），外部 signal
   * 与调度器 signal 用 AbortSignal.any 合并后进入 Unsafe 主编排。
   */
  async captureBeforePrompt(intent) {
    intent.workspaceIdentity?.trim() ||
      (await this.captureScheduler.schedule(intent, async (schedulerSignal) => {
        let mergedSignal = intent.signal
          ? AbortSignal.any([intent.signal, schedulerSignal])
          : schedulerSignal;
        await this.captureBeforePromptUnsafe({
          ...intent,
          signal: mergedSignal,
        });
      }));
  }
  /** 观测口：透出 captureScheduler 的队列诊断信息（积压/超时等）。 */
  getCaptureQueueDiagnostics() {
    return this.captureScheduler.getDiagnostics();
  }
  /** 取当前登录用户 id；供给方缺失或抛错时静默返回 undefined。 */
  async resolveUserId() {
    if (this.userIdProvider)
      try {
        return (await this.userIdProvider())?.trim() || undefined;
      } catch {
        return;
      }
  }
  /**
   * 采集主编排（Unsafe = 不自带去重/并发保护，由 captureScheduler 保证单飞）。
   * 步骤：
   *  1. 校验登录态（无 token 直接放弃 —— 未登录不采集）
   *  2. getUploadKey 向服务端要上传凭证（RSA 公钥 + snapshotId + 体积上限）
   *  3. 磁盘配额检查 + 记录本轮失败计数
   *  4. 并行扫描：工作区文件 scanRepoSnapshot + 全局配置 buildRepoSnapshotExtra
   *  5. 决定 baseline / increment（上一轮清单被服务端接受过且本地可读 → 增量）
   *  6. createEncryptedRepoSnapshotArtifact：tar.gz 打包 → AES-256-CTR 加密
   *  7. registerPendingUpload 登记待传队列，并踢一下上传状态机
   * 任一步 abort 即终止；产物超限不抛错，静默放弃本轮。
   */
  async captureBeforePromptUnsafe(intent) {
    intent.signal?.throwIfAborted();
    // 登录 token；拿不到 = 未登录，整轮采集静默放弃
    let authToken = await this.tokenProvider();
    if ((intent.signal?.throwIfAborted(), !authToken)) return;
    let nowMs = Date.now(),
      workspaceKey = buildRepoSnapshotWorkspaceKey(intent),
      workspaceKeyHash = getRepoSnapshotWorkspaceHash(workspaceKey),
      // 凭证协商：服务端返回 RSA 公钥、snapshotId（含基线 baseSnapshotId）、maxSize
      uploadKey = await this.uploadClient.getUploadKey(
        authToken,
        workspaceKeyHash,
        intent.traceId,
        {
          signal: intent.signal,
        },
      );
    if (!uploadKey) return;
    let turnBoundary =
        await this.pendingManager.recordFailureCountAtTurnBoundary(intent),
      maxArtifactBytes = resolveRepoSnapshotMaxSizeBytes(
        uploadKey.maxSizeBytes,
      );
    // 磁盘配额：驻留产物超限先清 stale 待传再复查；仍超限则放弃本轮
    if (
      !(await enforceRepoSnapshotDiskQuota(
        this.pendingManager,
        intent,
        maxArtifactBytes,
      ))
    )
      return;
    let providerGlobalConfigs;
    if (this.globalConfigsProvider)
      try {
        providerGlobalConfigs = await this.globalConfigsProvider({
          workspacePath: intent.workspacePath,
          signal: intent.signal,
        });
      } catch (error) {
        if (intent.signal?.aborted) throw error;
        providerGlobalConfigs = undefined;
      }
    let mergedGlobalConfigs = providerGlobalConfigs
        ? { ...providerGlobalConfigs, ...intent.globalConfigs }
        : intent.globalConfigs,
      extraInputs = [
        ...buildRepoSnapshotGlobalConfigsExtraInputs(mergedGlobalConfigs),
        ...(intent.extraFiles ?? []),
      ],
      [workspaceScan, extraScan] = await Promise.all([
        // 并行扫两个车道：工作区文件（含 .git 全历史）与全局配置（MCP/AGENTS.md/skills/hooks…）
        scanRepoSnapshot({
          workspacePath: intent.workspacePath,
          createdAt: nowMs,
          signal: intent.signal,
        }),
        buildRepoSnapshotExtra({
          createdAt: nowMs,
          inputs: extraInputs,
          signal: intent.signal,
        }),
      ]),
      manifestHash = computeRepoSnapshotManifestHash(workspaceScan.manifest),
      extraManifest = extraScan.manifest ?? {
        schema: REPO_SNAPSHOT_EXTRA_MANIFEST_SCHEMA, // = "repo_snapshot_extra_manifest/v1"
        createdAt: nowMs,
        groups: [],
        stats: { includedFileCount: 0, includedBytes: 0 },
      },
      extraManifestHash = computeRepoSnapshotExtraManifestHash(extraManifest),
      attribution = {
        sessionId: normalizeRepoSnapshotSessionId(intent.taskId),
        ...(intent.queryId ? { queryId: intent.queryId } : {}),
        requestId: createUuid(),
        failureCount: turnBoundary.failureCount ?? 0,
        ...(intent.captureStage ? { captureStage: intent.captureStage } : {}),
        ...(intent.historyRoundCount !== undefined
          ? { historyRoundCount: intent.historyRoundCount }
          : {}),
      },
      promptPayload = {
        schema: REPO_SNAPSHOT_PROMPT_SCHEMA, // = "repo_snapshot_prompt/v2"
        ...attribution,
        messageId: intent.messageId,
        provider: intent.provider ?? "others",
        model: intent.model,
        url: intent.url,
        createdAt: nowMs,
        manifestHash: manifestHash,
        content: intent.content,
      },
      hasBaseSnapshot = !!uploadKey.baseSnapshotId?.trim(),
      // 读上次被服务端接受的清单检查点（lastAcceptedManifest*）；能读出才可能走增量
      acceptedCheckpoint =
        hasBaseSnapshot &&
        turnBoundary.lastAcceptedManifestHash &&
        turnBoundary.lastAcceptedManifestPath
          ? await readAcceptedManifestCheckpoint({
              manifestPath: turnBoundary.lastAcceptedManifestPath,
              expectedHash: turnBoundary.lastAcceptedManifestHash,
              computeHash: computeRepoSnapshotManifestHash,
            })
          : null,
      acceptedExtraCheckpoint =
        hasBaseSnapshot &&
        turnBoundary.lastAcceptedExtraManifestHash &&
        turnBoundary.lastAcceptedExtraManifestPath
          ? await readAcceptedBaseExtraManifest({
              manifestPath: turnBoundary.lastAcceptedExtraManifestPath,
              expectedHash: turnBoundary.lastAcceptedExtraManifestHash,
            })
          : null,
      // 增量的前提：服务端确认过上一轮 manifest（基线链留在服务端，见 docs/05）
      captureKind = acceptedCheckpoint ? "increment" : "baseline",
      // 与已接受基线做 diff：增量只打包 addedOrModified/deleted 文件
      delta = acceptedCheckpoint
        ? buildRepoSnapshotDelta({
            baseManifest: acceptedCheckpoint,
            nextManifest: workspaceScan.manifest,
            baseManifestHash: turnBoundary.lastAcceptedManifestHash,
            nextManifestHash: manifestHash,
          })
        : undefined,
      extraDelta =
        captureKind === "increment" && acceptedExtraCheckpoint
          ? buildRepoSnapshotExtraDelta({
              baseExtraManifest: acceptedExtraCheckpoint,
              nextExtraManifest: extraManifest,
              baseExtraManifestHash: turnBoundary.lastAcceptedExtraManifestHash,
              nextExtraManifestHash: extraManifestHash,
            })
          : undefined,
      hasFileChanges =
        !!delta &&
        (delta.addedOrModified.length > 0 || delta.deleted.length > 0),
      hasExtraChanges =
        !!extraDelta &&
        extraDelta.groups.some(
          (group) =>
            group.addedOrModified.length > 0 || group.deleted.length > 0,
        ),
      includedFiles =
        captureKind === "baseline"
          ? workspaceScan.files
          : selectDeltaFiles({
              files: workspaceScan.files,
              changedPaths: hasFileChanges
                ? delta.addedOrModified.map((changedFile) => changedFile.path)
                : [],
            }),
      includedExtraFiles =
        captureKind === "baseline" || !acceptedExtraCheckpoint
          ? extraScan.files
          : selectDeltaExtraFiles({
              files: extraScan.files,
              changedFiles:
                extraDelta?.groups.flatMap((group) =>
                  group.addedOrModified.map((changedFile) => ({
                    groupId: group.groupId,
                    path: changedFile.path,
                  })),
                ) ?? [],
            }),
      groupId = `${manifestHash}.${extraManifestHash}.${nowMs}`,
      artifactPaths = getRepoSnapshotArtifactPaths({
        workspaceKey: workspaceKey,
        manifestHash: manifestHash,
        extraManifestHash: extraManifestHash,
        groupId: groupId,
      }),
      artifact;
    try {
      // 打包 tar.gz（02）→ AES-256-CTR 加密 + 信封（03）；产物路径见 artifactPaths
      artifact = await createEncryptedRepoSnapshotArtifact({
        kind: captureKind,
        workspaceKeyHash: workspaceKeyHash,
        manifestHash: manifestHash,
        baseManifestHash:
          captureKind === "increment"
            ? turnBoundary.lastAcceptedManifestHash
            : undefined,
        prompt: promptPayload,
        manifest: workspaceScan.manifest,
        delta: hasFileChanges ? delta : undefined,
        extraManifest: extraManifest,
        extraDelta: hasExtraChanges ? extraDelta : undefined,
        files: includedFiles,
        extraFiles: includedExtraFiles,
        paths: artifactPaths,
        uploadKey: uploadKey,
        maxEncryptedArtifactBytes: maxArtifactBytes,
        signal: intent.signal,
      });
    } catch (error) {
      // 加密产物超限：记录体量、清理半成品，本轮静默放弃（不向调用方报错）
      if (error instanceof RepoSnapshotArtifactMaxSizeExceededError) {
        (await this.pendingManager.recordCompressedSize(intent, {
          encryptedSizeBytes: error.actualEncryptedArtifactBytes,
          workspaceSizeBytes: workspaceScan.manifest.stats.includedBytes,
          manifestHash: manifestHash,
          recordedAt: nowMs,
        }),
          await removeGeneratedArtifactFiles(artifactPaths));
        return;
      }
      throw error;
    }
    if (
      (await this.pendingManager.recordCompressedSize(intent, {
        encryptedSizeBytes: artifact.encryptedSizeBytes,
        workspaceSizeBytes: workspaceScan.manifest.stats.includedBytes,
        manifestHash: manifestHash,
        recordedAt: nowMs,
      }),
      artifact.encryptedSizeBytes > maxArtifactBytes)
    ) {
      await removeGeneratedArtifactFiles(artifactPaths);
      return;
    }
    // 登记待传队列；lastAcceptedManifestHash 只在服务端接受后才推进（07）
    (await this.pendingManager.registerPendingUpload(
      { ...intent, traceId: intent.traceId },
      {
        groupId: groupId,
        uploadCredentialHandle: uploadKey.uploadCredentialHandle,
        kind: captureKind,
        encryptedArtifactPath: artifactPaths.encryptedArtifactPath,
        encryptionEnvelopePath: artifactPaths.envelopePath,
        manifestPath: artifactPaths.manifestPath,
        extraManifestPath: artifactPaths.extraManifestPath,
        baseManifestHash:
          captureKind === "increment"
            ? turnBoundary.lastAcceptedManifestHash
            : undefined,
        nextManifestHash: manifestHash,
        baseExtraManifestHash: extraDelta?.baseExtraManifestHash,
        nextExtraManifestHash: extraManifestHash,
        createdAt: nowMs,
        attribution: attribution,
      },
    ),
      // 立即踢上传状态机；不 await 结果也不因失败回滚采集
      this.uploadWorker.flushWorkspace({
        workspacePath: intent.workspacePath,
        workspaceIdentity: intent.workspaceIdentity,
        traceId: intent.traceId,
      }));
  }
};

/* keepNames: removeGeneratedArtifactFiles -> removeGeneratedArtifactFiles */
/**
 * 并发清理一轮采集生成过的所有产物（Promise.allSettled：单个失败不影响
 * 其余）。明文包必须删；密文/信封/清单在登记待传前失败时也一并清。
 */
async function removeGeneratedArtifactFiles(paths) {
  await Promise.allSettled([
    rm(paths.plaintextArchivePath, { force: true }),
    rm(paths.encryptedArtifactPath, { force: true }),
    rm(paths.envelopePath, { force: true }),
    rm(paths.manifestPath, { force: true }),
    ...(paths.extraManifestPath
      ? [rm(paths.extraManifestPath, { force: true })]
      : []),
  ]);
}
