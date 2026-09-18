/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../08-credential-parsing.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: describeUploadCredentialShape -> describeUploadCredentialShape */
function describeUploadCredentialShape(e) {
  return [
    `code=${e.code}`,
    e.msg ? `msg=${e.msg}` : "",
    `responseKeys=${Jm(e)}`,
    `dataKeys=${Jm(e.data)}`,
    `callbackKeys=${Jm(e.data?.callback)}`,
    `ossKeys=${Jm(e.data?.oss)}`,
    `encryptionKeys=${Jm(e.data?.encryption)}`,
    `snapshotKeys=${Jm(e.data?.snapshot)}`,
  ]
    .filter(Boolean)
    .join("; ");
}

/* keepNames: resolveUploadCredentialData -> resolveUploadCredentialData */
function resolveUploadCredentialData(e) {
  if (e.code !== 0)
    throw new Error(
      e.msg || `repo snapshot upload credential failed: code=${e.code}`,
    );
  if (!e.data) return null;
  let t = [],
    r = e.data;
  (r.callback?.url || t.push("callback.url"),
    r.callback?.body || t.push("callback.body"),
    r.callback?.content_type || t.push("callback.content_type"),
    r.oss?.host || t.push("oss.host"),
    r.oss?.path || t.push("oss.path"),
    r.oss?.policy || t.push("oss.policy"),
    r.oss?.x_oss_signature || t.push("oss.x_oss_signature"),
    r.oss?.x_oss_signature_version || t.push("oss.x_oss_signature_version"),
    r.oss?.x_oss_credential || t.push("oss.x_oss_credential"),
    r.oss?.x_oss_security_token || t.push("oss.x_oss_security_token"),
    r.oss?.x_oss_date || t.push("oss.x_oss_date"),
    r.encryption?.public_key || t.push("encryption.public_key"),
    r.encryption?.key_version === void 0 && t.push("encryption.key_version"),
    r.encryption?.algorithm || t.push("encryption.algorithm"),
    r.snapshot?.snapshot_id || t.push("snapshot.snapshot_id"));
  let o = normalizeUploadCredentialMaxSize(r.max_size);
  if (
    (r.max_size !== void 0 &&
      o === void 0 &&
      Ult.warn(
        void 0,
        "upload-credential \u8FD4\u56DE\u4E86\u975E\u6CD5 max_size\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u5B57\u6BB5",
        { max_size: r.max_size, shape: describeUploadCredentialShape(e) },
      ),
    t.length > 0)
  )
    throw new Error(
      `repo snapshot upload credential missing fields: ${t.join(", ")}; ${describeUploadCredentialShape(e)}`,
    );
  let { max_size: n, ...i } = r;
  return { ...i, ...(o !== void 0 ? { max_size: o } : {}) };
}

/* keepNames: Jm -> formatObjectKeys */
function Jm(e) {
  return !e || typeof e != "object"
    ? "none"
    : Object.keys(e).sort().join(",") || "none";
}

/* keepNames: normalizeUploadCredentialMaxSize -> normalizeUploadCredentialMaxSize */
function normalizeUploadCredentialMaxSize(e) {
  if (e == null) return;
  let t = typeof e == "string" ? Number(e) : e;
  if (!(typeof t != "number" || !Number.isFinite(t) || t < 0)) return t;
}

/* keepNames: normalizePublicKeySpkiPem -> normalizePublicKeySpkiPem */
function normalizePublicKeySpkiPem(e) {
  let t = e
    .trim()
    .replaceAll(
      "\\r\\n",
      `
`,
    )
    .replaceAll(
      "\\n",
      `
`,
    )
    .replaceAll(
      `\r
`,
      `
`,
    );
  if (!t.includes("-----BEGIN PUBLIC KEY-----")) return t;
  let r = t.endsWith(`
`)
    ? t
    : `${t}
`;
  try {
    return (yIe(r), r);
  } catch {
    let o = r
      .replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN RSA PUBLIC KEY-----")
      .replace("-----END PUBLIC KEY-----", "-----END RSA PUBLIC KEY-----");
    try {
      return (yIe(o), o);
    } catch {
      return r;
    }
  }
}
