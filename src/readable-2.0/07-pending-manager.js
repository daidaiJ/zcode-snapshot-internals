/**
 * RepoSnapshotPendingManager — 待传队列与状态事务（每工作区一把锁）
 *
 * 上传链路阶段 6b · 采集（01）与上传（06）之间的状态层。每个工作区一份
 * state.json：<root>/<workspaceKey>/state.json，记录 activeUpload /
 * latestPendingUpload 两个槽位与 lastAcceptedManifestHash（基线锚点）。
 * 所有变更经 withWorkspaceLock 串行执行。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../07-pending-manager.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   RepoSnapshotPendingManager   状态事务类（登记/失败/丢弃/接受/自愈）
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   01 captureBeforePromptUnsafe → registerPendingUpload / recordCompressedSize
 *   06 flushActiveUpload         → recordUploadAttempt / discard / fail / markAccepted
 *   09 enforceRepoSnapshotDiskQuota → discardStalePendingForDiskQuota
 *
 * Node 内建别名已还原：fs/promises: readdir/readFile · path.join。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: RepoSnapshotPendingManager -> RepoSnapshotPendingManager */
/**
 * 待传队列与状态事务（类名 = bundle 内 keepNames 原名）。状态文件布局：
 * <root>/<workspaceKey>/state.json，两个槽位 activeUpload /
 * latestPendingUpload + 基线锚点 lastAcceptedManifestHash(/Path) 与
 * lastCompressedSize、failureCount。operationsByWorkspaceKey 是按工作区的
 * Promise 链锁。
 */
var RepoSnapshotPendingManager = class {
  stateRepo;
  maxRetryCount;
  maxRetentionMs;
  now;
  operationsByWorkspaceKey = new Map();
  initializePromise = null;
  constructor(deps) {
    ((this.stateRepo = deps.stateRepo),
      (this.maxRetryCount = deps.maxRetryCount ?? DEFAULT_MAX_RETRY_COUNT),
      (this.maxRetentionMs = deps.maxRetentionMs ?? DEFAULT_MAX_RETENTION_MS),
      (this.now = deps.now ?? Date.now));
  }
  /** 懒初始化（只跑一次）：自愈持久化状态 + 清理 stale 加密产物。 */
  initialize() {
    return (
      (this.initializePromise ??= this.repairPersistedStates()
        .then(() => cleanupStaleRepoSnapshotEncryptedArtifacts())
        .then(() => {})
        .catch(() => {})),
      this.initializePromise
    );
  }
  /** 启动自愈：遍历根目录下每个工作区目录，修 state.json 槽位与残留文件。 */
  async repairPersistedStates() {
    let rootDir = getRepoSnapshotRootDir(),
      entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
    for (let entry of entries) {
      if (!entry.isDirectory()) continue;
      let workspaceDir = join(rootDir, entry.name),
        persisted = await this.readPersistedState(
          join(workspaceDir, "state.json"),
        );
      !persisted?.workspacePath ||
        !persisted.workspaceKey ||
        (await this.repairPersistedState(persisted));
    }
  }
  /** 读 state.json；缺失/损坏一律当 null（自愈视角下宁可重建）。 */
  async readPersistedState(path) {
    try {
      return JSON.parse(await readFile(path, "utf-8"));
    } catch {
      return null;
    }
  }
  /**
   * 单工作区自愈：必需文件齐全的待传才配占槽位；active/latest 都完好但
   * 不是同一条时，latest 降级保留 —— 与登记规则（07.registerPendingUpload）
   * 对齐，再把孤儿产物文件清掉。
   */
  async repairPersistedState(state) {
    let activeUpload = activeUploadOf(state),
      latestPendingUpload = state.latestPendingUpload,
      [activeIntact, latestIntact] = await Promise.all([
        activeUpload
          ? hasRequiredPendingFiles(activeUpload)
          : Promise.resolve(false),
        latestPendingUpload
          ? hasRequiredPendingFiles(latestPendingUpload)
          : Promise.resolve(false),
      ]),
      promotedActive = activeIntact
        ? normalizePendingUpload(activeUpload)
        : latestIntact
          ? normalizePendingUpload(latestPendingUpload)
          : undefined,
      demotedLatest =
        activeIntact &&
        latestIntact &&
        !isSamePendingGroup(activeUpload, latestPendingUpload)
          ? normalizePendingUpload(latestPendingUpload)
          : undefined;
    if (
      !isSameOptionalPendingGroup(activeUpload, promotedActive) ||
      !isSameOptionalPendingGroup(latestPendingUpload, demotedLatest)
    ) {
      await this.stateRepo.write(
        stateWithSlots(state, {
          activeUpload: promotedActive,
          latestPendingUpload: demotedLatest,
        }),
      );
      for (let group of [activeUpload, latestPendingUpload])
        group &&
          !isSamePendingGroup(group, promotedActive) &&
          !isSamePendingGroup(group, demotedLatest) &&
          (await removePendingFileGroup({
            pending: group,
            preserveManifestPaths: protectedManifestPathsForState(
              stateWithSlots(state, {
                activeUpload: promotedActive,
                latestPendingUpload: demotedLatest,
              }),
            ),
          }).catch(() => {}));
    }
  }
  /** 工作区级互斥：所有状态变更挂在同一条 Promise 链上串行执行。 */
  async withWorkspaceLock(input, operation) {
    let workspaceKey = buildRepoSnapshotWorkspaceKey(input),
      chain = (
        this.operationsByWorkspaceKey.get(workspaceKey) ?? Promise.resolve()
      )
        .catch(() => {})
        .then(async () => (await this.initializePromise, operation()));
    this.operationsByWorkspaceKey.set(workspaceKey, chain);
    try {
      return await chain;
    } finally {
      this.operationsByWorkspaceKey.get(workspaceKey) === chain &&
        this.operationsByWorkspaceKey.delete(workspaceKey);
    }
  }
  /**
   * 01 每轮采集前调用：把上一轮已计数的失败固化为 failureCount 并标记
   * failureCountedAt，防止同一次失败被反复计数（退避依据，见 06）。
   */
  async recordFailureCountAtTurnBoundary(input) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (
        !activeUpload ||
        (activeUpload.attemptCount ?? 0) <= 0 ||
        activeUpload.failureCountedAt
      )
        return state;
      let countedActive = normalizePendingUpload({
          ...activeUpload,
          failureCountedAt: this.now(),
        }),
        nextState = stateWithSlots(
          { ...state, failureCount: incrementFailureCount(state.failureCount) },
          {
            activeUpload: countedActive,
            latestPendingUpload: state.latestPendingUpload,
          },
        );
      return (await this.stateRepo.write(nextState), nextState);
    });
  }
  /** 记录本轮加密产物体量（encryptedSizeBytes/workspaceSizeBytes）供配额用。 */
  async recordCompressedSize(input, record) {
    return this.withWorkspaceLock(input, async () => {
      let nextState = {
        ...(await this.stateRepo.read(input)),
        lastCompressedSize: record,
      };
      return (await this.stateRepo.write(nextState), nextState);
    });
  }
  /** 配额吃紧时丢掉已计过失败的 active（stale），给新一轮腾地方；成功返回 true。 */
  async discardStalePendingForDiskQuota(input) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (!activeUpload?.failureCountedAt) return false;
      let latestPendingUpload = state.latestPendingUpload,
        nextState = stateWithSlots(state, {
          activeUpload: latestPendingUpload
            ? normalizePendingUpload(latestPendingUpload)
            : undefined,
          latestPendingUpload: undefined,
        });
      await this.stateRepo.write(nextState);
      try {
        await removePendingFileGroup({
          pending: activeUpload,
          preserveManifestPaths: protectedManifestPathsForState(nextState),
        });
      } catch {}
      return true;
    });
  }
  /**
   * 01 采集完成后登记新待传：无 active 直接占 active 槽；有 active 时新条目
   * 进 latest 槽（排队），被顶掉/替换的旧条目清文件（保 manifest 供自愈）。
   */
  async registerPendingUpload(input, pending) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state),
        latestPendingUpload = state.latestPendingUpload,
        incoming = normalizePendingUpload(pending);
      if (!activeUpload) {
        let idleState = stateWithSlots(state, {
          activeUpload: incoming,
          latestPendingUpload: undefined,
        });
        return (await this.stateRepo.write(idleState), idleState);
      }
      if (
        latestPendingUpload &&
        !isSamePendingGroup(latestPendingUpload, incoming)
      )
        try {
          await removePendingFileGroup({
            pending: latestPendingUpload,
            preserveManifestPaths: protectedManifestPathsForState(
              state,
              incoming,
            ),
          });
        } catch {}
      let nextState = stateWithSlots(state, {
        activeUpload: activeUpload,
        latestPendingUpload: incoming,
      });
      return (await this.stateRepo.write(nextState), nextState);
    });
  }
  /** 06 每次尝试前调用：attemptCount+1 + lastAttemptAt；不匹配返回 null（stale）。 */
  async recordUploadAttempt(input, pending) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (!activeUpload || !isSamePendingGroup(activeUpload, pending))
        return null;
      let countedActive = {
        ...normalizePendingUpload(activeUpload),
        attemptCount: (activeUpload.attemptCount ?? 0) + 1,
        lastAttemptAt: this.now(),
      };
      return (
        await this.stateRepo.write(
          stateWithSlots(state, {
            activeUpload: countedActive,
            latestPendingUpload: state.latestPendingUpload,
          }),
        ),
        countedActive
      );
    });
  }
  /**
   * 普通失败收口：有排队的 latest → 晋升（"promoted"）；重试未超限
   * （shouldExhaustPending：3 次 / 24h 内）→ 保留等下轮（"retained"）；
   * 超限 → 丢弃（"discarded"）。待传已换人返回 "stale"。
   */
  async failPendingUpload(input, pending) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (!activeUpload || !isSamePendingGroup(activeUpload, pending))
        return "stale";
      let latestPendingUpload = state.latestPendingUpload;
      if (latestPendingUpload) {
        let promotedState = stateWithSlots(state, {
          activeUpload: normalizePendingUpload(latestPendingUpload),
          latestPendingUpload: undefined,
        });
        await this.stateRepo.write(promotedState);
        try {
          await removePendingFileGroup({
            pending: activeUpload,
            preserveManifestPaths:
              protectedManifestPathsForState(promotedState),
          });
        } catch {}
        return "promoted";
      }
      if (
        !shouldExhaustPending({
          pending: activeUpload,
          now: this.now(),
          maxRetryCount: this.maxRetryCount,
          maxRetentionMs: this.maxRetentionMs,
        })
      )
        return "retained";
      let clearedState = stateWithSlots(state, {
        activeUpload: undefined,
        latestPendingUpload: undefined,
      });
      await this.stateRepo.write(clearedState);
      try {
        await removePendingFileGroup({
          pending: activeUpload,
          preserveManifestPaths: protectedManifestPathsForState(clearedState),
        });
      } catch {}
      return "discarded";
    });
  }
  /** 明确丢弃（基线失效/凭证过期/超限）：清文件；discardLatest 时连同 latest 一起清。 */
  async discardPendingUpload(input, pending, options) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (!activeUpload || !isSamePendingGroup(activeUpload, pending))
        return "stale";
      let promotedFrom = options?.discardLatest
          ? undefined
          : state.latestPendingUpload,
        nextState = stateWithSlots(state, {
          activeUpload: promotedFrom
            ? normalizePendingUpload(promotedFrom)
            : undefined,
          latestPendingUpload: undefined,
        });
      await this.stateRepo.write(nextState);
      try {
        (await removePendingFileGroup({
          pending: activeUpload,
          preserveManifestPaths: protectedManifestPathsForState(nextState),
        }),
          options?.discardLatest &&
            state.latestPendingUpload &&
            (await removePendingFileGroup({
              pending: state.latestPendingUpload,
              preserveManifestPaths: protectedManifestPathsForState(nextState),
            })));
      } catch {}
      return promotedFrom ? "promoted" : "discarded";
    });
  }
  /**
   * OSS 回调成功后的收尾：写入 lastAcceptedManifestHash/Path —— 下一轮增量的
   * 基线锚点。这也意味着服务端必然留存了这份 manifest（增量 diff 的基线），
   * 「数据立即销毁」的说法与此直接冲突（docs/05）。
   */
  async markAcceptedManifest(input, pending, accepted) {
    return this.withWorkspaceLock(input, async () => {
      let state = await this.stateRepo.read(input),
        activeUpload = activeUploadOf(state);
      if (!activeUpload || !isSamePendingGroup(activeUpload, pending))
        return "stale";
      let promotedFrom = state.latestPendingUpload
          ? normalizePendingUpload(state.latestPendingUpload)
          : undefined,
        nextState = stateWithSlots(
          {
            ...state,
            lastAcceptedManifestHash: accepted.manifestHash,
            lastAcceptedManifestPath: accepted.manifestPath,
            lastAcceptedExtraManifestHash: accepted.extraManifestHash,
            lastAcceptedExtraManifestPath: accepted.extraManifestPath,
          },
          { activeUpload: promotedFrom, latestPendingUpload: undefined },
        );
      await this.stateRepo.write(nextState);
      try {
        await removePendingFileGroup({
          pending: activeUpload,
          preserveManifestPaths: protectedManifestPathsForState(nextState),
        });
      } catch {}
      return promotedFrom ? "promoted" : "idle";
    });
  }
};
