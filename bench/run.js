// 场景 runner — bench 专用。所有场景都在容器内本地跑：上传走回环 mock，凭证进程内生成。
// 用法：node run.js --scenario <name> [--repo DIR] [--state-dir DIR] [--out FILE] ...
'use strict';
const { randomBytes } = require('node:crypto');
const { mkdir, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const P = require('./lib/pipeline');
const { PendingManager, PendingStateStore } = require('./lib/state');
const { UploadClient, UploadWorker } = require('./lib/worker');
const { createOssSinkServer } = require('./lib/ossmock');
const { phase, startMemorySampler, writeResults, ioSnapshot, ioDelta } = require('./lib/metrics');

function parseArgs() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^-+/, '')] = a[i + 1];
  return out;
}
const args = parseArgs();
const scenario = args['scenario'];
const repo = args['repo'] || '/tmp/repo';
const stateDir = args['state-dir'] || '/tmp/bench-state';
const out = args['out'] || '/tmp/result.json';
const mb = Number(args['mb'] || 256);
const method = args['method'] || 'post';
const throttleMbps = Number(args['throttle-mbps'] || 0);
const mutateCount = Number(args['mutate'] || 50);
const maxArtifactBytes = Number(args['max-artifact-mb'] || 512) * 1024 * 1024;

async function mkArtifact(file, mbSize) {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const { stat } = require('node:fs/promises');
    const s = await stat(file);
    if (Math.abs(s.size - mbSize * 1024 * 1024) < 1024) return;
  } catch {}
  const chunk = 1024 * 1024;
  const handle = require('node:fs').openSync(file, 'w');
  for (let i = 0; i < mbSize; i++) require('node:fs').writeSync(handle, randomBytes(chunk));
  require('node:fs').closeSync(handle);
}

async function runPipeline(kind, workspaceDir, baseManifest, extra = {}) {
  const scan = await P.scanRepoSnapshot({ workspacePath: workspaceDir, createdAt: Date.now() });
  const manifestHash = P.computeManifestHash(scan.manifest);
  let delta;
  let included = scan.files;
  if (kind === 'increment' && baseManifest) {
    delta = P.buildRepoSnapshotDelta({
      baseManifest, nextManifest: scan.manifest,
      baseManifestHash: extra.baseManifestHash, nextManifestHash: manifestHash,
    });
    const changed = delta.addedOrModified.map((f) => f.path);
    included = P.selectDeltaFiles(scan.files, changed);
  }
  const groupId = `${manifestHash}.${Date.now()}`;
  const paths = P.getArtifactPaths(path.join(stateDir, 'ws'), groupId);
  const uploadKey = extra.uploadKey;
  let artifact;
  await phase(`pack-encrypt-${kind}`, async () => {
    artifact = await P.createEncryptedRepoSnapshotArtifact({
      kind,
      snapshotId: uploadKey.snapshotId,
      workspaceKeyHash: 'bench-wsk',
      manifestHash,
      baseManifestHash: kind === 'increment' ? extra.baseManifestHash : undefined,
      prompt: { schema: 'repo_snapshot_prompt/v2', messageId: 'bench', content: 'bench prompt' },
      manifest: scan.manifest,
      delta,
      files: included,
      paths,
      uploadKey,
      maxEncryptedArtifactBytes: maxArtifactBytes,
    });
  });
  return { scan, manifestHash, delta, included, artifact, paths };
}

async function main() {
  const sampler = startMemorySampler(50);
  const io0 = ioSnapshot();
  const result = { scenario, args: { repo, mb, method, throttleMbps }, meta: { node: process.version, pid: process.pid } };
  try {
    if (scenario === 'scan') {
      const scan = await phase('scan', () => P.scanRepoSnapshot({ workspacePath: repo }));
      Object.assign(result, {
        fileCount: scan.files.length,
        includedBytes: scan.manifest.stats.includedBytes,
        excludedBinary: scan.excludedBinary,
        scanTiming: scan.timing,
      });
    } else if (scenario === 'pipeline-baseline') {
      const uploadKey = {
        snapshotId: 'snap-bench', keyId: 'k1', publicKeySpkiPem: P.serverPublicKeyPem,
      };
      const r = await runPipeline('baseline', repo, null, { uploadKey });
      Object.assign(result, {
        fileCount: r.scan.files.length,
        includedBytes: r.scan.manifest.stats.includedBytes,
        scanTiming: r.scan.timing,
        plaintextBytes: r.included.reduce((s, f) => s + f.sizeBytes, 0),
        encryptedSizeBytes: r.artifact.encryptedSizeBytes,
      });
    } else if (scenario === 'cycle') {
      // baseline → 等长改写 mutate 个文件 → increment（对齐"上一轮已被服务端接受"的前置）
      const uploadKey = {
        snapshotId: 'snap-bench', keyId: 'k1', publicKeySpkiPem: P.serverPublicKeyPem,
      };
      const base = await runPipeline('baseline', repo, null, { uploadKey });
      const { spawnSync } = require('node:child_process');
      const t0 = Date.now();
      spawnSync('node', [path.join(__dirname, 'gen-fixtures.js'), '--dir', repo, '--mutate', String(mutateCount)], { stdio: 'inherit' });
      result.mutateMs = Date.now() - t0;
      const inc = await runPipeline('increment', repo, base.scan.manifest, {
        uploadKey, baseManifestHash: base.manifestHash,
      });
      Object.assign(result, {
        fileCount: base.scan.files.length,
        includedBytes: base.scan.manifest.stats.includedBytes,
        baselineEncryptedBytes: base.artifact.encryptedSizeBytes,
        incrementEncryptedBytes: inc.artifact.encryptedSizeBytes,
        incrementFileCount: inc.included.length,
        deltaDetectedChanges: inc.delta ? inc.delta.addedOrModified.length : null,
        deltaDeleted: inc.delta ? inc.delta.deleted.length : null,
        mutatedFiles: mutateCount,
        deltaMissed: mutateCount - (inc.delta ? inc.delta.addedOrModified.length : 0),
        scanTiming: inc.scan.timing,
      });
    } else if (scenario === 'e2e') {
      const sink = await createOssSinkServer({ throttleMbps });
      const client = new UploadClient({ ossBase: sink.url });
      const store = new PendingStateStore(path.join(stateDir, 'ws'));
      const manager = new PendingManager(store);
      const worker = new UploadWorker({ uploadClient: client, pendingManager: manager });
      const uploadKey = await client.getUploadKey({ workspaceId: 'bench-wsk', maxSizeBytes: maxArtifactBytes });
      const t0 = Date.now();
      const r = await runPipeline('baseline', repo, null, { uploadKey });
      const groupId = `${r.manifestHash}.${Date.now()}`;
      await phase('register', () => manager.registerPendingUpload({
        groupId,
        uploadCredentialHandle: uploadKey.uploadCredentialHandle,
        kind: 'baseline',
        encryptedArtifactPath: r.artifact.encryptedArtifactPath,
        encryptionEnvelopePath: r.artifact.envelopePath,
        manifestPath: r.artifact.manifestPath,
        baseManifestHash: undefined,
        nextManifestHash: r.manifestHash,
        createdAt: Date.now(),
      }));
      await phase('flush-upload', () => worker.flushWorkspace({ workspacePath: 'bench-ws' }));
      result.totalPromptBlockingMs = Date.now() - t0;
      Object.assign(result, {
        fileCount: r.scan.files.length,
        includedBytes: r.scan.manifest.stats.includedBytes,
        encryptedSizeBytes: r.artifact.encryptedSizeBytes,
        scanTiming: r.scan.timing,
        attemptLog: worker.attemptLog,
        finalStateAcceptedHash: (await store.read()).lastAcceptedManifestHash,
      });
      await sink.close();
    } else if (scenario === 'upload-probe') {
      const file = path.join(stateDir, `probe-${mb}mb.enc`);
      await phase('gen-artifact', () => mkArtifact(file, mb));
      const sink = await createOssSinkServer({ throttleMbps });
      const client = new UploadClient({ ossBase: sink.url });
      const t0 = Date.now();
      const upload = await phase(`upload-${method}`, () => client.uploadObject({
        target: { method: method.toUpperCase(), url: sink.url, formFields: { key: 'bench/x.enc' } },
        artifactPath: file,
      }));
      Object.assign(result, {
        uploadWallMs: Date.now() - t0,
        uploadOk: upload.ok,
        uploadMessage: upload.message?.slice(0, 300),
        artifactBytes: mb * 1024 * 1024,
        effectiveMbps: +((mb * 8) / ((Date.now() - t0) / 1000)).toFixed(1),
      });
      await sink.close();
      await rm(file, { force: true });
    } else if (scenario === 'reject-after-hash') {
      const file = path.join(stateDir, `probe-${mb}mb.enc`);
      await mkArtifact(file, mb);
      const t0 = Date.now();
      const digest = await P.sha256File(file);
      const hashMs = Date.now() - t0;
      Object.assign(result, {
        artifactBytes: mb * 1024 * 1024,
        hashMsBeforeKeyExpired: hashMs,
        digestPrefix: digest.slice(0, 16),
        counterfactualPrecheckMs: 0,
      });
      await rm(file, { force: true });
    } else if (scenario === 'manifest-scale') {
      const count = Number(args['count'] || 100000);
      const files = [];
      for (let i = 0; i < count; i++) files.push({ path: `src/pkg${Math.floor(i / 25) % 40}/mod${Math.floor(i / 500)}/file${i}.ts`, sizeBytes: 4000 + (i % 9000) });
      const manifest = { schema: 'repo_snapshot_manifest/v2', workspaceKey: '/tmp/repo', createdAt: 0, files, stats: { includedFileCount: count, includedBytes: 0 } };
      const h0 = process.memoryUsage().heapUsed;
      let hash;
      await phase('hash', () => { hash = P.computeManifestHash(manifest); });
      let json2, json3;
      await phase('stringify-x2', () => {
        json2 = Buffer.from(JSON.stringify(manifest, null, 2)); // tar meta 条目
        json3 = JSON.stringify(manifest, null, 2); // atomicWriteJson 再来一遍
      });
      await phase('parse', () => { JSON.parse(json3); });
      Object.assign(result, {
        count, manifestJsonBytes: json2.length, hashPrefix: hash.slice(0, 12),
        heapDeltaMB: +(((process.memoryUsage().heapUsed - h0) / 1048576)).toFixed(1),
      });
    } else {
      throw new Error('unknown scenario: ' + scenario);
    }
  } finally {
    result.phases = phase.results;
    result.memory = sampler.stop();
    result.ioTotal = ioDelta(io0, ioSnapshot());
    await writeResults(out, result);
    console.log(JSON.stringify({ scenario, ok: true, out, phases: phase.results, memory: result.memory }, null, 1));
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exitCode = 1;
});
