// 快照热路径重建件（reconstruction）—— 按 readable-2.0 逐函数对齐，但**不是 ZCode 代码**。
// 目的：在配额容器里复现 01→03/09 的性能形状（串行扫描、size-only 增量、
// tar.gz 流式写、AES-256-CTR 信封加密、sha256 多趟），供热点定位与短板测量。
// 外部依赖全部本地化：RSA "服务端公钥" 本地生成；无任何真实网络调用。
'use strict';
const { spawn } = require('node:child_process');
const {
  createHash, createCipheriv, randomBytes, publicEncrypt, generateKeyPairSync,
  constants: cryptoConstants,
} = require('node:crypto');
const {
  mkdir, readdir, readFile, rename, rm, stat, lstat, open,
} = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { join, dirname, relative, sep } = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');
const { once } = require('node:events');
const { writeTarEntry } = require('./tar');

const SAMPLE_BYTES = 16 * 1024; // readSample 采样上限（原文未摘录，取 16KB）
const ENCRYPTION_OVERHEAD_BYTES = 16;

// ── 扫描车道（09.scanRepoSnapshot 语义）────────────────────────────

// 优先 git ls-files（原文 listGitVisibleFiles）；失败/为空返回 null 走全盘递归
function listGitVisibleFiles(root) {
  return new Promise((resolve) => {
    const child = spawn('git', ['ls-files', '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0 || !out.trim()) return resolve(null);
      resolve(out.split('\0').filter(Boolean).map((p) => join(root, p)));
    });
  });
}

// 全盘递归兜底（原文 walkFiles）：串行 readdir 递归
async function walkFiles(root, dir, acc) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkFiles(root, p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}

// 显式补 .git 根元数据（HEAD/config/packed-refs），对齐 appendRootGitMetadataPaths
async function appendRootGitMetadataPaths(root, candidates) {
  const extra = [join(root, '.git', 'HEAD'), join(root, '.git', 'config'), join(root, '.git', 'packed-refs')];
  const existing = new Set(candidates);
  const out = [...candidates];
  for (const p of extra) {
    try { await stat(p); if (!existing.has(p)) out.push(p); } catch {}
  }
  return out;
}

async function readSample(filePath) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(SAMPLE_BYTES);
    const { bytesRead } = await fh.read(buf, 0, SAMPLE_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function looksBinary(sample) {
  if (!sample.length) return false;
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const b of sample) if (b < 9 || (b > 13 && b < 32)) suspicious++;
  return suspicious / sample.length > 0.3;
}

// 串行 lstat + 采样 + 过滤 —— 与原文逐文件 await 的串行循环一致（热点）
async function scanRepoSnapshot(request) {
  const t0 = Date.now();
  const gitList = await listGitVisibleFiles(request.workspacePath);
  const tGit = Date.now();
  let discovered;
  if (gitList) discovered = gitList;
  else discovered = await walkFiles(request.workspacePath, request.workspacePath, []);
  const tWalk = Date.now();
  const candidatePaths = await appendRootGitMetadataPaths(request.workspacePath, discovered);
  const includedFiles = [];
  let excludedBinary = 0;
  for (const absolutePath of candidatePaths) {
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const isSymlink = stats.isSymbolicLink();
    if (!stats.isFile() && !isSymlink) continue;
    const rel = toRepoRelativePath(request.workspacePath, absolutePath);
    const sample = isSymlink ? Buffer.alloc(0) : await readSample(absolutePath);
    if (!isSymlink && looksBinary(sample)) { excludedBinary++; continue; }
    includedFiles.push({
      absolutePath, path: rel, sizeBytes: stats.size,
      modifiedTimeMs: stats.mtimeMs, changeTimeMs: stats.ctimeMs,
    });
  }
  includedFiles.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    schema: 'repo_snapshot_manifest/v2',
    workspaceKey: request.workspacePath,
    createdAt: request.createdAt ?? Date.now(),
    files: includedFiles.map(({ path, sizeBytes }) => ({ path, sizeBytes })),
    stats: {
      includedFileCount: includedFiles.length,
      includedBytes: includedFiles.reduce((s, f) => s + f.sizeBytes, 0),
    },
  };
  return {
    files: includedFiles,
    manifest,
    excludedBinary,
    timing: { gitMs: tGit - t0, walkMs: tWalk - tGit, statSampleMs: Date.now() - tWalk },
  };
}

function toRepoRelativePath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join('/');
}

// ── manifest 哈希 / 增量（09 + 02 语义）───────────────────────────

function canonicalizeManifestForHash(manifest) {
  return {
    schema: 'repo_snapshot_manifest_hash/v1',
    workspaceKey: manifest.workspaceKey,
    files: [...manifest.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
  };
}

function computeManifestHash(manifest) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeManifestForHash(manifest)))
    .digest('hex');
}

// size-only 比较 —— 原文语义（同尺寸内容修改会被漏掉，缺陷见 docs/analysis）
function buildRepoSnapshotDelta({ baseManifest, nextManifest, baseManifestHash, nextManifestHash }) {
  const baseFiles = new Map(baseManifest.files.map((f) => [f.path, f]));
  const nextFiles = new Map(nextManifest.files.map((f) => [f.path, f]));
  const addedOrModified = nextManifest.files
    .filter((f) => {
      const b = baseFiles.get(f.path);
      return !b || b.sizeBytes !== f.sizeBytes;
    })
    .map(({ path, sizeBytes }) => ({ path, sizeBytes }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const deleted = baseManifest.files
    .filter((f) => !nextFiles.has(f.path))
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));
  return { schema: 'repo_snapshot_delta/v2', baseManifestHash, nextManifestHash, addedOrModified, deleted };
}

function selectDeltaFiles(files, changedPaths) {
  const set = new Set(changedPaths);
  return files.filter((f) => set.has(f.path));
}

// ── tar.gz（09.writeGzipTar* 语义：tmp+rename、逐条目限额检查）────

class GzipOutputTooLargeError extends Error {
  constructor(actualOutputBytes) {
    super(`gzip output too large: ${actualOutputBytes}`);
    this.code = 'GZIP_TOO_LARGE';
    this.actualOutputBytes = actualOutputBytes;
  }
}

function assertGzipOutputWithinLimit(output, maxOutputBytes) {
  if (maxOutputBytes !== undefined && output.bytesWritten > maxOutputBytes) {
    throw new GzipOutputTooLargeError(output.bytesWritten);
  }
}

async function writeGzipTarToPath(entries, outputPath, options = {}) {
  options.signal?.throwIfAborted();
  const output = createWriteStream(outputPath);
  const gzip = createGzip();
  const onAbort = () => {
    const reason =
      options.signal?.reason instanceof Error
        ? options.signal.reason
        : Object.assign(new Error('cancelled'), { name: 'AbortError' });
    gzip.destroy(reason);
    output.destroy(reason);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  gzip.pipe(output);
  const finished = new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
    gzip.on('error', reject);
  });
  finished.catch(() => {});
  const assertLimit = () => {
    options.signal?.throwIfAborted();
    assertGzipOutputWithinLimit(output, options.maxOutputBytes);
  };
  try {
    assertLimit();
    for (const entry of entries) {
      await writeTarEntry(gzip, entry);
      assertLimit();
    }
    gzip.end(Buffer.alloc(1024));
    await finished;
    assertGzipOutputWithinLimit(output, options.maxOutputBytes);
  } catch (error) {
    gzip.unpipe(output);
    gzip.destroy();
    output.destroy();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

async function writeGzipTar(entries, outputPath, options = {}) {
  await mkdir(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    await writeGzipTarToPath(entries, tempPath, options);
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    await rm(outputPath, { force: true });
    throw error;
  }
}

// ── 加密（03.encryptArchive 语义：CTR + RSA-OAEP，明文 sha256 无信号）──

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath); // 原文此处的读取流不带 signal
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function writeNoncePrefix(stream, noncePrefix) {
  await new Promise((resolve, reject) => {
    stream.write(noncePrefix, (error) => (error ? reject(error) : resolve()));
  });
}

// bench 本地"服务端密钥"——真实链路里公钥来自凭证接口下发
const serverKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serverPublicKeyPem = serverKeyPair.publicKey.export({ type: 'spki', format: 'pem' });

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const { writeFile } = require('node:fs/promises');
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

async function encryptArchive(input) {
  await mkdir(dirname(input.encryptedArtifactPath), { recursive: true });
  await mkdir(dirname(input.envelopePath), { recursive: true });
  const dataKey = randomBytes(32);
  const noncePrefix = randomBytes(16);
  input.signal?.throwIfAborted();
  const plaintextSha256 = await sha256File(input.plaintextArchivePath);
  const cipher = createCipheriv('aes-256-ctr', dataKey, noncePrefix);
  const cipherOutput = createWriteStream(input.encryptedArtifactPath, { signal: input.signal });
  await writeNoncePrefix(cipherOutput, noncePrefix);
  await pipeline(
    createReadStream(input.plaintextArchivePath, { signal: input.signal }),
    cipher,
    cipherOutput,
    { signal: input.signal },
  );
  const envelope = {
    ...input.envelopeInput,
    encryptedDataKey: publicEncrypt(
      { key: input.uploadKey.publicKeySpkiPem, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      dataKey,
    ).toString('base64'),
    plaintextSha256,
  };
  await atomicWriteJson(input.envelopePath, envelope);
  const encryptedStat = await stat(input.encryptedArtifactPath);
  return {
    encryptedArtifactPath: input.encryptedArtifactPath,
    envelopePath: input.envelopePath,
    envelope,
    encryptedSizeBytes: encryptedStat.size,
    encryptedSha256: await sha256File(input.encryptedArtifactPath),
  };
}

// ── 打包编排（09.createEncryptedRepoSnapshotArtifact 语义）────────
// 注意保真点：明文 tar.gz 先落盘（稳定路径）再加密，finally 才删 —— 存在明文落盘窗口。

async function writeRepoSnapshotPlainArchive(input) {
  const snapshotId = input.snapshotId;
  const entries = [
    { path: `${snapshotId}/meta/prompt.json`, content: Buffer.from(JSON.stringify(input.prompt, null, 2)), sizeBytes: 0 },
    { path: `${snapshotId}/meta/manifest.json`, content: Buffer.from(JSON.stringify(input.manifest, null, 2)), sizeBytes: 0 },
  ];
  for (const e of entries) e.sizeBytes = e.content.length;
  if (input.kind === 'increment' && input.delta) {
    const c = Buffer.from(JSON.stringify(input.delta, null, 2));
    entries.push({ path: `${snapshotId}/meta/delta.json`, content: c, sizeBytes: c.length });
  }
  for (const file of [...input.files].sort((a, b) => a.path.localeCompare(b.path))) {
    entries.push({ path: `${snapshotId}/files/${file.path}`, absolutePath: file.absolutePath, sizeBytes: file.sizeBytes });
  }
  const maxCompressedBytes =
    input.maxEncryptedArtifactBytes === undefined
      ? undefined
      : Math.max(0, input.maxEncryptedArtifactBytes - ENCRYPTION_OVERHEAD_BYTES);
  try {
    await writeGzipTar(entries, input.outputPath, { maxOutputBytes: maxCompressedBytes, signal: input.signal });
  } catch (error) {
    if (error instanceof GzipOutputTooLargeError && input.maxEncryptedArtifactBytes !== undefined) {
      throw Object.assign(new Error('artifact max size exceeded'), {
        code: 'ARTIFACT_MAX_SIZE_EXCEEDED',
        actualEncryptedArtifactBytes: error.actualOutputBytes + ENCRYPTION_OVERHEAD_BYTES,
      });
    }
    throw error;
  }
}

async function createEncryptedRepoSnapshotArtifact(request) {
  let encryptionSucceeded = false;
  try {
    await writeRepoSnapshotPlainArchive({
      kind: request.kind,
      snapshotId: request.uploadKey.snapshotId,
      prompt: request.prompt,
      manifest: request.manifest,
      delta: request.delta,
      files: request.files,
      outputPath: request.paths.plaintextArchivePath,
      maxEncryptedArtifactBytes: request.maxEncryptedArtifactBytes,
      signal: request.signal,
    });
    await atomicWriteJson(request.paths.manifestPath, request.manifest);
    const result = await encryptArchive({
      plaintextArchivePath: request.paths.plaintextArchivePath,
      encryptedArtifactPath: request.paths.encryptedArtifactPath,
      envelopePath: request.paths.envelopePath,
      uploadKey: request.uploadKey,
      signal: request.signal,
      envelopeInput: {
        schema: 'repo_snapshot_encrypted_artifact/v2',
        contentAlgorithm: 'aes-256-ctr',
        keyWrapAlgorithm: 'rsa-oaep-sha256',
        keyId: request.uploadKey.keyId,
        nonceEncoding: 'ciphertext-prefix-16-byte',
        aad: {
          schema: 'repo_snapshot_encryption_aad/v2',
          workspaceKeyHash: request.workspaceKeyHash,
          kind: request.kind,
          manifestHash: request.manifestHash,
          baseManifestHash: request.baseManifestHash,
          compression: 'tar.gz',
        },
      },
    });
    encryptionSucceeded = true;
    return { ...result, manifestPath: request.paths.manifestPath };
  } finally {
    await rm(request.paths.plaintextArchivePath, { force: true });
    if (!encryptionSucceeded) {
      await Promise.allSettled([
        rm(request.paths.encryptedArtifactPath, { force: true }),
        rm(request.paths.envelopePath, { force: true }),
      ]);
    }
  }
}

function getArtifactPaths(workspaceDir, groupId) {
  return {
    plaintextArchivePath: join(workspaceDir, 'tmp', `${groupId}.tar.gz`),
    encryptedArtifactPath: join(workspaceDir, 'pending', `${groupId}.tar.gz.enc`),
    envelopePath: join(workspaceDir, 'pending', `${groupId}.envelope.json`),
    manifestPath: join(workspaceDir, 'manifests', `${groupId}.manifest.json`),
  };
}

module.exports = {
  scanRepoSnapshot, computeManifestHash, buildRepoSnapshotDelta, selectDeltaFiles,
  writeGzipTar, sha256File, encryptArchive, createEncryptedRepoSnapshotArtifact,
  getArtifactPaths, atomicWriteJson, serverPublicKeyPem,
  GzipOutputTooLargeError,
};
