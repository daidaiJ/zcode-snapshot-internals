# Readable 2.0 — 语义化转写

人类/agent 走读副本。在 [1.0](../readable-1.0/)（keepNames 还原 + prettier）之上补齐**局部变量语义名、Node 内建别名、内部助手/常量命名**与**叙事注释**，排版对齐成熟开源项目的源码风格（文件头 = 出处 + 法律边界 + 内容清单 + 调用链位置；每个符号有 JSDoc；关键调用有行内注释）。

> ⚠️ **仍是转写，不是 ZCode 原文。** 引用、取证、对照一律用 [`../01-sidecar-service.js`](../01-sidecar-service.js) … [`../08-credential-parsing.js`](../08-credential-parsing.js)（minified 逐字摘录）。原始版权归 Z.ai（智谱）。
>
> 出处：ZCode Desktop 3.12.2（build `4e1c9d87`）`resources/app.asar` → `out/host/index.js`。不可执行。

## Cite the original

| 走读副本（本目录） | 原文（minified 摘录，引用这个） |
| --- | --- |
| [`01-sidecar-service.js`](01-sidecar-service.js) | [`../01-sidecar-service.js`](../01-sidecar-service.js) |
| [`02-archive-writer.js`](02-archive-writer.js) | [`../02-archive-writer.js`](../02-archive-writer.js) |
| [`03-encrypt-archive.js`](03-encrypt-archive.js) | [`../03-encrypt-archive.js`](../03-encrypt-archive.js) |
| [`04-upload-client.js`](04-upload-client.js) | [`../04-upload-client.js`](../04-upload-client.js) |
| [`05-oss-post-object.js`](05-oss-post-object.js) | [`../05-oss-post-object.js`](../05-oss-post-object.js) |
| [`06-upload-worker.js`](06-upload-worker.js) | [`../06-upload-worker.js`](../06-upload-worker.js) |
| [`07-pending-manager.js`](07-pending-manager.js) | [`../07-pending-manager.js`](../07-pending-manager.js) |
| [`08-credential-parsing.js`](08-credential-parsing.js) | [`../08-credential-parsing.js`](../08-credential-parsing.js) |
| [`09-related.js`](09-related.js) | 无单独摘录；引用 `app.asar` → `out/host/index.js`，并回链 01–08 |

## Read order

| file | stage | start here |
| --- | --- | --- |
| `01-sidecar-service.js` | 每条消息触发 | `captureBeforePrompt` → `captureBeforePromptUnsafe`（采集七步编排，注释在） |
| `02-archive-writer.js` | 打包 | `writeRepoSnapshotPlainArchive`（tar 布局见文件头）、`buildRepoSnapshotDelta` |
| `03-encrypt-archive.js` | 信封加密 | `encryptArchive` — AES-256-CTR + RSA-OAEP，私钥只在服务端 |
| `04-upload-client.js` | 凭证 | `getUploadKey`（缓存 1h）、`requestUploadTarget` |
| `05-oss-post-object.js` | OSS 直传 | `buildObjectUploadTarget`（callback 机制）、`uploadPostObject` |
| `06-upload-worker.js` | 状态机 | `flushActiveUpload`（失败分流表在 JSDoc 里） |
| `07-pending-manager.js` | 待传队列 | `markAcceptedManifest` —— 基线锚点，服务端留存的直接代码证据 |
| `08-credential-parsing.js` | 响应校验 | `resolveUploadCredentialData`（必填字段 = 服务端凭证面） |
| `09-related.js` | 公共助手 | `scanRepoSnapshot`（.git 全历史默认在内）、`enforceRepoSnapshotDiskQuota` |

叙事走读：[`docs/02-code-flow.md`](../../docs/02-code-flow.md)。

## 命名依据（三级来源）

命名格式参照解包产物中 keepNames 保留的**原始原型**（`RepoSnapshotSidecarService` 等）的构词法：类 PascalCase、方法/函数 camelCase、动词前缀（get/build/compute/resolve/…）、常量 UPPER_SNAKE_CASE + `REPO_SNAPSHOT_` 前缀。

1. **✓ 原名** — bundle 注记能找回的一律用原名。除 host 内 `a(IDENT,"Name")` 注记外，跨 chunk 的别名（`uo`、`Qn`、schema 常量）经 **import → chunk 转发导出 → 本地绑定 → `s(...)` 注记** 四级链路全部实锤：`uo→buildRepoSnapshotWorkspaceKey`、`Qn→createUuid`、schema 生成器实名 `repoSnapshotSchema`（`Me(e,n) = \`repo_snapshot_${e}/${n}\``）。
2. **Node 真实名** — bundle import 语句里的别名（`import{mkdir as y_e}`）逐一还原为真实内建名；undici 的 fetch 保留 `undiciFetch` 以示区别。
3. **按用途** — 仅函数**局部变量**是压缩器自造的临时名（bundle 里本无名可考），按职责以代码库同风格命名（如 `intent`、`authToken`、`turnBoundary`）；模块级符号已无此类。

### 内部助手对照（minified → 2.0）

| minified | 2.0 名 | 来源 |
| --- | --- | --- |
| `su` | RepoSnapshotCaptureIntentScheduler | ✓ 原名 |
| `uo` | buildRepoSnapshotWorkspaceKey | ✓ 原名（chunk 转发链找回） |
| `Qn` | createUuid | ✓ 原名（chunk 转发链找回） |
| `Ot` | readApiJson | ✓ 原名 |
| `df` | atomicWriteJson | ✓ 原名 |
| `vi` | throwIfRepoSnapshotScanAborted | ✓ 原名 |
| `zct` | listGitVisibleFiles | ✓ 原名 |
| `Vce` / `Jce` / `Xce` / `Yce` | buildRepoSnapshotExtra / readAcceptedBaseExtraManifest / buildRepoSnapshotExtraDelta / selectDeltaExtraFiles | ✓ 原名 |
| `p4` | computeRepoSnapshotExtraManifestHash | ✓ 原名 |
| `Nk` / `Dk` | RepoSnapshotArtifactMaxSizeExceededError / RepoSnapshotGzipOutputTooLargeError | ✓ 原名 |
| `ys` / `ya` / `va` / `lc` | activeUploadOf / normalizePendingUpload / stateWithSlots / isSamePendingGroup | ✓ 原名 |
| `Cl` / `Il` / `d$` | removePendingFileGroup / protectedManifestPathsForState / cleanupStaleRepoSnapshotEncryptedArtifacts | ✓ 原名 |
| `sc` / `a$` / `ac` | getRepoSnapshotRootDir / getRepoSnapshotWorkspaceDir / getRepoSnapshotWorkspaceHash | ✓ 原名 |
| `rdt` / `edt` / `tdt` / `ndt` | buildObjectUploadTarget / encodeOssCallback / toServerUpdateType / ossAttributionPlaceholderValues | ✓ 原名 |
| `pdt` / `ddt` / `udt` / `ldt` | readWorkspaceSizeBytes / readEnvelope / readManifest / sha256File | ✓ 原名 |
| `qlt` / `Jm` / `cct` / `pf` | authHeaders / formatObjectKeys / canonicalizeRepoSnapshotManifestForHash / canonicalRepoSnapshotJson | ✓ 原名 |
| `klt` / `ylt` / `ult` / `alt` | measureRepoSnapshotWorkspaceResidentBytes / evaluateRepoSnapshotDiskQuota / shouldExhaustPending / incrementFailureCount | ✓ 原名 |
| `kct` / `wct` / `l$` / `Vm` / `iu` / `yi` / `cc` | hasMeaningfulContent / stableJson / isStaleFile / normalizePathForCompare / removeCountedFile / addCounters / emptyCounters | ✓ 原名 |
| `qst` / `fct` / `mct` / `b5` | writeTarEntry / getRepoSnapshotManifestPath / getRepoSnapshotExtraManifestPath / computeRepoSnapshotManifestHash | ✓ 原名 |

### Node 内建别名（bundle import 逐一核实）

| minified | 真实名 | | minified | 真实名 |
| --- | --- | --- | --- | --- |
| `y_e` `Ust` | mkdir | | `hs` `Uk` `Yo` `s$` | join |
| `w_e` `Fst` `p$` | dirname | | `E5` | basename |
| `v_e` | randomBytes | | `Z_e` | lstat |
| `Xst` `Yst` `adt` `act` `Flt` | createCipheriv / createHash | | `sIe` `au` | readdir |
| `Qst` / `Jst` | publicEncrypt / crypto.constants | | `elt` `SIe` | readFile |
| `b_e` `sdt` `jlt` `zst` | createReadStream | | `tct` `p_e` `cdt` | stat |
| `ect` `Nst` | createWriteStream | | `S5` `Fk` `u_e` | rm |
| `nct` / `Bst` | pipeline / createGzip | | `Lst` / `yIe` | rename / createPublicKey |
| `Blt` / `Zlt` / `Wlt` | randomUUID / openAsBlob / undici.fetch | | `qst` | writeTarEntry（自研） |

### 常量对照（字面值已全部实锤）

schema 常量由实名生成器拼出：`repoSnapshotSchema(name, ver)` = `` `repo_snapshot_${name}/${ver}` ``（bundle chunk 内实锤）。v2：manifest / prompt / delta / encrypted_artifact / encryption_aad；v1：其余。

| minified | 2.0 名 | 值 |
| --- | --- | --- |
| `eee` | REPO_SNAPSHOT_PROMPT_SCHEMA | `"repo_snapshot_prompt/v2"` |
| `Q7` | REPO_SNAPSHOT_MANIFEST_SCHEMA | `"repo_snapshot_manifest/v2"` |
| `tee` | REPO_SNAPSHOT_DELTA_SCHEMA | `"repo_snapshot_delta/v2"` |
| `GS` | REPO_SNAPSHOT_EXTRA_MANIFEST_SCHEMA | `"repo_snapshot_extra_manifest/v1"` |
| `ree` | REPO_SNAPSHOT_ENCRYPTED_ARTIFACT_SCHEMA | `"repo_snapshot_encrypted_artifact/v2"`（信封 JSON 的 schema） |
| `oee` | REPO_SNAPSHOT_ENCRYPTION_AAD_SCHEMA | `"repo_snapshot_encryption_aad/v2"` |
| `iee` | REPO_SNAPSHOT_MANIFEST_HASH_SCHEMA | `"repo_snapshot_manifest_hash/v1"`（哈希专用规范化 manifest） |
| `aee` | REPO_SNAPSHOT_UPLOAD_KEY_SCHEMA | `"repo_snapshot_upload_key/v1"` |
| `see` | REPO_SNAPSHOT_UPLOAD_TARGET_SCHEMA | `"repo_snapshot_upload_target/v1"` |
| `mlt` | DEFAULT_MAX_ARTIFACT_BYTES | `2*1024*1024*1024`（2GiB） |
| `glt` / `hlt` | FALLBACK_FREE_DISK_BYTES / detectedFreeDiskBytes | `6*1024*1024*1024` / 运行时探测 |
| `cIe` / `vlt` | DISK_QUOTA_MULTIPLIER / DISK_RESERVE_MULTIPLIER | `3` / `2`（配额池=3×单包上限，预留=2×） |
| `olt` / `ilt` | DEFAULT_MAX_RETRY_COUNT / DEFAULT_MAX_RETENTION_MS | `3` / `1440*60*1e3`（24h） |
| `Hlt` / `Klt` / `Glt` | DEFAULT_CREDENTIAL_TIMEOUT_MS / DEFAULT_OBJECT_UPLOAD_TIMEOUT_MS / CREDENTIAL_CACHE_TTL_MS | `15e3` / `6e4` / `3600*1e3` |
| `k_e` | ENCRYPTION_OVERHEAD_BYTES | `16`（CTR nonce 前缀，压缩上限为其让位） |
| `qve` | UPLOAD_CREDENTIAL_ENDPOINT | `"/api/v1/snapshot/upload-credential"`（env 可覆盖） |
| `qce` | GLOBAL_CONFIG_GROUP_ID | `"global-configs"` |
| `I5` / `E_e` / `Tlt` | GLOBAL_CONFIG_FILE_NAMES / GLOBAL_CONFIG_SOURCE_LABELS / SETTINGS_BEHAVIOR_KEYS | 字面值已在 bundle 核实（settings.behavior.json、app-memory:global-* 等） |
| `Ult` | uploadLogger | `je("repo-snapshot-upload")` |

2.0 生成的代码里，每个 schema 常量使用处都带 `// = "repo_snapshot_*/vN"` 行内注释。

### 关键函数局部变量（其余见各文件行内注释）

`captureBeforePromptUnsafe`（01）：`intent` 采集意图 · `authToken` 登录态 · `workspaceKey/Hash` · `uploadKey` 凭证 · `turnBoundary` 轮界状态 · `maxArtifactBytes` · `workspaceScan/extraScan` 双车道扫描 · `manifestHash/extraManifestHash` · `attribution` 归因 · `promptPayload`（含提问原文）· `captureKind` baseline|increment · `acceptedCheckpoint` 基线检查点 · `delta/extraDelta` · `includedFiles/extraFiles` · `artifactPaths` · `artifact`。

`flushActiveUpload`（06）：`trigger` 触发参 · `state` 状态 · `pending` 待传 · `attempt` 记尝试后 · `credentialHandle` · `targetRequest/target` · `failOutcome/discardOutcome`。

## 相对 1.0 的修正与改动（全部经骨架校验核对）

| 类别 | 内容 |
| --- | --- |
| **修复转写损坏** | 09 `buildRepoSnapshotGlobalConfigsExtraInputs`：1.0 把字符串字面量 `"_"` 误替换成 `"sessionTargetFrom"`（beautify 对字符串内容做标识符替换的副作用）；已对照 bundle 原文恢复 `.replace(/\./g, "_")` |
| 可读性等价改写 | 08 unicode 转义日志解码；08 PEM 换行链由多行模板改回 `"\r\n"` 字面量（值不变）；`!0/!1/void 0` → `true/false/undefined` |
| 结构小调整 | 09 移除 esbuild `__name` 包装 `a(fn,"name")`（3 处）；`writeGzipTarToPath` 的 Promise/循环改常规写法；02 解构简写 |
| 命名 | 见上方三级来源；所有局部变量语义化 |

**校验**：`python tools/skeleton_check.py` —— 把 1.0/2.0 分词骨架化（标识符归一、去注释、模板内代码骨架化）后逐 token 对齐；字符串差异必须落在白名单，结构差异必须等于已人工核对的数量。当前 6/9 文件骨架逐 token 一致，3 文件差异全部为上表所列有意改动。

## Regen

需本机装有 ZCode（本机路径 `D:\Programs\zcode\resources\app.asar`）：

```
npx --yes @electron/asar extract-file <ZCode>/resources/app.asar out\host\index.js   # 挪到 .extract/host-index.js
python tools/extract_snapshot.py      # 切片 → src/readable-1.0（原始块）
python tools/beautify_snapshot.py     # 1.0：keepNames 回填 + 法律头
npx prettier --write "src/readable-1.0/*.js"
python tools/probe_keepnames.py       # （可选）从 bundle 找回剩余 minified 名
python tools/readable2.py             # 2.0：语义命名 + 注释 → src/readable-2.0
npx prettier --write "src/readable-2.0/*.js"
node --check src/readable-2.0/*.js && python tools/skeleton_check.py
```

2.0 的全部命名/注释知识在 [`tools/readable2_map.py`](../../tools/readable2_map.py)（策划数据）+ [`tools/readable2.py`](../../tools/readable2.py)（校验型引擎：规则未命中或产物残留 minified 标识符即报错退出）。
