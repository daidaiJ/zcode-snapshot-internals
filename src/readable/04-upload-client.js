/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../04-upload-client.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: RepoSnapshotUploadClient -> RepoSnapshotUploadClient */
var RepoSnapshotUploadClient = class {
  apiClient;
  objectUploadFetch;
  credentialTimeoutMs;
  objectUploadTimeoutMs;
  uploadCredentialsByHandle = new Map();
  constructor(t) {
    ((this.apiClient = t.apiClient),
      (this.objectUploadFetch = t.objectUploadFetch),
      (this.credentialTimeoutMs = t.credentialTimeoutMs ?? Hlt),
      (this.objectUploadTimeoutMs = t.objectUploadTimeoutMs ?? Klt));
  }
  async getUploadCredential(t, r, o) {
    let n = buildUploadCredentialUrl(r),
      i = await Ot(this.apiClient, n, {
        method: "GET",
        headers: qlt(t),
        timeoutMs: this.credentialTimeoutMs,
        signal: o,
      }),
      s = resolveUploadCredentialData(i);
    return s ? (assertSupportedEncryption(s), s) : null;
  }
  pruneExpiredUploadCredentials(t = Date.now()) {
    for (let [r, o] of this.uploadCredentialsByHandle)
      o.expiresAt <= t && this.uploadCredentialsByHandle.delete(r);
  }
  async getUploadKey(t, r, o, n) {
    let i = await this.getUploadCredential(t, r, n?.signal);
    if (!i) return null;
    this.pruneExpiredUploadCredentials();
    let s = Blt();
    return (
      this.uploadCredentialsByHandle.set(s, {
        credential: i,
        tokenHash: uploadCredentialTokenHash(t),
        workspaceId: r,
        expiresAt: Date.now() + Glt,
      }),
      {
        schema: aee,
        uploadCredentialHandle: s,
        snapshotId: i.snapshot.snapshot_id,
        ...(i.snapshot.base_snapshot_id?.trim()
          ? { baseSnapshotId: i.snapshot.base_snapshot_id.trim() }
          : {}),
        keyId: String(i.encryption.key_version),
        keyWrapAlgorithm: "rsa-oaep-sha256",
        publicKeySpkiPem: normalizePublicKeySpkiPem(i.encryption.public_key),
        ...(i.max_size !== void 0 ? { maxSizeBytes: i.max_size } : {}),
      }
    );
  }
  async requestUploadTarget(t, r, o, n) {
    this.pruneExpiredUploadCredentials();
    let i = this.uploadCredentialsByHandle.get(r.uploadCredentialHandle);
    return i
      ? i.workspaceId !== r.workspaceKeyHash ||
        i.tokenHash !== uploadCredentialTokenHash(t)
        ? {
            ok: !1,
            reason: "key_expired",
            message:
              "repo snapshot upload credential handle does not match request identity",
          }
        : rdt({ request: r, credential: i.credential })
      : {
          ok: !1,
          reason: "key_expired",
          message:
            "repo snapshot upload credential handle unavailable or expired",
        };
  }
  consumeUploadCredential(t) {
    this.uploadCredentialsByHandle.delete(t);
  }
  async uploadObject(t) {
    let r = this.objectUploadFetch ?? Wlt,
      o = AbortSignal.timeout(this.objectUploadTimeoutMs),
      n = t.signal ? AbortSignal.any([t.signal, o]) : o;
    try {
      let i =
          t.target.method === "PUT"
            ? await uploadPutObject({
                fetchImpl: r,
                target: t.target,
                artifactPath: t.artifactPath,
                signal: n,
              })
            : await uploadPostObject({
                fetchImpl: r,
                target: t.target,
                artifactPath: t.artifactPath,
                signal: n,
              }),
        s = i.ok ? void 0 : await readResponseBodyPreview(i);
      return i.ok
        ? { ok: !0, etag: i.headers.get("etag") ?? void 0 }
        : {
            ok: !1,
            reason: "object_upload_failed",
            message: s ? `HTTP ${i.status}: ${s}` : `HTTP ${i.status}`,
          };
    } catch (i) {
      return {
        ok: !1,
        reason: "object_upload_failed",
        message: i instanceof Error ? i.message : String(i),
      };
    }
  }
};

/* keepNames: buildUploadCredentialUrl -> buildUploadCredentialUrl */
function buildUploadCredentialUrl(e) {
  let t = new URL(qve);
  return (t.searchParams.set("workspace_id", e), t.toString());
}

/* keepNames: qlt -> authHeaders */
function qlt(e) {
  return { Authorization: `Bearer ${e}` };
}

/* keepNames: uploadCredentialTokenHash -> uploadCredentialTokenHash */
function uploadCredentialTokenHash(e) {
  return Flt("sha256").update(e).digest("hex");
}
