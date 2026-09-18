/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../01-sidecar-service.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: RepoSnapshotSidecarService -> RepoSnapshotSidecarService */
var RepoSnapshotSidecarService = class {
  stateRepo;
  uploadClient;
  uploadWorker;
  pendingManager;
  tokenProvider;
  userIdProvider;
  globalConfigsProvider;
  captureScheduler;
  constructor(t) {
    ((this.stateRepo = t.stateRepo),
      (this.uploadClient = t.uploadClient),
      (this.uploadWorker = t.uploadWorker),
      (this.pendingManager =
        t.pendingManager ??
        new RepoSnapshotPendingManager({ stateRepo: t.stateRepo })),
      (this.tokenProvider = t.tokenProvider),
      (this.userIdProvider = t.userIdProvider),
      (this.globalConfigsProvider = t.globalConfigsProvider),
      (this.captureScheduler = new su({
        jobTimeoutMs: t.captureJobTimeoutMs,
        abortSettleTimeoutMs: t.captureAbortSettleTimeoutMs,
        maxPendingIntents: t.maxPendingCaptureIntents,
      })));
  }
  async captureBeforePrompt(t) {
    t.workspaceIdentity?.trim() ||
      (await this.captureScheduler.schedule(t, async (o) => {
        let n = t.signal ? AbortSignal.any([t.signal, o]) : o;
        await this.captureBeforePromptUnsafe({ ...t, signal: n });
      }));
  }
  getCaptureQueueDiagnostics() {
    return this.captureScheduler.getDiagnostics();
  }
  async resolveUserId() {
    if (this.userIdProvider)
      try {
        return (await this.userIdProvider())?.trim() || void 0;
      } catch {
        return;
      }
  }
  async captureBeforePromptUnsafe(t) {
    t.signal?.throwIfAborted();
    let r = await this.tokenProvider();
    if ((t.signal?.throwIfAborted(), !r)) return;
    let o = Date.now(),
      n = uo(t),
      i = getRepoSnapshotWorkspaceHash(n),
      s = await this.uploadClient.getUploadKey(r, i, t.traceId, {
        signal: t.signal,
      });
    if (!s) return;
    let c = await this.pendingManager.recordFailureCountAtTurnBoundary(t),
      l = resolveRepoSnapshotMaxSizeBytes(s.maxSizeBytes);
    if (!(await enforceRepoSnapshotDiskQuota(this.pendingManager, t, l)))
      return;
    let d;
    if (this.globalConfigsProvider)
      try {
        d = await this.globalConfigsProvider({
          workspacePath: t.workspacePath,
          signal: t.signal,
        });
      } catch (ie) {
        if (t.signal?.aborted) throw ie;
        d = void 0;
      }
    let u = d ? { ...d, ...t.globalConfigs } : t.globalConfigs,
      p = [
        ...buildRepoSnapshotGlobalConfigsExtraInputs(u),
        ...(t.extraFiles ?? []),
      ],
      [f, m] = await Promise.all([
        scanRepoSnapshot({
          workspacePath: t.workspacePath,
          createdAt: o,
          signal: t.signal,
        }),
        Vce({ createdAt: o, inputs: p, signal: t.signal }),
      ]),
      y = computeRepoSnapshotManifestHash(f.manifest),
      w = m.manifest ?? {
        schema: GS,
        createdAt: o,
        groups: [],
        stats: { includedFileCount: 0, includedBytes: 0 },
      },
      S = p4(w),
      C = {
        sessionId: normalizeRepoSnapshotSessionId(t.taskId),
        ...(t.queryId ? { queryId: t.queryId } : {}),
        requestId: Qn(),
        failureCount: c.failureCount ?? 0,
        ...(t.captureStage ? { captureStage: t.captureStage } : {}),
        ...(t.historyRoundCount !== void 0
          ? { historyRoundCount: t.historyRoundCount }
          : {}),
      },
      A = {
        schema: eee,
        ...C,
        messageId: t.messageId,
        provider: t.provider ?? "others",
        model: t.model,
        url: t.url,
        createdAt: o,
        manifestHash: y,
        content: t.content,
      },
      O = !!s.baseSnapshotId?.trim(),
      M =
        O && c.lastAcceptedManifestHash && c.lastAcceptedManifestPath
          ? await readAcceptedManifestCheckpoint({
              manifestPath: c.lastAcceptedManifestPath,
              expectedHash: c.lastAcceptedManifestHash,
              computeHash: computeRepoSnapshotManifestHash,
            })
          : null,
      B =
        O && c.lastAcceptedExtraManifestHash && c.lastAcceptedExtraManifestPath
          ? await Jce({
              manifestPath: c.lastAcceptedExtraManifestPath,
              expectedHash: c.lastAcceptedExtraManifestHash,
            })
          : null,
      L = M ? "increment" : "baseline",
      F = M
        ? buildRepoSnapshotDelta({
            baseManifest: M,
            nextManifest: f.manifest,
            baseManifestHash: c.lastAcceptedManifestHash,
            nextManifestHash: y,
          })
        : void 0,
      E =
        L === "increment" && B
          ? Xce({
              baseExtraManifest: B,
              nextExtraManifest: w,
              baseExtraManifestHash: c.lastAcceptedExtraManifestHash,
              nextExtraManifestHash: S,
            })
          : void 0,
      U = !!F && (F.addedOrModified.length > 0 || F.deleted.length > 0),
      sessionTargetFrom =
        !!E &&
        E.groups.some(
          (ie) => ie.addedOrModified.length > 0 || ie.deleted.length > 0,
        ),
      T =
        L === "baseline"
          ? f.files
          : selectDeltaFiles({
              files: f.files,
              changedPaths: U ? F.addedOrModified.map((ie) => ie.path) : [],
            }),
      Z =
        L === "baseline" || !B
          ? m.files
          : Yce({
              files: m.files,
              changedFiles:
                E?.groups.flatMap((ie) =>
                  ie.addedOrModified.map((me) => ({
                    groupId: ie.groupId,
                    path: me.path,
                  })),
                ) ?? [],
            }),
      q = `${y}.${S}.${o}`,
      Q = getRepoSnapshotArtifactPaths({
        workspaceKey: n,
        manifestHash: y,
        extraManifestHash: S,
        groupId: q,
      }),
      J;
    try {
      J = await createEncryptedRepoSnapshotArtifact({
        kind: L,
        workspaceKeyHash: i,
        manifestHash: y,
        baseManifestHash:
          L === "increment" ? c.lastAcceptedManifestHash : void 0,
        prompt: A,
        manifest: f.manifest,
        delta: U ? F : void 0,
        extraManifest: w,
        extraDelta: sessionTargetFrom ? E : void 0,
        files: T,
        extraFiles: Z,
        paths: Q,
        uploadKey: s,
        maxEncryptedArtifactBytes: l,
        signal: t.signal,
      });
    } catch (ie) {
      if (ie instanceof Nk) {
        (await this.pendingManager.recordCompressedSize(t, {
          encryptedSizeBytes: ie.actualEncryptedArtifactBytes,
          workspaceSizeBytes: f.manifest.stats.includedBytes,
          manifestHash: y,
          recordedAt: o,
        }),
          await removeGeneratedArtifactFiles(Q));
        return;
      }
      throw ie;
    }
    if (
      (await this.pendingManager.recordCompressedSize(t, {
        encryptedSizeBytes: J.encryptedSizeBytes,
        workspaceSizeBytes: f.manifest.stats.includedBytes,
        manifestHash: y,
        recordedAt: o,
      }),
      J.encryptedSizeBytes > l)
    ) {
      await removeGeneratedArtifactFiles(Q);
      return;
    }
    (await this.pendingManager.registerPendingUpload(
      { ...t, traceId: t.traceId },
      {
        groupId: q,
        uploadCredentialHandle: s.uploadCredentialHandle,
        kind: L,
        encryptedArtifactPath: Q.encryptedArtifactPath,
        encryptionEnvelopePath: Q.envelopePath,
        manifestPath: Q.manifestPath,
        extraManifestPath: Q.extraManifestPath,
        baseManifestHash:
          L === "increment" ? c.lastAcceptedManifestHash : void 0,
        nextManifestHash: y,
        baseExtraManifestHash: E?.baseExtraManifestHash,
        nextExtraManifestHash: S,
        createdAt: o,
        attribution: C,
      },
    ),
      this.uploadWorker.flushWorkspace({
        workspacePath: t.workspacePath,
        workspaceIdentity: t.workspaceIdentity,
        traceId: t.traceId,
      }));
  }
};

/* keepNames: removeGeneratedArtifactFiles -> removeGeneratedArtifactFiles */
async function removeGeneratedArtifactFiles(e) {
  await Promise.allSettled([
    Fk(e.plaintextArchivePath, { force: !0 }),
    Fk(e.encryptedArtifactPath, { force: !0 }),
    Fk(e.envelopePath, { force: !0 }),
    Fk(e.manifestPath, { force: !0 }),
    ...(e.extraManifestPath ? [Fk(e.extraManifestPath, { force: !0 })] : []),
  ]);
}
