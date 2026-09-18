/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../03-encrypt-archive.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: encryptArchive -> encryptArchive */
async function encryptArchive(e) {
  // y_e=mkdir, w_e=dirname, v_e=randomBytes, Xst=createCipheriv
  // ect=createWriteStream, rct=writeNoncePrefix, nct=pipeline
  // b_e=createReadStream, Qst=publicEncrypt, Jst=crypto.constants
  // df=writeJson, tct=fs.stat
  (await y_e(w_e(e.encryptedArtifactPath), { recursive: !0 }),
    await y_e(w_e(e.envelopePath), { recursive: !0 }));
  let t = v_e(32), // 32B AES-256 data key
    r = v_e(16); // 16B CTR IV, written as ciphertext prefix
  e.signal?.throwIfAborted();
  let o = await sha256File(e.plaintextArchivePath, e.signal),
    n = Xst("aes-256-ctr", t, r),
    i = ect(e.encryptedArtifactPath, { signal: e.signal });
  (await rct(i, r),
    await nct(b_e(e.plaintextArchivePath, { signal: e.signal }), n, i, {
      signal: e.signal,
    }));
  let s = {
    ...e.envelopeInput,
    encryptedDataKey: Qst(
      {
        key: e.uploadKey.publicKeySpkiPem,
        padding: Jst.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      t,
    ).toString("base64"),
    plaintextSha256: o,
  };
  await df(e.envelopePath, s);
  let c = await tct(e.encryptedArtifactPath);
  return {
    encryptedArtifactPath: e.encryptedArtifactPath,
    envelopePath: e.envelopePath,
    manifestPath: "",
    envelope: s,
    encryptedSizeBytes: c.size,
    encryptedSha256: await sha256File(e.encryptedArtifactPath, e.signal),
  };
}

/* keepNames: ldt -> sha256File */
async function ldt(e) {
  let t = adt("sha256");
  return (
    await new Promise((r, o) => {
      let n = sdt(e);
      (n.on("data", (i) => t.update(i)), n.on("error", o), n.on("end", r));
    }),
    t.digest("hex")
  );
}

/* keepNames: rct -> writeNoncePrefix */
async function rct(e, t) {
  await new Promise((r, o) => {
    e.write(t, (n) => {
      if (n) {
        o(n);
        return;
      }
      r();
    });
  });
}

/* keepNames: normalizeTarPath -> normalizeTarPath */
function normalizeTarPath(e) {
  let t = e.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!t || t.split("/").some((r) => !r || r === ".."))
    throw new Error(`invalid repo snapshot artifact path: ${e}`);
  return t;
}
