/**
 * STUDY AID — not ZCode source. Do not quote this file as the original.
 *
 * Reconstruction from ZCode Desktop 3.12.2 / build 4e1c9d87
 *   resources/app.asar → out/host/index.js
 * Cite the original (verbatim minified excerpt): ../02-archive-writer.js
 * Original copyright: Z.ai (智谱). Excerpt for security audit / interoperability.
 *
 * keepNames restored; locals e/t/r remain compiler names. Not executable.
 * Map: ./README.md
 */

/* keepNames: buildRepoSnapshotDelta -> buildRepoSnapshotDelta */
function buildRepoSnapshotDelta(e) {
  let t = fileMap(e.baseManifest),
    r = fileMap(e.nextManifest),
    o = e.nextManifest.files
      .filter((i) => {
        let s = t.get(i.path);
        return !s || s.sizeBytes !== i.sizeBytes;
      })
      .map(({ path: i, sizeBytes: s }) => ({ path: i, sizeBytes: s }))
      .sort((i, s) => i.path.localeCompare(s.path)),
    n = e.baseManifest.files
      .filter((i) => !r.has(i.path))
      .map((i) => i.path)
      .sort((i, s) => i.localeCompare(s));
  return {
    schema: tee,
    baseManifestHash: e.baseManifestHash,
    nextManifestHash: e.nextManifestHash,
    addedOrModified: o,
    deleted: n,
  };
}

/* keepNames: fileMap -> fileMap */
function fileMap(e) {
  return new Map(e.files.map((t) => [t.path, t]));
}

/* keepNames: createBufferTarEntry -> createBufferTarEntry */
function createBufferTarEntry(e, t) {
  let r = Buffer.from(JSON.stringify(t, null, 2), "utf-8");
  return { path: e, content: r, sizeBytes: r.byteLength };
}

/* keepNames: writeRepoSnapshotPlainArchive -> writeRepoSnapshotPlainArchive */
async function writeRepoSnapshotPlainArchive(e) {
  let t = normalizeTarPath(e.snapshotId);
  if (!t)
    throw new Error(
      "repo snapshot artifact requires snapshot id root directory",
    );
  let r = [
    createBufferTarEntry(`${t}/meta/prompt.json`, e.prompt),
    createBufferTarEntry(`${t}/meta/manifest.json`, e.manifest),
  ];
  (e.kind === "increment" &&
    e.delta &&
    r.push(createBufferTarEntry(`${t}/meta/delta.json`, e.delta)),
    e.extraManifest &&
      r.push(
        createBufferTarEntry(`${t}/extra-meta/manifest.json`, e.extraManifest),
      ),
    e.extraDelta &&
      r.push(createBufferTarEntry(`${t}/extra-meta/delta.json`, e.extraDelta)));
  for (let n of [...e.files].sort((i, s) => i.path.localeCompare(s.path)))
    r.push({
      path: `${t}/files/${n.path}`,
      absolutePath: n.absolutePath,
      sizeBytes: n.sizeBytes,
    });
  for (let n of [...(e.extraFiles ?? [])].sort((i, s) =>
    i.groupId === s.groupId
      ? i.path.localeCompare(s.path)
      : i.groupId.localeCompare(s.groupId),
  )) {
    let i = `${t}/extra-files/${normalizeTarPath(n.groupId)}/${normalizeTarPath(n.path)}`;
    if (n.content) {
      r.push({ path: i, content: n.content, sizeBytes: n.sizeBytes });
      continue;
    }
    if (!n.absolutePath)
      throw new Error(
        `repo snapshot extra file requires content or absolutePath: ${n.groupId}/${n.path}`,
      );
    r.push({ path: i, absolutePath: n.absolutePath, sizeBytes: n.sizeBytes });
  }
  let o =
    e.maxEncryptedArtifactBytes === void 0
      ? void 0
      : Math.max(0, e.maxEncryptedArtifactBytes - k_e);
  try {
    await writeGzipTar(r, e.outputPath, {
      maxOutputBytes: o,
      signal: e.signal,
    });
  } catch (n) {
    throw n instanceof Dk && e.maxEncryptedArtifactBytes !== void 0
      ? new Nk({
          maxEncryptedArtifactBytes: e.maxEncryptedArtifactBytes,
          actualEncryptedArtifactBytes: n.actualOutputBytes + k_e,
        })
      : n;
  }
}

/* keepNames: normalizeTarPath -> normalizeTarPath */
function normalizeTarPath(e) {
  let t = e.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!t || t.split("/").some((r) => !r || r === ".."))
    throw new Error(`invalid repo snapshot artifact path: ${e}`);
  return t;
}
