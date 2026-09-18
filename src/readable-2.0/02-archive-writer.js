/**
 * writeRepoSnapshotPlainArchive — 快照明文归档打包（tar.gz）
 *
 * 上传链路阶段 2/6 · 把 prompt 元数据 + manifest + 增量 + 文件实体组织成一棵
 * tar 目录树（root = snapshotId），交由 writeGzipTar（09-related）压缩落盘。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录（minified 逐字，引用/取证一律用它）：../02-archive-writer.js
 * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容 ──────────────────────────────────────────────
 *   buildRepoSnapshotDelta          两份 manifest 的增量 diff（added/modified/deleted）
 *   fileMap                         manifest.files → path 索引 Map
 *   createBufferTarEntry            内存 tar 条目（meta/*.json 用）
 *   writeRepoSnapshotPlainArchive   归档主编排：meta/ + files/ + extra-*
 *   normalizeTarPath                tar 路径规整（反斜杠→斜杠，拒绝 ..）
 *
 * ── 调用链位置 ──────────────────────────────────────────────
 *   createEncryptedRepoSnapshotArtifact() [09] → writeRepoSnapshotPlainArchive()
 *     → writeGzipTar() [09]；超限错误 RepoSnapshotGzipOutputTooLargeError
 *       在此翻译成 RepoSnapshotArtifactMaxSizeExceededError（差额 = 加密 16B 头）。
 *
 * tar 内目录布局（root = snapshotId）：
 *   meta/prompt.json  meta/manifest.json  [meta/delta.json]
 *   [extra-meta/manifest.json]  [extra-meta/delta.json]
 *   files/<repo-relative-path>  extra-files/<groupId>/<path>
 *
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: buildRepoSnapshotDelta -> buildRepoSnapshotDelta */
/**
 * 计算两份 manifest 的增量：新增或体积变化的文件进 addedOrModified（按
 * 路径排序稳定 diff），基线有而本轮没有的进 deleted。结果带前后 manifest
 * 哈希，供服务端核对基线链。
 */
function buildRepoSnapshotDelta(input) {
  let baseFiles = fileMap(input.baseManifest),
    nextFiles = fileMap(input.nextManifest),
    addedOrModified = input.nextManifest.files
      .filter((nextFile) => {
        let baseEntry = baseFiles.get(nextFile.path);
        return !baseEntry || baseEntry.sizeBytes !== nextFile.sizeBytes;
      })
      .map(({ path, sizeBytes }) => ({ path, sizeBytes }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    deleted = input.baseManifest.files
      .filter((baseFile) => !nextFiles.has(baseFile.path))
      .map((baseFile) => baseFile.path)
      .sort((a, b) => a.localeCompare(b));
  return {
    schema: REPO_SNAPSHOT_DELTA_SCHEMA, // = "repo_snapshot_delta/v2"
    baseManifestHash: input.baseManifestHash,
    nextManifestHash: input.nextManifestHash,
    addedOrModified: addedOrModified,
    deleted: deleted,
  };
}

/* keepNames: fileMap -> fileMap */
/** manifest.files 按 path 建索引，供增量 diff 查 O(1)。 */
function fileMap(manifest) {
  return new Map(manifest.files.map((file) => [file.path, file]));
}

/* keepNames: createBufferTarEntry -> createBufferTarEntry */
/** 把 JS 对象序列化成 2 空格缩进 JSON 的内存 tar 条目（meta/*.json 用）。 */
function createBufferTarEntry(path, content) {
  let jsonBytes = Buffer.from(JSON.stringify(content, null, 2), "utf-8");
  return { path: path, content: jsonBytes, sizeBytes: jsonBytes.byteLength };
}

/* keepNames: writeRepoSnapshotPlainArchive -> writeRepoSnapshotPlainArchive */
/**
 * 归档主编排：meta（prompt/manifest[/delta][/extra-*]）+ files/ +
 * extra-files/ 组装成 tar 条目列表后经 writeGzipTar 压缩落盘。加密会给
 * 密文头部追加 16B nonce（ENCRYPTION_OVERHEAD_BYTES），所以压缩阶段的上限
 * 是 maxEncryptedArtifactBytes 减去这份开销；超限错误在这里换算成对外的
 * RepoSnapshotArtifactMaxSizeExceededError。
 */
// 调用方：createEncryptedRepoSnapshotArtifact（09）；root 目录名 = snapshotId
async function writeRepoSnapshotPlainArchive(input) {
  let snapshotId = normalizeTarPath(input.snapshotId);
  if (!snapshotId)
    throw new Error(
      "repo snapshot artifact requires snapshot id root directory",
    );
  let entries = [
    // prompt.json 内含用户提问原文（content）、模型、会话/消息 id 等归因元数据
    createBufferTarEntry(`${snapshotId}/meta/prompt.json`, input.prompt),
    createBufferTarEntry(`${snapshotId}/meta/manifest.json`, input.manifest),
  ];
  (input.kind === "increment" &&
    input.delta &&
    entries.push(
      createBufferTarEntry(`${snapshotId}/meta/delta.json`, input.delta),
    ),
    input.extraManifest &&
      entries.push(
        createBufferTarEntry(
          `${snapshotId}/extra-meta/manifest.json`,
          input.extraManifest,
        ),
      ),
    input.extraDelta &&
      entries.push(
        createBufferTarEntry(
          `${snapshotId}/extra-meta/delta.json`,
          input.extraDelta,
        ),
      ));
  for (let file of [...input.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  ))
    entries.push({
      path: `${snapshotId}/files/${file.path}`,
      absolutePath: file.absolutePath,
      sizeBytes: file.sizeBytes,
    });
  for (let extraFile of [...(input.extraFiles ?? [])].sort((a, b) =>
    a.groupId === b.groupId
      ? a.path.localeCompare(b.path)
      : a.groupId.localeCompare(b.groupId),
  )) {
    let entryPath = `${snapshotId}/extra-files/${normalizeTarPath(extraFile.groupId)}/${normalizeTarPath(extraFile.path)}`;
    if (extraFile.content) {
      entries.push({
        path: entryPath,
        content: extraFile.content,
        sizeBytes: extraFile.sizeBytes,
      });
      continue;
    }
    if (!extraFile.absolutePath)
      throw new Error(
        `repo snapshot extra file requires content or absolutePath: ${extraFile.groupId}/${extraFile.path}`,
      );
    entries.push({
      path: entryPath,
      absolutePath: extraFile.absolutePath,
      sizeBytes: extraFile.sizeBytes,
    });
  }
  // 给压缩阶段预留 16B 加密头（ENCRYPTION_OVERHEAD_BYTES），见函数 doc
  let maxCompressedBytes =
    input.maxEncryptedArtifactBytes === undefined
      ? undefined
      : Math.max(
          0,
          input.maxEncryptedArtifactBytes - ENCRYPTION_OVERHEAD_BYTES,
        );
  try {
    await writeGzipTar(entries, input.outputPath, {
      maxOutputBytes: maxCompressedBytes,
      signal: input.signal,
    });
  } catch (error) {
    throw error instanceof RepoSnapshotGzipOutputTooLargeError &&
      input.maxEncryptedArtifactBytes !== undefined
      ? new RepoSnapshotArtifactMaxSizeExceededError({
          maxEncryptedArtifactBytes: input.maxEncryptedArtifactBytes,
          actualEncryptedArtifactBytes:
            error.actualOutputBytes + ENCRYPTION_OVERHEAD_BYTES,
        })
      : error;
  }
}

/* keepNames: normalizeTarPath -> normalizeTarPath */
/**
 * tar 路径规整：反斜杠归一为斜杠、去掉开头的 /；空段或 .. 段直接抛错
 * （防路径穿越）。注意：02 与 03 各有一份逐字相同的实现（bundle 内重复），
 * 本仓库按原样分文件保留。
 */
function normalizeTarPath(path) {
  let normalized = path.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.split("/").some((segment) => !segment || segment === "..")
  )
    throw new Error(`invalid repo snapshot artifact path: ${path}`);
  return normalized;
}
