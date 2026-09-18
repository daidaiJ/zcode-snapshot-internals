/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../07-pending-manager.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: RepoSnapshotPendingManager -> RepoSnapshotPendingManager */
var RepoSnapshotPendingManager = class {
  stateRepo;
  maxRetryCount;
  maxRetentionMs;
  now;
  operationsByWorkspaceKey = new Map();
  initializePromise = null;
  constructor(t) {
    ((this.stateRepo = t.stateRepo),
      (this.maxRetryCount = t.maxRetryCount ?? olt),
      (this.maxRetentionMs = t.maxRetentionMs ?? ilt),
      (this.now = t.now ?? Date.now));
  }
  initialize() {
    return (
      (this.initializePromise ??= this.repairPersistedStates()
        .then(() => d$())
        .then(() => {})
        .catch(() => {})),
      this.initializePromise
    );
  }
  async repairPersistedStates() {
    let t = sc(),
      r = await sIe(t, { withFileTypes: !0 }).catch(() => []);
    for (let o of r) {
      if (!o.isDirectory()) continue;
      let n = Uk(t, o.name),
        i = await this.readPersistedState(Uk(n, "state.json"));
      !i?.workspacePath ||
        !i.workspaceKey ||
        (await this.repairPersistedState(i));
    }
  }
  async readPersistedState(t) {
    try {
      return JSON.parse(await elt(t, "utf-8"));
    } catch {
      return null;
    }
  }
  async repairPersistedState(t) {
    let r = ys(t),
      o = t.latestPendingUpload,
      [n, i] = await Promise.all([
        r ? hasRequiredPendingFiles(r) : Promise.resolve(!1),
        o ? hasRequiredPendingFiles(o) : Promise.resolve(!1),
      ]),
      s = n ? ya(r) : i ? ya(o) : void 0,
      c = n && i && !lc(r, o) ? ya(o) : void 0;
    if (
      !isSameOptionalPendingGroup(r, s) ||
      !isSameOptionalPendingGroup(o, c)
    ) {
      await this.stateRepo.write(
        va(t, { activeUpload: s, latestPendingUpload: c }),
      );
      for (let d of [r, o])
        d &&
          !lc(d, s) &&
          !lc(d, c) &&
          (await Cl({
            pending: d,
            preserveManifestPaths: Il(
              va(t, { activeUpload: s, latestPendingUpload: c }),
            ),
          }).catch(() => {}));
    }
  }
  async withWorkspaceLock(t, r) {
    let o = uo(t),
      i = (this.operationsByWorkspaceKey.get(o) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => (await this.initializePromise, r()));
    this.operationsByWorkspaceKey.set(o, i);
    try {
      return await i;
    } finally {
      this.operationsByWorkspaceKey.get(o) === i &&
        this.operationsByWorkspaceKey.delete(o);
    }
  }
  async recordFailureCountAtTurnBoundary(t) {
    return this.withWorkspaceLock(t, async () => {
      let r = await this.stateRepo.read(t),
        o = ys(r);
      if (!o || (o.attemptCount ?? 0) <= 0 || o.failureCountedAt) return r;
      let n = ya({ ...o, failureCountedAt: this.now() }),
        i = va(
          { ...r, failureCount: alt(r.failureCount) },
          { activeUpload: n, latestPendingUpload: r.latestPendingUpload },
        );
      return (await this.stateRepo.write(i), i);
    });
  }
  async recordCompressedSize(t, r) {
    return this.withWorkspaceLock(t, async () => {
      let n = { ...(await this.stateRepo.read(t)), lastCompressedSize: r };
      return (await this.stateRepo.write(n), n);
    });
  }
  async discardStalePendingForDiskQuota(t) {
    return this.withWorkspaceLock(t, async () => {
      let r = await this.stateRepo.read(t),
        o = ys(r);
      if (!o?.failureCountedAt) return !1;
      let n = r.latestPendingUpload,
        i = va(r, {
          activeUpload: n ? ya(n) : void 0,
          latestPendingUpload: void 0,
        });
      await this.stateRepo.write(i);
      try {
        await Cl({ pending: o, preserveManifestPaths: Il(i) });
      } catch {}
      return !0;
    });
  }
  async registerPendingUpload(t, r) {
    return this.withWorkspaceLock(t, async () => {
      let o = await this.stateRepo.read(t),
        n = ys(o),
        i = o.latestPendingUpload,
        s = ya(r);
      if (!n) {
        let l = va(o, { activeUpload: s, latestPendingUpload: void 0 });
        return (await this.stateRepo.write(l), l);
      }
      if (i && !lc(i, s))
        try {
          await Cl({ pending: i, preserveManifestPaths: Il(o, s) });
        } catch {}
      let c = va(o, { activeUpload: n, latestPendingUpload: s });
      return (await this.stateRepo.write(c), c);
    });
  }
  async recordUploadAttempt(t, r) {
    return this.withWorkspaceLock(t, async () => {
      let o = await this.stateRepo.read(t),
        n = ys(o);
      if (!n || !lc(n, r)) return null;
      let i = {
        ...ya(n),
        attemptCount: (n.attemptCount ?? 0) + 1,
        lastAttemptAt: this.now(),
      };
      return (
        await this.stateRepo.write(
          va(o, {
            activeUpload: i,
            latestPendingUpload: o.latestPendingUpload,
          }),
        ),
        i
      );
    });
  }
  async failPendingUpload(t, r) {
    return this.withWorkspaceLock(t, async () => {
      let o = await this.stateRepo.read(t),
        n = ys(o);
      if (!n || !lc(n, r)) return "stale";
      let i = o.latestPendingUpload;
      if (i) {
        let c = va(o, { activeUpload: ya(i), latestPendingUpload: void 0 });
        await this.stateRepo.write(c);
        try {
          await Cl({ pending: n, preserveManifestPaths: Il(c) });
        } catch {}
        return "promoted";
      }
      if (
        !ult({
          pending: n,
          now: this.now(),
          maxRetryCount: this.maxRetryCount,
          maxRetentionMs: this.maxRetentionMs,
        })
      )
        return "retained";
      let s = va(o, { activeUpload: void 0, latestPendingUpload: void 0 });
      await this.stateRepo.write(s);
      try {
        await Cl({ pending: n, preserveManifestPaths: Il(s) });
      } catch {}
      return "discarded";
    });
  }
  async discardPendingUpload(t, r, o) {
    return this.withWorkspaceLock(t, async () => {
      let n = await this.stateRepo.read(t),
        i = ys(n);
      if (!i || !lc(i, r)) return "stale";
      let s = o?.discardLatest ? void 0 : n.latestPendingUpload,
        c = va(n, {
          activeUpload: s ? ya(s) : void 0,
          latestPendingUpload: void 0,
        });
      await this.stateRepo.write(c);
      try {
        (await Cl({ pending: i, preserveManifestPaths: Il(c) }),
          o?.discardLatest &&
            n.latestPendingUpload &&
            (await Cl({
              pending: n.latestPendingUpload,
              preserveManifestPaths: Il(c),
            })));
      } catch {}
      return s ? "promoted" : "discarded";
    });
  }
  async markAcceptedManifest(t, r, o) {
    return this.withWorkspaceLock(t, async () => {
      let n = await this.stateRepo.read(t),
        i = ys(n);
      if (!i || !lc(i, r)) return "stale";
      let s = n.latestPendingUpload ? ya(n.latestPendingUpload) : void 0,
        c = va(
          {
            ...n,
            lastAcceptedManifestHash: o.manifestHash,
            lastAcceptedManifestPath: o.manifestPath,
            lastAcceptedExtraManifestHash: o.extraManifestHash,
            lastAcceptedExtraManifestPath: o.extraManifestPath,
          },
          { activeUpload: s, latestPendingUpload: void 0 },
        );
      await this.stateRepo.write(c);
      try {
        await Cl({ pending: i, preserveManifestPaths: Il(c) });
      } catch {}
      return s ? "promoted" : "idle";
    });
  }
};
