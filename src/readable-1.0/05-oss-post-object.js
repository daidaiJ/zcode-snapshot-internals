/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../05-oss-post-object.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: uploadPutObject -> uploadPutObject */
async function uploadPutObject(e) {
  let t = new Headers(e.target.headers),
    r = e.target.checksum;
  return (
    r?.headerName && r.value && t.set(r.headerName, r.value),
    e.fetchImpl(e.target.url, {
      method: "PUT",
      redirect: "error",
      headers: t,
      body: jlt(e.artifactPath),
      duplex: "half",
      signal: e.signal,
    })
  );
}

/* keepNames: uploadPostObject -> uploadPostObject */
async function uploadPostObject(e) {
  let t = new FormData();
  for (let [o, n] of Object.entries(e.target.formFields ?? {})) t.set(o, n);
  let r = await Zlt(e.artifactPath, { type: "application/octet-stream" });
  return (
    t.set("file", r, "repo-snapshot.tar.gz.enc"),
    e.fetchImpl(e.target.url, {
      method: "POST",
      redirect: "error",
      headers: e.target.headers,
      body: t,
      signal: e.signal,
    })
  );
}

/* keepNames: rdt -> buildObjectUploadTarget */
function rdt(e) {
  let { request: t, credential: r } = e,
    o = r.max_size;
  if (o !== void 0 && t.encryptedArtifact.encryptedSizeBytes > o)
    return {
      ok: !1,
      reason: "payload_too_large",
      message: `repo snapshot encrypted artifact exceeds upload credential max_size ${o} bytes`,
      maxSizeBytes: o,
    };
  let n = r.snapshot.snapshot_id;
  if (!n)
    return {
      ok: !1,
      reason: "invalid",
      message: "missing snapshot_id in upload credential response",
    };
  let i = tdt(t.kind),
    s = ossAttributionValues(t.attribution),
    c = `sha256:${t.encryptedArtifact.plaintextSha256}`,
    l = replaceOssCallbackPlaceholders(r.callback.body, {
      update_type: i,
      checksum: c,
      encrypted_aes_key: t.encryptedArtifact.encryptedDataKey,
      "x:update_type": i,
      "x:checksum": c,
      "x:encrypted_aes_key": t.encryptedArtifact.encryptedDataKey,
      "x:base_snapshot_id": r.snapshot.base_snapshot_id ?? "",
      ...ndt(t.attribution),
    });
  return {
    ok: !0,
    snapshotId: n,
    objectKey: r.oss.path,
    objectUpload: {
      method: "POST",
      url: r.oss.host,
      expiresAt: Date.now() + 3600 * 1e3,
      maxBytes: Math.max(t.encryptedArtifact.encryptedSizeBytes, 1),
      formFields: {
        success_action_status: "200",
        policy: r.oss.policy,
        "x-oss-signature": r.oss.x_oss_signature,
        "x-oss-signature-version": r.oss.x_oss_signature_version,
        "x-oss-credential": r.oss.x_oss_credential,
        "x-oss-date": r.oss.x_oss_date,
        key: r.oss.path,
        "x-oss-security-token": r.oss.x_oss_security_token,
        ...s,
        callback: edt({ callback: r.callback, callbackBody: l }),
      },
      callback: { mode: "oss-callback" },
    },
  };
}

/* keepNames: edt -> encodeOssCallback */
function edt(e) {
  return Buffer.from(
    JSON.stringify({
      callbackUrl: e.callback.url,
      callbackBody: e.callbackBody,
      callbackBodyType: e.callback.content_type,
    }),
    "utf-8",
  ).toString("base64");
}

/* keepNames: replaceOssCallbackPlaceholders -> replaceOssCallbackPlaceholders */
function replaceOssCallbackPlaceholders(e, t) {
  return e.replaceAll(/\$\{([^}]+)\}/g, (r, o) =>
    Object.hasOwn(t, o) ? encodeURIComponent(t[o] ?? "") : r,
  );
}
