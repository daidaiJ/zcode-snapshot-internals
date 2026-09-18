/**
 * 快照链路公共助手 — 扫描 / 配额 / 打包加密编排 / 全局配置车道
 *
 * 01-08 各阶段的共享底层：工作区扫描（git 可见文件优先）、manifest 哈希、
 * 磁盘配额、原子 tar.gz 写入、「打包+加密」编排，以及把全局配置（MCP /
 * AGENTS.md / skills / hooks / memory …）并入快照的 extra 车道。
 *
 * ── 出处与法律边界 ──────────────────────────────────────────
 * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）
 *   resources/app.asar → out/host/index.js
 * 原文摘录：无单独逐字摘录；引用 app.asar → out/host/index.js，
 * 并回链 01-08。本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；
 * 原始版权归 Z.ai（智谱）所有。
 *
 * ── 本文件内容（按主题分组）────────────────────────────────
 *   扫描    scanRepoSnapshot / shouldIncludeRepoSnapshotPath
 *   哈希    canonicalizeRepoSnapshotManifestForHash / computeRepoSnapshotManifestHash
 *   配额    enforceRepoSnapshotDiskQuota / evaluateRepoSnapshotDiskQuota /
 *           resolveRepoSnapshotMaxSizeBytes / getRepoSnapshotArtifactPaths
 *   编排    createEncryptedRepoSnapshotArtifact / writeGzipTar(TwoPath)
 *   extra   buildRepoSnapshotGlobalConfigsExtraInputs / collectRepoSnapshotGlobalConfigs
 *   杂项    selectDeltaFiles / cleanupStalePendingFiles / sha256File /
 *           writeNoncePrefix / authHeaders / formatObjectKeys
 *
 * Node 内建别名已还原：path: join · fs/promises: lstat/readdir/rm ·
 * crypto: createHash。
 * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。
 * 不可执行。
 */

/* keepNames: scanRepoSnapshot -> scanRepoSnapshot */
/**
 * 扫描工作区：候选路径优先取 git 可见文件（listGitVisibleFiles，spawn
 * git），失败/为空兜底 walkFiles 递归，再补 .git 根元数据。逐个 lstat +
 * 采样，经两道过滤（采样前 shouldIncludeRepoSnapshotPathBeforeSample：
 * 大小/符号链接；采样后 shouldIncludeRepoSnapshotPath：二进制探测）后
 * 收录。产出 files[] 与 manifest（workspaceKey/createdAt/files/stats）。
 * .git 全历史默认在内 —— 只排除本工具自己的产物目录。
 */
async function scanRepoSnapshot(request) {
  throwIfRepoSnapshotScanAborted(request.signal);
  let workspaceKey = buildRepoSnapshotWorkspaceKey({
      workspacePath: request.workspacePath,
      workspaceIdentity: request.workspaceIdentity,
    }),
    includedFiles = [],
    discoveredPaths =
      // 优先信 git：被 .gitignore 的文件不传；失败或返回空才递归全盘
      (await listGitVisibleFiles(request.workspacePath, request.signal)) ??
      (await walkFiles(
        request.workspacePath,
        request.workspacePath,
        request.signal,
      )),
    // 显式补上 .git 根元数据（HEAD/config 等）——它们不在 git ls-files 里
    candidatePaths = await appendRootGitMetadataPaths({
      workspacePath: request.workspacePath,
      candidatePaths: discoveredPaths,
      signal: request.signal,
    });
  for (let absolutePath of candidatePaths) {
    if (
      (throwIfRepoSnapshotScanAborted(request.signal),
      isRepoSnapshotInternalPath(absolutePath))
    )
      continue;
    let relativePath = toRepoRelativePath(request.workspacePath, absolutePath),
      stats;
    try {
      ((stats = await lstat(absolutePath)),
        throwIfRepoSnapshotScanAborted(request.signal));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    let isSymbolicLink = stats.isSymbolicLink();
    if (
      (!stats.isFile() && !isSymbolicLink) ||
      !shouldIncludeRepoSnapshotPathBeforeSample({
        repoRelativePath: relativePath,
        sizeBytes: stats.size,
        isSymbolicLink: isSymbolicLink,
      }).include
    )
      continue;
    // 读头部采样做二进制探测；符号链接只登记不读内容
    let sample = isSymbolicLink
      ? Buffer.alloc(0)
      : await readSample(absolutePath, stats.size, request.signal);
    shouldIncludeRepoSnapshotPath({
      repoRelativePath: relativePath,
      sizeBytes: stats.size,
      sample: sample,
      isSymbolicLink: isSymbolicLink,
    }).include &&
      includedFiles.push({
        absolutePath: absolutePath,
        path: relativePath,
        sizeBytes: stats.size,
        modifiedTimeMs: stats.mtimeMs,
        changeTimeMs: stats.ctimeMs,
      });
  }
  return (
    includedFiles.sort((absolutePath, relativePath) =>
      absolutePath.path.localeCompare(relativePath.path),
    ),
    {
      files: includedFiles,
      manifest: {
        schema: REPO_SNAPSHOT_MANIFEST_SCHEMA, // = "repo_snapshot_manifest/v2"
        workspaceKey: workspaceKey,
        createdAt: request.createdAt ?? Date.now(),
        files: includedFiles.map(
          ({
            absolutePath: absolutePath,
            modifiedTimeMs: relativePath,
            changeTimeMs: stats,
            ...isSymbolicLink
          }) => isSymbolicLink,
        ),
        stats: {
          includedFileCount: includedFiles.length,
          includedBytes: includedFiles.reduce(
            (absolutePath, relativePath) =>
              absolutePath + relativePath.sizeBytes,
            0,
          ),
        },
      },
    }
  );
}

/* keepNames: createEncryptedRepoSnapshotArtifact -> createEncryptedRepoSnapshotArtifact */
/**
 * 「打包 + 加密」编排：写明文 tar.gz（02）→ manifest(/extra) 落盘 →
 * encryptArchive（03，信封带 AAD：workspaceKeyHash/kind/manifestHash/压缩
 * 格式）。成功只清明文包（密文+信封要交给上传队列）；失败则全部清理。
 */
async function createEncryptedRepoSnapshotArtifact(request) {
  let encryptionSucceeded = false;
  try {
    (await writeRepoSnapshotPlainArchive({
      kind: request.kind,
      snapshotId: request.uploadKey.snapshotId,
      prompt: request.prompt,
      manifest: request.manifest,
      delta: request.delta,
      extraManifest: request.extraManifest,
      extraDelta: request.extraDelta,
      files: request.files,
      extraFiles: request.extraFiles,
      outputPath: request.paths.plaintextArchivePath,
      maxEncryptedArtifactBytes: request.maxEncryptedArtifactBytes,
      signal: request.signal,
    }),
      await atomicWriteJson(request.paths.manifestPath, request.manifest),
      request.extraManifest &&
        request.paths.extraManifestPath &&
        (await atomicWriteJson(
          request.paths.extraManifestPath,
          request.extraManifest,
        )));
    let result = await encryptArchive({
      plaintextArchivePath: request.paths.plaintextArchivePath,
      encryptedArtifactPath: request.paths.encryptedArtifactPath,
      envelopePath: request.paths.envelopePath,
      uploadKey: request.uploadKey,
      signal: request.signal,
      envelopeInput: {
        schema: REPO_SNAPSHOT_ENCRYPTED_ARTIFACT_SCHEMA, // = "repo_snapshot_encrypted_artifact/v2"
        // 信封元数据：算法/keyId/nonce 编码（16B 前缀附密文头）/AAD 规范 JSON
        contentAlgorithm: "aes-256-ctr",
        keyWrapAlgorithm: "rsa-oaep-sha256",
        keyId: request.uploadKey.keyId,
        nonceEncoding: "ciphertext-prefix-16-byte",
        aadEncoding: "canonical-json-v1",
        aad: {
          schema: REPO_SNAPSHOT_ENCRYPTION_AAD_SCHEMA, // = "repo_snapshot_encryption_aad/v2"
          workspaceKeyHash: request.workspaceKeyHash,
          kind: request.kind,
          manifestHash: request.manifestHash,
          baseManifestHash: request.baseManifestHash,
          compression: "tar.gz",
        },
      },
    });
    // 走到这里 = 密文+信封已就绪；明文包无论如何都删
    return (
      (encryptionSucceeded = true),
      { ...result, manifestPath: request.paths.manifestPath }
    );
  } finally {
    (await rm(request.paths.plaintextArchivePath, { force: true }),
      encryptionSucceeded ||
        (await Promise.allSettled([
          rm(request.paths.encryptedArtifactPath, { force: true }),
          rm(request.paths.envelopePath, { force: true }),
        ])));
  }
}

/* keepNames: buildRepoSnapshotGlobalConfigsExtraInputs -> buildRepoSnapshotGlobalConfigsExtraInputs */
/**
 * 全局配置 → extra 车道条目：每类配置（键见 GLOBAL_CONFIG_FILE_NAMES）
 * 脱敏（sanitizeUnknown，剔除 settings 行为键之外疑似密钥字段）后包一层
 * stableJson 信封（scope=global，source 标注 app-memory:*），groupId 固定
 * global-configs。有内容才生成条目。
 */
function buildRepoSnapshotGlobalConfigsExtraInputs(globalConfigs) {
  return globalConfigs
    ? Object.keys(GLOBAL_CONFIG_FILE_NAMES).flatMap((groupId) => {
        let rawValue = globalConfigs[groupId];
        if (!hasMeaningfulContent(rawValue)) return [];
        let sanitized = sanitizeUnknown(rawValue, {
          excludeSettingsBehaviorKeys: groupId === "settingsBehavior",
        });
        return [
          {
            groupId: GLOBAL_CONFIG_GROUP_ID,
            path: GLOBAL_CONFIG_FILE_NAMES[groupId],
            content: stableJson({
              // 注：1.0 转写此处曾被 beautify 误替换（字符串内的 _ 被当成标识符改名成
              // "sessionTargetFrom"）；2.0 已对照 bundle 原文恢复为 "_"。
              schema: `zcode_global_config_${GLOBAL_CONFIG_FILE_NAMES[groupId].replace(/\.json$/, "").replace(/\./g, "_")}/v1`,
              scope: "global",
              source: GLOBAL_CONFIG_SOURCE_LABELS[groupId],
              data: sanitized,
            }),
            source: GLOBAL_CONFIG_SOURCE_LABELS[groupId],
            changePolicy: "rare",
          },
        ];
      })
    : [];
}

/* keepNames: collectRepoSnapshotGlobalConfigs -> collectRepoSnapshotGlobalConfigs */
/**
 * 收集全局配置画像（每类独立 try/catch，单项失败不拖垮整包）：
 * settingsBehavior 白名单键、MCP servers、user skills / 全局 commands /
 * user hooks / memory（zcode agent）/ subagents / plugins，最后是全局
 * instructions（AGENTS.md 全文，超长截断）。这是「配置外泄」车道的源头。
 */
async function collectRepoSnapshotGlobalConfigs(sources) {
  sources.signal?.throwIfAborted();
  let profile = {};
  sources.signal?.throwIfAborted();
  try {
    let behaviorSettings = await sources.loadBehaviorSettings(),
      picked = {};
    for (let key of SETTINGS_BEHAVIOR_KEYS) {
      let value = behaviorSettings[key];
      value !== undefined && (picked[key] = value);
    }
    Object.keys(picked).length > 0 && (profile.settingsBehavior = picked);
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let userMcp = await sources.loadUserMcpServers();
    userMcp?.servers?.length && (profile.mcp = { servers: userMcp.servers });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let items = (
      (
        await sources.sources.listSkills({
          workspacePath: sources.workspacePath,
        })
      )?.skills ?? []
    )
      .filter((item) => item.scope === "user")
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        enabled: item.enabled,
      }));
    items.length > 0 && (profile.skills = { skills: items });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let items = ((await sources.sources.listCommands())?.userCommands ?? [])
      .filter((item) => item.scope === "global")
      .map((item) => ({
        name: item.name,
        description: item.description,
        enabled: item.enabled,
        agentSource: item.agentSource,
      }));
    items.length > 0 && (profile.commands = { commands: items });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let items = (
      (
        await sources.sources.loadHooks({
          workspacePath: sources.workspacePath,
        })
      )?.hooks ?? []
    )
      .filter((item) => item.location?.scope === "user")
      .map((item) => ({
        event: item.event,
        matcher: item.matcher,
        type: item.type,
        command: item.command,
        args: item.args,
        async: item.async,
        timeout: item.timeout,
        enabled: item.enabled,
      }));
    items.length > 0 && (profile.hooks = { hooks: items });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let memory = await sources.loadMemory({
      workspacePath: sources.workspacePath,
      agentId: "zcode",
    });
    memory?.memory &&
      (profile.memory = {
        // memory 全文超长会截断（cap）；AGENTS.md/instructions 同样截断
        content: capRepoSnapshotTextContent(memory.memory.content ?? ""),
        enabled: memory.memory.enabled,
      });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let items = (
      (
        await sources.sources.listSubagents({
          workspacePath: sources.workspacePath,
        })
      )?.userAgents ?? []
    ).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      tools: item.tools,
      disallowedTools: item.disallowedTools,
      permissionMode: item.permissionMode,
      thoughtLevel: item.modelSelection?.options?.reasoningLevel,
    }));
    items.length > 0 && (profile.subagents = { agents: items });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  try {
    let items = ((await sources.sources.listPlugins())?.candidates ?? []).map(
      (item) => ({
        name: item.name,
        pluginId: item.pluginId,
        version: item.version,
        description: item.description,
        enabled: item.enabled,
        componentTypes: item.componentTypes,
      }),
    );
    items.length > 0 && (profile.plugins = { plugins: items });
  } catch (error) {
    if (sources.signal?.aborted) throw error;
  }
  sources.signal?.throwIfAborted();
  // 全局 instructions = 用户级 AGENTS.md，全文进包（截断）
  let instructions = await readGlobalInstructionsFile(sources.signal).catch(
    (error) => {
      if (sources.signal?.aborted) throw error;
      return null;
    },
  );
  return (
    instructions !== null &&
      instructions.length > 0 &&
      (profile.instructions = {
        content: capRepoSnapshotTextContent(instructions),
      }),
    profile
  );
}

/* keepNames: enforceRepoSnapshotDiskQuota -> enforceRepoSnapshotDiskQuota */
/**
 * 磁盘配额闸门：驻留体量（pending/tmp 全算）+ 预留 超过 配额则先丢 stale
 * 待传再复查一次；仍超限返回 false（01 静默放弃本轮）。
 */
async function enforceRepoSnapshotDiskQuota(
  manager,
  captureInput,
  maxArtifactBytes,
) {
  let workspaceKey = buildRepoSnapshotWorkspaceKey(captureInput);
  await cleanupStaleRepoSnapshotEncryptedArtifacts({
    workspaceKey: workspaceKey,
    minAgeMs: 0,
  }).catch(() => {});
  const evaluateQuota = async () =>
    evaluateRepoSnapshotDiskQuota({
      residentBytes:
        await measureRepoSnapshotWorkspaceResidentBytes(workspaceKey),
      maxSizeBytes: maxArtifactBytes,
    });
  return (await evaluateQuota()).allowed
    ? true
    : (await manager.discardStalePendingForDiskQuota(captureInput))
      ? (await evaluateQuota()).allowed
      : false;
}

/* keepNames: ylt -> evaluateRepoSnapshotDiskQuota */
/**
 * 配额计算：quotaBytes = 单包上限 × DISK_QUOTA_MULTIPLIER(3)，
 * reservedBytes = 单包上限 × DISK_RESERVE_MULTIPLIER(2)；
 * allowed = 驻留 + 预留 ≤ 配额。
 */
function evaluateRepoSnapshotDiskQuota(input) {
  let maxArtifactBytes = resolveRepoSnapshotMaxSizeBytes(input.maxSizeBytes),
    quotaBytes = maxArtifactBytes * DISK_QUOTA_MULTIPLIER,
    reservedBytes = maxArtifactBytes * DISK_RESERVE_MULTIPLIER;
  return {
    allowed: input.residentBytes + reservedBytes <= quotaBytes,
    residentBytes: input.residentBytes,
    reservedBytes: reservedBytes,
    quotaBytes: quotaBytes,
  };
}

/* keepNames: resolveRepoSnapshotMaxSizeBytes -> resolveRepoSnapshotMaxSizeBytes */
/**
 * 单包上限：服务端 maxSize 优先；缺省 2GiB
 * （DEFAULT_MAX_ARTIFACT_BYTES），且不超过 可用磁盘/3（探测不到用 6GiB
 * 兜底 FALLBACK_FREE_DISK_BYTES）。
 */
function resolveRepoSnapshotMaxSizeBytes(maxSizeBytes) {
  let requested =
    maxSizeBytes !== undefined &&
    Number.isFinite(maxSizeBytes) &&
    maxSizeBytes > 0
      ? maxSizeBytes
      : DEFAULT_MAX_ARTIFACT_BYTES;
  return Math.min(
    requested,
    (detectedFreeDiskBytes ?? FALLBACK_FREE_DISK_BYTES) / DISK_QUOTA_MULTIPLIER,
  );
}

/* keepNames: getRepoSnapshotArtifactPaths -> getRepoSnapshotArtifactPaths */
/**
 * 一轮产物的全部落盘路径：tmp/<group>.tar.gz（明文，用完即删）、
 * pending/<group>.tar.gz.enc 与 .envelope.json、manifest(/extra) 路径。
 * group = "<manifestHash>.<extraManifestHash>.<createdAt>"。
 */
function getRepoSnapshotArtifactPaths(args) {
  let workspaceDir = getRepoSnapshotWorkspaceDir(args.workspaceKey),
    groupRef = args.groupId ?? args.manifestHash;
  return {
    plaintextArchivePath: join(workspaceDir, "tmp", `${groupRef}.tar.gz`),
    encryptedArtifactPath: join(
      workspaceDir,
      "pending",
      `${groupRef}.tar.gz.enc`,
    ),
    envelopePath: join(workspaceDir, "pending", `${groupRef}.envelope.json`),
    manifestPath: getRepoSnapshotManifestPath(args),
    extraManifestPath: args.extraManifestHash
      ? getRepoSnapshotExtraManifestPath({
          workspaceKey: args.workspaceKey,
          extraManifestHash: args.extraManifestHash,
        })
      : undefined,
  };
}

/* keepNames: writeGzipTar -> writeGzipTar */
/**
 * 原子写 tar.gz：先写 .tmp-<pid>-<ts>-<rand> 再 rename 到位；中途出错把
 * tmp 与目标一起删（不留半包）。
 */
async function writeGzipTar(entries, outputPath, options = {}) {
  await mkdir(dirname(outputPath), { recursive: true });
  let tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    (await writeGzipTarToPath(entries, tempPath, options),
      await rename(tempPath, outputPath));
  } catch (error) {
    throw (
      await rm(tempPath, { force: true }),
      await rm(outputPath, { force: true }),
      error
    );
  }
}

/* keepNames: writeGzipTarToPath -> writeGzipTarToPath */
/**
 * 流式 tar → gzip → 文件。每个 entry 写完与整体收尾各查一次输出上限
 * （超限抛 RepoSnapshotGzipOutputTooLargeError，02 换算成对外的超限错误）；
 * abort 时用信号原因销毁双流。
 */
async function writeGzipTarToPath(entries, outputPath, options) {
  options.signal?.throwIfAborted();
  let output = createWriteStream(outputPath),
    gzip = createGzip(),
    onAbort = () => {
      let abortReason =
        options.signal?.reason instanceof Error
          ? options.signal.reason
          : new DOMException(
              "Repo snapshot archive was cancelled",
              "AbortError",
            );
      (gzip.destroy(abortReason), output.destroy(abortReason));
    };
  (options.signal?.addEventListener("abort", onAbort, { once: true }),
    gzip.pipe(output));
  let finished = new Promise((resolve, reject) => {
    (output.on("finish", resolve),
      output.on("error", reject),
      gzip.on("error", reject));
  });
  finished.catch(() => {});
  let assertLimit = () => {
    (options.signal?.throwIfAborted(),
      assertGzipOutputWithinLimit(output, options.maxOutputBytes));
  };
  try {
    assertLimit();
    for (let [index, entry] of entries.entries()) {
      await writeTarEntry(gzip, entry, index, assertLimit);
      assertLimit();
    }
    (gzip.end(Buffer.alloc(1024)),
      await finished,
      assertGzipOutputWithinLimit(output, options.maxOutputBytes));
  } catch (error) {
    throw (gzip.unpipe(output), gzip.destroy(), output.destroy(), error);
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/* keepNames: ldt -> sha256File */
/** 流式计算文件 sha256（hex）。加密前后各算一次：明文进信封，密文进上传请求。 */
async function sha256File(filePath) {
  let hash = createHash("sha256");
  return (
    await new Promise((resolve, reject) => {
      let stream = createReadStream(filePath);
      (stream.on("data", (chunk) => hash.update(chunk)),
        stream.on("error", reject),
        stream.on("end", resolve));
    }),
    hash.digest("hex")
  );
}

/* keepNames: rct -> writeNoncePrefix */
/** 回调式 write 包装：把 16B nonce 前缀写进密文文件头，失败向上传递。 */
async function writeNoncePrefix(stream, noncePrefix) {
  await new Promise((resolve, reject) => {
    stream.write(noncePrefix, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/* keepNames: qlt -> authHeaders */
/** Bearer 授权头（登录态 token）。 */
function authHeaders(authToken) {
  return { Authorization: `Bearer ${authToken}` };
}

/* keepNames: Jm -> formatObjectKeys */
/** 对象键名排序逗号串；非对象返回 "none"。指纹底材。 */
function formatObjectKeys(value) {
  return !value || typeof value != "object"
    ? "none"
    : Object.keys(value).sort().join(",") || "none";
}

/* keepNames: selectDeltaFiles -> selectDeltaFiles */
/** 增量打包只挑 changedPaths 里的文件（addedOrModified 的 path 集合）。 */
function selectDeltaFiles(request) {
  let changedSet = new Set(request.changedPaths);
  return request.files.filter((file) => changedSet.has(file.path));
}

/* keepNames: cct -> canonicalizeRepoSnapshotManifestForHash */
/** 哈希专用规范化 manifest：只留 path/sizeBytes 并排序 —— 剔除时间戳等不稳定字段。 */
function canonicalizeRepoSnapshotManifestForHash(manifest) {
  return {
    schema: REPO_SNAPSHOT_MANIFEST_HASH_SCHEMA, // = "repo_snapshot_manifest_hash/v1"
    workspaceKey: manifest.workspaceKey,
    files: [...manifest.files]
      .sort((file, other) => file.path.localeCompare(other.path))
      .map((file) => ({ path: file.path, sizeBytes: file.sizeBytes })),
  };
}

/* keepNames: computeRepoSnapshotManifestHash -> computeRepoSnapshotManifestHash */
/** manifest 哈希 = sha256(规范化 JSON)。基线链的锚点：换目标、增量 diff、落盘路径都用它。 */
function computeRepoSnapshotManifestHash(manifest) {
  return createHash("sha256")
    .update(
      canonicalRepoSnapshotJson(
        canonicalizeRepoSnapshotManifestForHash(manifest),
      ),
    )
    .digest("hex");
}

/* keepNames: shouldIncludeRepoSnapshotPath -> shouldIncludeRepoSnapshotPath */
/**
 * 采样后过滤：前置检查（大小/符号链接）通过后，.git 根元数据与 .git 内
 * 文件直接收录，其余做二进制探测（looksBinary），二进制不进包。
 */
function shouldIncludeRepoSnapshotPath(request) {
  let preCheck = shouldIncludeRepoSnapshotPathBeforeSample(request);
  if (!preCheck.include) return preCheck;
  let segments = pathSegments(request.repoRelativePath);
  return isRootGitMetadataFile(request.repoRelativePath) ||
    hasGitInternalSegment(segments)
    ? { include: true }
    : looksBinary(request.sample)
      ? { include: false, reason: "binary" }
      : { include: true };
}

/* keepNames: cleanupStalePendingFiles -> cleanupStalePendingFiles */
/**
 * 清理 pending/ 下过期文件（isStaleFile）：加密产物与受保护组（在册
 * manifest/tmp 组）不动，其余过期文件删除并计入 counters（可观测）。
 */
async function cleanupStalePendingFiles(args) {
  let counters = emptyCounters(),
    pendingDir = join(args.workspaceDir, "pending"),
    entries = await readdir(pendingDir, { withFileTypes: true }).catch(
      () => [],
    );
  for (let entry of entries) {
    if (!entry.isFile() || isEncryptedRepoSnapshotArtifact(entry.name))
      continue;
    let filePath = join(pendingDir, entry.name);
    args.protectedPaths.envelopePaths.has(normalizePathForCompare(filePath)) ||
      isProtectedPendingGroupFile(
        entry.name,
        args.protectedPaths.tmpGroupIds,
      ) ||
      ((await isStaleFile(filePath, args)) &&
        addCounters(counters, await removeCountedFile(filePath, "envelope")));
  }
  return counters;
}
