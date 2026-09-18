// 上传状态机重建件 —— 06-upload-worker + 04（凭证句柄店/超时）+ 05（POST 表单）语义子集。
// 保真点：buildUploadTargetRequest 先读信封 + stat + **全量重算密文 sha256**，之后才
// requestUploadTarget —— 凭证过期也要先付一遍全文件哈希的代价（bench 要量化的浪费）。
// OSS 端点为回环 mock；凭证为进程内生成，无真实网络。
'use strict';
const { randomUUID } = require('node:crypto');
const { createReadStream, openAsBlob } = require('node:fs');
const { stat } = require('node:fs/promises');
const { Readable } = require('node:stream');
const { sha256File, atomicWriteJson, serverPublicKeyPem } = require('./pipeline');

const CREDENTIAL_TTL_MS = 3600 * 1e3;
const OBJECT_UPLOAD_TIMEOUT_MS = 60 * 1e3;

class UploadClient {
  constructor({ ossBase }) {
    this.credentials = new Map();
    this.ossBase = ossBase; // 回环 mock 端点
    this.seq = 0;
  }
  async getUploadKey({ workspaceId, maxSizeBytes }) {
    const handle = randomUUID();
    this.prune();
    this.credentials.set(handle, {
      credential: {
        max_size: maxSizeBytes,
        snapshot: { snapshot_id: `snap-${++this.seq}-${Date.now()}` },
        oss: { host: this.ossBase, path: `bench/${handle}/repo-snapshot.tar.gz.enc` },
        callback: { url: `${this.ossBase}/cb`, body: 'kind=${update_type}', content_type: 'application/x-www-form-urlencoded' },
      },
      workspaceId,
      tokenHash: 'bench-token-hash',
      expiresAt: Date.now() + CREDENTIAL_TTL_MS,
    });
    return {
      schema: 'repo_snapshot_upload_key/v1',
      uploadCredentialHandle: handle,
      snapshotId: `snap-${this.seq}-${Date.now()}`,
      keyId: 'bench-key-1',
      keyWrapAlgorithm: 'rsa-oaep-sha256',
      publicKeySpkiPem: serverPublicKeyPem,
      ...(maxSizeBytes !== undefined ? { maxSizeBytes } : {}),
    };
  }
  prune() {
    const now = Date.now();
    for (const [h, e] of this.credentials) if (e.expiresAt <= now) this.credentials.delete(h);
  }
  consume(handle) {
    this.credentials.delete(handle);
  }
  // 语义同 04.requestUploadTarget + 05.buildObjectUploadTarget：过期/不匹配 → key_expired
  requestUploadTarget(authToken, request) {
    this.prune();
    const cached = this.credentials.get(request.uploadCredentialHandle);
    if (!cached) return { ok: false, reason: 'key_expired', message: 'handle unavailable or expired' };
    if (cached.workspaceId !== request.workspaceKeyHash) {
      return { ok: false, reason: 'key_expired', message: 'identity mismatch' };
    }
    const maxSizeBytes = cached.credential.max_size;
    if (maxSizeBytes !== undefined && request.encryptedArtifact.encryptedSizeBytes > maxSizeBytes) {
      return { ok: false, reason: 'payload_too_large', message: `exceeds max_size ${maxSizeBytes}` };
    }
    const formFields = {
      success_action_status: '200',
      key: cached.credential.oss.path,
      policy: 'bench-policy',
      'x-oss-signature': 'bench-signature',
      'x-oss-signature-version': 'OSS4-HMAC-SHA256',
      'x-oss-credential': 'bench-cred',
      'x-oss-date': new Date().toISOString(),
      'x-oss-security-token': 'bench-sts',
      callback: Buffer.from(JSON.stringify({
        callbackUrl: cached.credential.callback.url,
        callbackBody: `kind=${request.kind}`,
        callbackBodyType: 'application/x-www-form-urlencoded',
      })).toString('base64'),
    };
    return {
      ok: true,
      snapshotId: cached.credential.snapshot.snapshot_id,
      objectUpload: { method: 'POST', url: cached.credential.oss.host, formFields, maxBytes: request.encryptedArtifact.encryptedSizeBytes },
    };
  }
  // 语义同 04.uploadObject：整体 60s 超时；POST 用 openAsBlob（整文件进内存的路径）
  async uploadObject(request) {
    const timeoutSignal = AbortSignal.timeout(OBJECT_UPLOAD_TIMEOUT_MS);
    const merged = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;
    try {
      let response;
      if (request.target.method === 'PUT') {
        response = await fetch(request.target.url, {
          method: 'PUT',
          redirect: 'error',
          body: Readable.toWeb(createReadStream(request.artifactPath)),
          duplex: 'half',
          signal: merged,
        });
      } else {
        const form = new FormData();
        for (const [k, v] of Object.entries(request.target.formFields ?? {})) form.set(k, v);
        const blob = await openAsBlob(request.artifactPath, { type: 'application/octet-stream' });
        form.set('file', blob, 'repo-snapshot.tar.gz.enc');
        response = await fetch(request.target.url, { method: 'POST', redirect: 'error', body: form, signal: merged });
      }
      if (response.ok) return { ok: true, etag: response.headers.get('etag') ?? undefined };
      const body = await response.text().catch(() => '');
      return { ok: false, reason: 'object_upload_failed', message: `HTTP ${response.status}: ${body.slice(0, 200)}` };
    } catch (error) {
      return { ok: false, reason: 'object_upload_failed', message: error?.message ?? String(error) };
    }
  }
}

class UploadWorker {
  constructor({ uploadClient, pendingManager }) {
    this.uploadClient = uploadClient;
    this.pendingManager = pendingManager;
    this.flushChains = new Map();
    this.attemptLog = [];
  }
  async flushWorkspace(trigger) {
    const key = trigger.workspacePath;
    const chain = (this.flushChains.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.flushLoop(trigger))
      .catch(() => {})
      .finally(() => {
        if (this.flushChains.get(key) === chain) this.flushChains.delete(key);
      });
    this.flushChains.set(key, chain);
    await chain;
  }
  async flushLoop(trigger) {
    for (let i = 0; await this.flushActiveUpload(trigger, i); i++) {
      if (i > 20) break; // bench 保险丝
    }
  }
  async flushActiveUpload(trigger, iteration) {
    const store = this.pendingManager.store;
    const state = await store.read();
    const pending = state.activeUpload ?? state.pendingUpload;
    if (!pending) return false;
    const authToken = 'bench-token';
    const attempt = await this.pendingManager.recordUploadAttempt(pending);
    if (!attempt) { this.uploadClient.consume(pending.uploadCredentialHandle); return true; }
    if (attempt.failureCountedAt) {
      if (!state.latestPendingUpload) { this.uploadClient.consume(attempt.uploadCredentialHandle); return false; }
      const outcome = await this.pendingManager.discardPendingUpload(attempt);
      this.uploadClient.consume(attempt.uploadCredentialHandle);
      return outcome === 'promoted';
    }
    const handle = attempt.uploadCredentialHandle?.trim();
    if (!handle) return (await this.pendingManager.discardPendingUpload(attempt)) === 'promoted';
    // 保真点：先读信封 + stat + 全量 sha256（哪怕下一步就 key_expired）
    const t0 = Date.now();
    const targetRequest = await this.buildUploadTargetRequest({ stateWorkspaceKey: state.workspaceKey, pending: attempt, handle });
    const hashMs = Date.now() - t0;
    const target = this.uploadClient.requestUploadTarget(authToken, targetRequest);
    this.attemptLog.push({ iteration, hashMs, reason: target.ok ? null : target.reason });
    if (!target.ok) {
      if (['base_not_found', 'base_invalid', 'hash_mismatch'].includes(target.reason)) return false;
      if (target.reason === 'key_expired') {
        const outcome = await this.pendingManager.discardPendingUpload(attempt);
        this.uploadClient.consume(handle);
        return outcome === 'promoted';
      }
      if (target.reason === 'payload_too_large') {
        const outcome = await this.pendingManager.discardPendingUpload(attempt);
        this.uploadClient.consume(handle);
        return outcome === 'promoted';
      }
      const outcome = await this.pendingManager.failPendingUpload(attempt);
      if (outcome !== 'retained') this.uploadClient.consume(handle);
      return outcome === 'promoted';
    }
    const upload = await this.uploadClient.uploadObject({
      target: target.objectUpload,
      artifactPath: attempt.encryptedArtifactPath,
    });
    if (!upload.ok) {
      const outcome = await this.pendingManager.failPendingUpload(attempt);
      if (outcome !== 'retained') this.uploadClient.consume(handle);
      return outcome === 'promoted';
    }
    this.uploadClient.consume(handle);
    const outcome = await this.pendingManager.markAcceptedManifest(attempt, {
      manifestHash: attempt.nextManifestHash,
      manifestPath: attempt.manifestPath,
    });
    return outcome === 'promoted';
  }
  async buildUploadTargetRequest({ stateWorkspaceKey, pending, handle }) {
    const [envelope, encryptedStat, encryptedSha256] = await Promise.all([
      this.readEnvelope(pending.encryptionEnvelopePath),
      stat(pending.encryptedArtifactPath),
      sha256File(pending.encryptedArtifactPath), // 第二遍密文哈希（03 已算过一次）
    ]);
    return {
      schema: 'repo_snapshot_upload_target/v1',
      workspaceKeyHash: stateWorkspaceKey ?? 'bench-wsk',
      uploadCredentialHandle: handle,
      kind: pending.kind,
      manifestHash: pending.nextManifestHash,
      baseManifestHash: pending.baseManifestHash,
      encryptedArtifact: { ...envelope, encryptedSizeBytes: encryptedStat.size, encryptedSha256 },
    };
  }
  async readEnvelope(path) {
    return JSON.parse(await (await import('node:fs/promises')).readFile(path, 'utf8'));
  }
}

module.exports = { UploadClient, UploadWorker };
