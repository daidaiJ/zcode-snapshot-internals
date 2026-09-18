/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../06-upload-worker.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: RepoSnapshotUploadWorker -> RepoSnapshotUploadWorker */
var RepoSnapshotUploadWorker = class {
  stateRepo;
  uploadClient;
  tokenProvider;
  pendingManager;
  flushesByWorkspaceKey = new Map();
  constructor(t) {
    ((this.stateRepo = t.stateRepo),
      (this.uploadClient = t.uploadClient),
      (this.tokenProvider = t.tokenProvider),
      (this.pendingManager =
        t.pendingManager ??
        new RepoSnapshotPendingManager({ stateRepo: t.stateRepo })));
  }
  async flushWorkspace(t) {
    let r = uo(t),
      n = (this.flushesByWorkspaceKey.get(r) ?? Promise.resolve())
        .catch(() => {})
        .then(() => this.flushWorkspaceLoop(t))
        .catch(() => {})
        .finally(() => {
          this.flushesByWorkspaceKey.get(r) === n &&
            this.flushesByWorkspaceKey.delete(r);
        });
    (this.flushesByWorkspaceKey.set(r, n), await n);
  }
  async flushWorkspaceLoop(t) {
    for (; await this.flushActiveUpload(t););
  }
  async flushActiveUpload(t) {
    let r = await this.stateRepo.read(t),
      o = r.activeUpload ?? r.pendingUpload;
    if (!o) return !1;
    let n = await this.tokenProvider();
    if (!n) return !1;
    let i = await this.pendingManager.recordUploadAttempt(t, o);
    if (!i) return (this.consumePendingCredential(o), !0);
    if (i.failureCountedAt) {
      if (!r.latestPendingUpload) return (this.consumePendingCredential(i), !1);
      let p = await this.pendingManager.discardPendingUpload(t, i);
      return (this.consumePendingCredential(i), p === "promoted");
    }
    let s = i.uploadCredentialHandle?.trim();
    if (!s)
      return (
        (await this.pendingManager.discardPendingUpload(t, i)) === "promoted"
      );
    let c = await this.buildUploadTargetRequest({
        stateWorkspaceKey: r.workspaceKey,
        pending: i,
        uploadCredentialHandle: s,
      }),
      l = await this.uploadClient.requestUploadTarget(n, c, t.traceId);
    if (!l.ok) {
      if (
        l.reason === "base_not_found" ||
        l.reason === "base_invalid" ||
        l.reason === "hash_mismatch"
      )
        return (
          await this.stateRepo.clearAcceptedManifest(t),
          await this.pendingManager.discardPendingUpload(t, i, {
            discardLatest: !0,
          }),
          this.consumePendingCredential(i),
          r.latestPendingUpload &&
            this.consumePendingCredential(r.latestPendingUpload),
          !1
        );
      if (l.reason === "key_expired") {
        let f = await this.pendingManager.discardPendingUpload(t, i);
        return (this.consumePendingCredential(i), f === "promoted");
      }
      if (l.reason === "payload_too_large") {
        let f = await pdt(i.manifestPath);
        await this.pendingManager.recordCompressedSize(t, {
          encryptedSizeBytes: c.encryptedArtifact.encryptedSizeBytes,
          workspaceSizeBytes: f,
          manifestHash: i.nextManifestHash,
          recordedAt: Date.now(),
        });
        let m = await this.pendingManager.discardPendingUpload(t, i);
        return (this.consumePendingCredential(i), m === "promoted");
      }
      let p = await this.pendingManager.failPendingUpload(t, i);
      return (
        p !== "retained" && this.consumePendingCredential(i),
        p === "promoted"
      );
    }
    if (
      !(
        await this.uploadClient.uploadObject({
          target: l.objectUpload,
          artifactPath: i.encryptedArtifactPath,
          traceId: t.traceId,
        })
      ).ok
    ) {
      let p = await this.pendingManager.failPendingUpload(t, i);
      return (
        p !== "retained" && this.consumePendingCredential(i),
        p === "promoted"
      );
    }
    return (
      this.consumePendingCredential(i),
      (await this.pendingManager.markAcceptedManifest(t, i, {
        manifestHash: i.nextManifestHash,
        manifestPath: i.manifestPath,
        extraManifestHash: i.nextExtraManifestHash,
        extraManifestPath: i.extraManifestPath,
      })) === "promoted"
    );
  }
  consumePendingCredential(t) {
    let r = t.uploadCredentialHandle?.trim();
    r && this.uploadClient.consumeUploadCredential(r);
  }
  async buildUploadTargetRequest(t) {
    let [r, o, n] = await Promise.all([
      ddt(t.pending.encryptionEnvelopePath),
      cdt(t.pending.encryptedArtifactPath),
      ldt(t.pending.encryptedArtifactPath),
    ]);
    return {
      schema: see,
      workspaceKeyHash: getRepoSnapshotWorkspaceHash(t.stateWorkspaceKey),
      uploadCredentialHandle: t.uploadCredentialHandle,
      kind: t.pending.kind,
      manifestHash: t.pending.nextManifestHash,
      baseManifestHash: t.pending.baseManifestHash,
      attribution: t.pending.attribution,
      encryptedArtifact: {
        ...r,
        encryptedSizeBytes: o.size,
        encryptedSha256: n,
      },
    };
  }
};

/* keepNames: pdt -> readWorkspaceSizeBytes */
async function pdt(e) {
  try {
    let r = (await udt(e)).stats?.includedBytes;
    return typeof r == "number" && Number.isFinite(r) ? r : void 0;
  } catch {
    return;
  }
}

/* keepNames: ddt -> readEnvelope */
async function ddt(e) {
  return JSON.parse(await SIe(e, "utf-8"));
}

/* keepNames: udt -> readManifest */
async function udt(e) {
  return JSON.parse(await SIe(e, "utf-8"));
}
