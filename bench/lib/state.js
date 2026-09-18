// 待传队列状态层重建件 —— 07-pending-manager 语义子集（每工作区 Promise 链锁 + 双槽位）。
// bench 专用，非 ZCode 代码。
'use strict';
const { readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { atomicWriteJson } = require('./pipeline');

class PendingStateStore {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir;
    this.statePath = join(workspaceDir, 'state.json');
    this.operations = Promise.resolve(); // 单工作区链锁
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.statePath, 'utf8'));
    } catch {
      return {};
    }
  }
  async write(state) {
    await atomicWriteJson(this.statePath, state);
  }
  // 所有变更串行挂链（withWorkspaceLock 语义）
  async withLock(operation) {
    const chain = this.operations.catch(() => {}).then(operation);
    this.operations = chain;
    try {
      return await chain;
    } finally {
      // 链尾自清理省略（bench 生命周期短）
    }
  }
}

function isSameGroup(a, b) {
  return a && b && a.groupId === b.groupId;
}

async function removePendingFileGroup(pending, preserve = new Set()) {
  const paths = [
    pending.encryptedArtifactPath,
    pending.envelopePath,
    pending.manifestPath,
  ].filter((p) => p && !preserve.has(p));
  await Promise.allSettled(paths.map((p) => rm(p, { force: true })));
}

class PendingManager {
  constructor(store, { maxRetryCount = 3, maxRetentionMs = 24 * 3600 * 1e3, now = Date.now } = {}) {
    this.store = store;
    this.maxRetryCount = maxRetryCount;
    this.maxRetentionMs = maxRetentionMs;
    this.now = now;
  }
  async recordFailureCountAtTurnBoundary() {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      const active = state.activeUpload;
      if (!active || (active.attemptCount ?? 0) <= 0 || active.failureCountedAt) return state;
      const next = {
        ...state,
        failureCount: (state.failureCount ?? 0) + 1,
        activeUpload: { ...active, failureCountedAt: this.now() },
      };
      await this.store.write(next);
      return next;
    });
  }
  async registerPendingUpload(pending) {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      if (!state.activeUpload) {
        const next = { ...state, activeUpload: pending, latestPendingUpload: undefined };
        await this.store.write(next);
        return 'active';
      }
      // 有 active：旧 latest 清文件，新条目进 latest 槽（顶替语义）
      if (state.latestPendingUpload && !isSameGroup(state.latestPendingUpload, pending)) {
        await removePendingFileGroup(state.latestPendingUpload).catch(() => {});
      }
      const next = { ...state, activeUpload: state.activeUpload, latestPendingUpload: pending };
      await this.store.write(next);
      return 'queued';
    });
  }
  async recordUploadAttempt(pending) {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      const active = state.activeUpload;
      if (!active || !isSameGroup(active, pending)) return null;
      const counted = { ...active, attemptCount: (active.attemptCount ?? 0) + 1, lastAttemptAt: this.now() };
      await this.store.write({ ...state, activeUpload: counted });
      return counted;
    });
  }
  shouldExhaust(pending) {
    return (pending.attemptCount ?? 0) >= this.maxRetryCount || this.now() - (pending.createdAt ?? 0) > this.maxRetentionMs;
  }
  async failPendingUpload(pending) {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      const active = state.activeUpload;
      if (!active || !isSameGroup(active, pending)) return 'stale';
      if (state.latestPendingUpload) {
        const next = { ...state, activeUpload: state.latestPendingUpload, latestPendingUpload: undefined };
        await this.store.write(next);
        await removePendingFileGroup(active, new Set([next.activeUpload?.manifestPath])).catch(() => {});
        return 'promoted';
      }
      if (!this.shouldExhaust(active)) return 'retained';
      const next = { ...state, activeUpload: undefined, latestPendingUpload: undefined };
      await this.store.write(next);
      await removePendingFileGroup(active).catch(() => {});
      return 'discarded';
    });
  }
  async discardPendingUpload(pending, { discardLatest = false } = {}) {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      const active = state.activeUpload;
      if (!active || !isSameGroup(active, pending)) return 'stale';
      const promotedFrom = discardLatest ? undefined : state.latestPendingUpload;
      const next = { ...state, activeUpload: promotedFrom, latestPendingUpload: undefined };
      await this.store.write(next);
      const preserve = new Set([promotedFrom?.manifestPath]);
      await removePendingFileGroup(active, preserve).catch(() => {});
      if (discardLatest && state.latestPendingUpload) {
        await removePendingFileGroup(state.latestPendingUpload, preserve).catch(() => {});
      }
      return promotedFrom ? 'promoted' : 'discarded';
    });
  }
  async markAcceptedManifest(pending, accepted) {
    return this.store.withLock(async () => {
      const state = await this.store.read();
      const active = state.activeUpload;
      if (!active || !isSameGroup(active, pending)) return 'stale';
      const promotedFrom = state.latestPendingUpload;
      const next = {
        ...state,
        lastAcceptedManifestHash: accepted.manifestHash,
        lastAcceptedManifestPath: accepted.manifestPath,
        activeUpload: promotedFrom,
        latestPendingUpload: undefined,
      };
      await this.store.write(next);
      const preserve = new Set([accepted.manifestPath, promotedFrom?.manifestPath]);
      await removePendingFileGroup(active, preserve).catch(() => {});
      return promotedFrom ? 'promoted' : 'idle';
    });
  }
}

module.exports = { PendingManager, PendingStateStore };
