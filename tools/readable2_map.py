#!/usr/bin/env python3
"""Curated rename/comment data for tools/readable2.py (readable-2.0 build).

Naming sources, in priority order:
  1. Original names recovered from the bundle via esbuild keepNames markers
     (a(IDENT,"Name") / class{static{a(this,"Name")}}) — marked ✓原名 below.
  2. Node builtin import aliases (verified against bundle import statements).
  3. Purpose-built names in the codebase's own style for idents the bundle
     never names — marked ※按用途 in ./README.md tables.

Rule forms per block spec:
  literals: (old, new[, expected_count]) exact-string replaces, applied first
  words:    (old, new) word-boundary renames
  regex:    (pattern, repl) re.subn
  notes:    (anchor_regex, text) insert text lines above first matching line
  doc:      JSDoc prepended after the keepNames marker
"""

KEYWORDS = {
    "let", "var", "const", "function", "return", "class", "new", "await",
    "async", "throw", "catch", "try", "for", "of", "if", "else", "while",
    "this", "true", "false", "null", "void", "typeof", "instanceof", "in",
    "delete", "super", "extends", "static", "get", "set", "do", "switch",
    "case", "break", "continue", "default", "finally", "yield", "undefined",
}

ALLOWED_RESIDUE = {"a", "b", "ok", "now"}

# (minified ident, restored name) applied to every block.
GLOBAL_WORD_RULES = [
    # -- Node builtins (aliases verified against bundle import statements) --
    ("y_e", "mkdir"), ("Ust", "mkdir"),
    ("w_e", "dirname"), ("Fst", "dirname"), ("p$", "dirname"),
    ("v_e", "randomBytes"),
    ("Xst", "createCipheriv"), ("Yst", "createHash"), ("adt", "createHash"),
    ("act", "createHash"), ("Flt", "createHash"),
    ("Qst", "publicEncrypt"), ("Jst", "cryptoConstants"),
    ("b_e", "createReadStream"), ("sdt", "createReadStream"),
    ("jlt", "createReadStream"), ("zst", "createReadStream"),
    ("ect", "createWriteStream"), ("Nst", "createWriteStream"),
    ("nct", "pipeline"), ("Bst", "createGzip"),
    ("S5", "rm"), ("Fk", "rm"), ("u_e", "rm"),
    ("tct", "stat"), ("p_e", "stat"), ("cdt", "stat"), ("Y_e", "stat"),
    ("sIe", "readdir"), ("au", "readdir"),
    ("elt", "readFile"), ("SIe", "readFile"), ("sct", "readFile"),
    ("Z_e", "lstat"), ("Lst", "rename"), ("Zlt", "openAsBlob"),
    ("hs", "join"), ("Uk", "join"), ("Yo", "join"), ("s$", "join"),
    ("E5", "basename"), ("Tct", "isAbsolute"), ("H_e", "relative"),
    ("B_e", "resolve"), ("rlt", "resolve"), ("jct", "resolve"),
    ("xct", "spawn"), ("yIe", "createPublicKey"), ("Blt", "randomUUID"),
    ("Wlt", "undiciFetch"),
    # -- internal helpers, original names from keepNames --
    ("Ot", "readApiJson"), ("df", "atomicWriteJson"),
    ("vi", "throwIfRepoSnapshotScanAborted"), ("zct", "listGitVisibleFiles"),
    ("Vce", "buildRepoSnapshotExtra"), ("Jce", "readAcceptedBaseExtraManifest"),
    ("Xce", "buildRepoSnapshotExtraDelta"), ("Yce", "selectDeltaExtraFiles"),
    ("p4", "computeRepoSnapshotExtraManifestHash"),
    ("ys", "activeUploadOf"), ("ya", "normalizePendingUpload"),
    ("va", "stateWithSlots"), ("lc", "isSamePendingGroup"),
    ("Cl", "removePendingFileGroup"), ("Il", "protectedManifestPathsForState"),
    ("d$", "cleanupStaleRepoSnapshotEncryptedArtifacts"),
    ("sc", "getRepoSnapshotRootDir"), ("a$", "getRepoSnapshotWorkspaceDir"),
    ("rdt", "buildObjectUploadTarget"), ("edt", "encodeOssCallback"),
    ("tdt", "toServerUpdateType"), ("ndt", "ossAttributionPlaceholderValues"),
    ("kct", "hasMeaningfulContent"), ("wct", "stableJson"),
    ("pf", "canonicalRepoSnapshotJson"),
    ("cct", "canonicalizeRepoSnapshotManifestForHash"),
    ("klt", "measureRepoSnapshotWorkspaceResidentBytes"),
    ("l$", "isStaleFile"), ("Vm", "normalizePathForCompare"),
    ("iu", "removeCountedFile"), ("yi", "addCounters"),
    ("cc", "emptyCounters"), ("alt", "incrementFailureCount"),
    ("ult", "shouldExhaustPending"), ("fct", "getRepoSnapshotManifestPath"),
    ("mct", "getRepoSnapshotExtraManifestPath"),
    ("ylt", "evaluateRepoSnapshotDiskQuota"),
    ("pdt", "readWorkspaceSizeBytes"), ("ddt", "readEnvelope"),
    ("udt", "readManifest"), ("ldt", "sha256File"), ("qlt", "authHeaders"),
    ("Jm", "formatObjectKeys"), ("rct", "writeNoncePrefix"),
    ("su", "RepoSnapshotCaptureIntentScheduler"),
    ("Nk", "RepoSnapshotArtifactMaxSizeExceededError"),
    ("Dk", "RepoSnapshotGzipOutputTooLargeError"),
    # real names recovered via chunk re-export chain:
    #   host uo <- chunk export Hf <- local E2, s(E2,"buildRepoSnapshotWorkspaceKey")
    #   host Qn <- chunk export pe <- local Gp, s(Gp,"createUuid")
    ("uo", "buildRepoSnapshotWorkspaceKey"),
    ("Qn", "createUuid"),
    ("Ult", "uploadLogger"),  # je("repo-snapshot-upload")
    # -- constants --
    # schema ids: bundle builds them via repoSnapshotSchema(name, ver):
    #   Me(e,n) = `repo_snapshot_${e}/${n}`; ver: manifest/prompt/delta/
    #   encrypted_artifact/encryption_aad = "v2", others = "v1"
    ("eee", "REPO_SNAPSHOT_PROMPT_SCHEMA"),
    ("GS", "REPO_SNAPSHOT_EXTRA_MANIFEST_SCHEMA"),
    ("Q7", "REPO_SNAPSHOT_MANIFEST_SCHEMA"),
    ("tee", "REPO_SNAPSHOT_DELTA_SCHEMA"),
    ("aee", "REPO_SNAPSHOT_UPLOAD_KEY_SCHEMA"),
    ("see", "REPO_SNAPSHOT_UPLOAD_TARGET_SCHEMA"),
    ("ree", "REPO_SNAPSHOT_ENCRYPTED_ARTIFACT_SCHEMA"),
    ("oee", "REPO_SNAPSHOT_ENCRYPTION_AAD_SCHEMA"),
    ("iee", "REPO_SNAPSHOT_MANIFEST_HASH_SCHEMA"),
    ("k_e", "ENCRYPTION_OVERHEAD_BYTES"),
    ("cIe", "DISK_QUOTA_MULTIPLIER"), ("vlt", "DISK_RESERVE_MULTIPLIER"),
    ("mlt", "DEFAULT_MAX_ARTIFACT_BYTES"), ("hlt", "detectedFreeDiskBytes"),
    ("glt", "FALLBACK_FREE_DISK_BYTES"),
    ("olt", "DEFAULT_MAX_RETRY_COUNT"), ("ilt", "DEFAULT_MAX_RETENTION_MS"),
    ("Hlt", "DEFAULT_CREDENTIAL_TIMEOUT_MS"),
    ("Klt", "DEFAULT_OBJECT_UPLOAD_TIMEOUT_MS"),
    ("Glt", "CREDENTIAL_CACHE_TTL_MS"),
    ("qve", "UPLOAD_CREDENTIAL_ENDPOINT"),
    ("Tlt", "SETTINGS_BEHAVIOR_KEYS"),
    ("I5", "GLOBAL_CONFIG_FILE_NAMES"),
    ("E_e", "GLOBAL_CONFIG_SOURCE_LABELS"),
    ("qce", "GLOBAL_CONFIG_GROUP_ID"),
]

TAIL_RULES = [("!0", "true"), ("!1", "false"), ("void 0", "undefined")]

# Values recovered from the bundle (repoSnapshotSchema builder, see above).
# Applied to every block after renames; appends the literal value as a comment.
GLOBAL_SCHEMA_VALUE_COMMENTS = [
    ("schema: REPO_SNAPSHOT_PROMPT_SCHEMA,", 'schema: REPO_SNAPSHOT_PROMPT_SCHEMA, // = "repo_snapshot_prompt/v2"'),
    ("schema: REPO_SNAPSHOT_EXTRA_MANIFEST_SCHEMA,", 'schema: REPO_SNAPSHOT_EXTRA_MANIFEST_SCHEMA, // = "repo_snapshot_extra_manifest/v1"'),
    ("schema: REPO_SNAPSHOT_MANIFEST_SCHEMA,", 'schema: REPO_SNAPSHOT_MANIFEST_SCHEMA, // = "repo_snapshot_manifest/v2"'),
    ("schema: REPO_SNAPSHOT_DELTA_SCHEMA,", 'schema: REPO_SNAPSHOT_DELTA_SCHEMA, // = "repo_snapshot_delta/v2"'),
    ("schema: REPO_SNAPSHOT_UPLOAD_KEY_SCHEMA,", 'schema: REPO_SNAPSHOT_UPLOAD_KEY_SCHEMA, // = "repo_snapshot_upload_key/v1"'),
    ("schema: REPO_SNAPSHOT_UPLOAD_TARGET_SCHEMA,", 'schema: REPO_SNAPSHOT_UPLOAD_TARGET_SCHEMA, // = "repo_snapshot_upload_target/v1"'),
    ("schema: REPO_SNAPSHOT_ENCRYPTED_ARTIFACT_SCHEMA,", 'schema: REPO_SNAPSHOT_ENCRYPTED_ARTIFACT_SCHEMA, // = "repo_snapshot_encrypted_artifact/v2"'),
    ("schema: REPO_SNAPSHOT_ENCRYPTION_AAD_SCHEMA,", 'schema: REPO_SNAPSHOT_ENCRYPTION_AAD_SCHEMA, // = "repo_snapshot_encryption_aad/v2"'),
    ("schema: REPO_SNAPSHOT_MANIFEST_HASH_SCHEMA,", 'schema: REPO_SNAPSHOT_MANIFEST_HASH_SCHEMA, // = "repo_snapshot_manifest_hash/v1"'),
]

LEGAL_01 = (
    " * ── 出处与法律边界 ──────────────────────────────────────────\n"
    " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
    " *   resources/app.asar → out/host/index.js\n"
    " * 原文摘录（minified 逐字，引用/取证一律用它）：../01-sidecar-service.js\n"
    " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
    " * 原始版权归 Z.ai（智谱）所有。\n"
)

FILE_HEADERS = {
    "01-sidecar-service.js": (
        "/**\n"
        " * RepoSnapshotSidecarService — 仓库快照采集调度入口\n"
        " *\n"
        " * 上传链路阶段 1/6 · 每条用户消息发送前触发一次：打包 → 加密 → 登记待传队列。\n"
        " *\n"
        f"{LEGAL_01}"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotSidecarService     采集调度入口类（依赖注入 + 采集编排）\n"
        " *   removeGeneratedArtifactFiles   并发清理已生成产物（失败/超限回滚）\n"
        " *\n"
        " * ── 调用链位置（详见 docs/02-code-flow.md）──────────────────\n"
        " *   消息发送管线\n"
        " *     └─ captureBeforePrompt(intent)             本文件（去重调度）\n"
        " *          └─ captureBeforePromptUnsafe(intent)  本文件（采集主编排）\n"
        " *               ├─ getUploadKey()                → 04-upload-client（凭证协商）\n"
        " *               ├─ scanRepoSnapshot() 等         → 09-related（扫描/配额/路径）\n"
        " *               ├─ createEncryptedRepoSnapshotArtifact() → 09（→02 打包→03 加密）\n"
        " *               ├─ registerPendingUpload()       → 07-pending-manager（待传队列）\n"
        " *               └─ flushWorkspace()              → 06-upload-worker（上传状态机）\n"
        " *\n"
        " * Node 内建别名已还原：fs/promises.rm。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "02-archive-writer.js": (
        "/**\n"
        " * writeRepoSnapshotPlainArchive — 快照明文归档打包（tar.gz）\n"
        " *\n"
        " * 上传链路阶段 2/6 · 把 prompt 元数据 + manifest + 增量 + 文件实体组织成一棵\n"
        " * tar 目录树（root = snapshotId），交由 writeGzipTar（09-related）压缩落盘。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../02-archive-writer.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   buildRepoSnapshotDelta          两份 manifest 的增量 diff（added/modified/deleted）\n"
        " *   fileMap                         manifest.files → path 索引 Map\n"
        " *   createBufferTarEntry            内存 tar 条目（meta/*.json 用）\n"
        " *   writeRepoSnapshotPlainArchive   归档主编排：meta/ + files/ + extra-*\n"
        " *   normalizeTarPath                tar 路径规整（反斜杠→斜杠，拒绝 ..）\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   createEncryptedRepoSnapshotArtifact() [09] → writeRepoSnapshotPlainArchive()\n"
        " *     → writeGzipTar() [09]；超限错误 RepoSnapshotGzipOutputTooLargeError\n"
        " *       在此翻译成 RepoSnapshotArtifactMaxSizeExceededError（差额 = 加密 16B 头）。\n"
        " *\n"
        " * tar 内目录布局（root = snapshotId）：\n"
        " *   meta/prompt.json  meta/manifest.json  [meta/delta.json]\n"
        " *   [extra-meta/manifest.json]  [extra-meta/delta.json]\n"
        " *   files/<repo-relative-path>  extra-files/<groupId>/<path>\n"
        " *\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "03-encrypt-archive.js": (
        "/**\n"
        " * encryptArchive — 信封加密（AES-256-CTR + RSA-OAEP）\n"
        " *\n"
        " * 上传链路阶段 3/6 · 明文 tar.gz → 密文产物 + 信封 JSON。数据密钥只有\n"
        " * 服务端公钥能解开：本地加密的文件，只有厂商云端能解密。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../03-encrypt-archive.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   encryptArchive      加密主编排：生成密钥 → 流式加密 → 写信封 → 返回元数据\n"
        " *   sha256File          流式计算文件 sha256（hex）\n"
        " *   writeNoncePrefix    把 16B nonce 前缀写入密文文件头（回调式 write 包装）\n"
        " *   normalizeTarPath    tar 路径规整（与 02 重复，见 README 备注）\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   createEncryptedRepoSnapshotArtifact() [09] → encryptArchive()\n"
        " *   信封字段由 09 组装传入（envelopeInput），公钥来自 04 的上传凭证。\n"
        " *\n"
        " * Node 内建别名已还原：fs/promises: mkdir/rm/stat · fs: createReadStream/\n"
        " * createWriteStream · path: dirname · stream/promises: pipeline ·\n"
        " * crypto: randomBytes/createCipheriv/createHash/publicEncrypt/constants。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "04-upload-client.js": (
        "/**\n"
        " * RepoSnapshotUploadClient — 上传客户端：凭证协商 + OSS 直传\n"
        " *\n"
        " * 上传链路阶段 4/6 · 面向业务 API 要上传凭证（GET\n"
        " * /api/v1/snapshot/upload-credential），把凭证缓存 1 小时，并按凭证把密文\n"
        " * 产物直传阿里云 OSS（PUT 预签名 / POST 表单二选一，见 05）。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../04-upload-client.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotUploadClient      客户端类（凭证缓存 / 目标协商 / 直传）\n"
        " *   buildUploadCredentialUrl      凭证请求 URL（workspace_id 查询参数）\n"
        " *   authHeaders                   Bearer 授权头\n"
        " *   uploadCredentialTokenHash     token 的 sha256（凭证归属校验用）\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   captureBeforePromptUnsafe() [01] → getUploadKey()\n"
        " *   flushActiveUpload() [06]         → requestUploadTarget() → uploadObject() → 05\n"
        " *\n"
        " * Node 内建别名已还原：crypto: createHash/randomUUID · fs: createReadStream/\n"
        " * openAsBlob · undici.fetch（保留 undiciFetch 名以区别全局 fetch）。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "05-oss-post-object.js": (
        "/**\n"
        " * OSS 直传 — PUT 预签名 / POST 表单（含回调登记）\n"
        " *\n"
        " * 上传链路阶段 5/6 · 密文产物不经业务服务器，直接 PUT/POST 到阿里云 OSS；\n"
        " * POST 表单里带 OSS callback（base64），由 OSS 在落盘后回调业务服务器登记\n"
        " * 快照 —— 服务端由此知道这轮快照已接受，成为下一轮增量的基线。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../05-oss-post-object.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   uploadPutObject                   PUT 预签名直传\n"
        " *   uploadPostObject                  POST 表单直传（文件名固定 repo-snapshot.tar.gz.enc）\n"
        " *   buildObjectUploadTarget           凭证 + 待传请求 → OSS 表单目标与回调体\n"
        " *   encodeOssCallback                 callback 字段：base64(JSON{url,body,type})\n"
        " *   replaceOssCallbackPlaceholders    回调体 ${placeholder} 填充\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotUploadClient.uploadObject() [04]\n"
        " *     → requestUploadTarget() 内部 buildObjectUploadTarget()\n"
        " *     → uploadPutObject() / uploadPostObject()\n"
        " *\n"
        " * Node 内建别名已还原：fs: createReadStream/openAsBlob。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "06-upload-worker.js": (
        "/**\n"
        " * RepoSnapshotUploadWorker — 上传状态机（失败退避 / 晋升 / 丢弃）\n"
        " *\n"
        " * 上传链路阶段 6a · 消费 07 的待传队列：按工作区串行地「取一条待传 →\n"
        " * 换取 OSS 目标 → 直传 → 收尾」。上传失败会按原因分流：基线失效、凭证\n"
        " * 过期、体积超限、普通失败（计数退避）；成功则推进基线并晋升下一条。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../06-upload-worker.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotUploadWorker   状态机类\n"
        " *   readWorkspaceSizeBytes     从 manifest 读工作区体量（超限记录用）\n"
        " *   readEnvelope / readManifest 读信封 / 清单 JSON\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   captureBeforePromptUnsafe() [01] → flushWorkspace()\n"
        " *     → flushWorkspaceLoop() → flushActiveUpload()（单步，循环直到无待传）\n"
        " *       ├─ requestUploadTarget() / uploadObject() → 04 → 05\n"
        " *       └─ discard/fail/markAccepted…             → 07\n"
        " *\n"
        " * Node 内建别名已还原：fs/promises.readFile/stat。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "07-pending-manager.js": (
        "/**\n"
        " * RepoSnapshotPendingManager — 待传队列与状态事务（每工作区一把锁）\n"
        " *\n"
        " * 上传链路阶段 6b · 采集（01）与上传（06）之间的状态层。每个工作区一份\n"
        " * state.json：<root>/<workspaceKey>/state.json，记录 activeUpload /\n"
        " * latestPendingUpload 两个槽位与 lastAcceptedManifestHash（基线锚点）。\n"
        " * 所有变更经 withWorkspaceLock 串行执行。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../07-pending-manager.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotPendingManager   状态事务类（登记/失败/丢弃/接受/自愈）\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   01 captureBeforePromptUnsafe → registerPendingUpload / recordCompressedSize\n"
        " *   06 flushActiveUpload         → recordUploadAttempt / discard / fail / markAccepted\n"
        " *   09 enforceRepoSnapshotDiskQuota → discardStalePendingForDiskQuota\n"
        " *\n"
        " * Node 内建别名已还原：fs/promises: readdir/readFile · path.join。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "08-credential-parsing.js": (
        "/**\n"
        " * 上传凭证响应解析 — data.oss / encryption / snapshot / callback\n"
        " *\n"
        " * 阶段 4 的配套：服务端凭证响应的校验与规整。从必填字段清单能直接读出\n"
        " * 服务端下发的凭证面：OSS 表单签名族（policy / x-oss-signature / 安全\n"
        " * token …）、信封加密公钥（RSA PEM + key_version + 算法）、快照标识\n"
        " * （snapshot_id / base_snapshot_id）与 OSS 回调配置。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录（minified 逐字，引用/取证一律用它）：../08-credential-parsing.js\n"
        " * 本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容 ──────────────────────────────────────────────\n"
        " *   describeUploadCredentialShape      响应结构指纹（调试/报错用）\n"
        " *   resolveUploadCredentialData        code==0 + 必填字段校验 → 凭证数据\n"
        " *   formatObjectKeys                   对象键名排序列表（指纹底材）\n"
        " *   normalizeUploadCredentialMaxSize   max_size 容错规整（非法则忽略并告警）\n"
        " *   normalizePublicKeySpkiPem          服务端公钥 PEM 规整\n"
        " *\n"
        " * ── 调用链位置 ──────────────────────────────────────────────\n"
        " *   RepoSnapshotUploadClient.getUploadCredential() [04]\n"
        " *     → readApiJson() → resolveUploadCredentialData() → assertSupportedEncryption()\n"
        " *\n"
        " * Node 内建别名已还原：crypto.createPublicKey。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
    "09-related.js": (
        "/**\n"
        " * 快照链路公共助手 — 扫描 / 配额 / 打包加密编排 / 全局配置车道\n"
        " *\n"
        " * 01-08 各阶段的共享底层：工作区扫描（git 可见文件优先）、manifest 哈希、\n"
        " * 磁盘配额、原子 tar.gz 写入、「打包+加密」编排，以及把全局配置（MCP /\n"
        " * AGENTS.md / skills / hooks / memory …）并入快照的 extra 车道。\n"
        " *\n"
        " * ── 出处与法律边界 ──────────────────────────────────────────\n"
        " * 转写自 ZCode Desktop 3.12.2（build 4e1c9d87）\n"
        " *   resources/app.asar → out/host/index.js\n"
        " * 原文摘录：无单独逐字摘录；引用 app.asar → out/host/index.js，\n"
        " * 并回链 01-08。本文件为研究用途转写（STUDY AID），不得作为 ZCode 原文引用；\n"
        " * 原始版权归 Z.ai（智谱）所有。\n"
        " *\n"
        " * ── 本文件内容（按主题分组）────────────────────────────────\n"
        " *   扫描    scanRepoSnapshot / shouldIncludeRepoSnapshotPath\n"
        " *   哈希    canonicalizeRepoSnapshotManifestForHash / computeRepoSnapshotManifestHash\n"
        " *   配额    enforceRepoSnapshotDiskQuota / evaluateRepoSnapshotDiskQuota /\n"
        " *           resolveRepoSnapshotMaxSizeBytes / getRepoSnapshotArtifactPaths\n"
        " *   编排    createEncryptedRepoSnapshotArtifact / writeGzipTar(TwoPath)\n"
        " *   extra   buildRepoSnapshotGlobalConfigsExtraInputs / collectRepoSnapshotGlobalConfigs\n"
        " *   杂项    selectDeltaFiles / cleanupStalePendingFiles / sha256File /\n"
        " *           writeNoncePrefix / authHeaders / formatObjectKeys\n"
        " *\n"
        " * Node 内建别名已还原：path: join · fs/promises: lstat/readdir/rm ·\n"
        " * crypto: createHash。\n"
        " * readable-2.0：1.0 keepNames 转写 + 语义命名 + 叙事注释，对照表见 ./README.md。\n"
        " * 不可执行。\n"
        " */\n"
    ),
}

BLOCKS: dict[str, dict] = {}

# ───────────────────────────── 01 sidecar ─────────────────────────────

BLOCKS["RepoSnapshotSidecarService"] = {
    "words": [("t", "intent"), ("ie", "error"), ("sessionTargetFrom", "hasExtraChanges")],
    "doc": (
        "/**\n"
        " * 仓库快照采集调度入口（类名 = bundle 内 keepNames 原名）。\n"
        " *\n"
        " * 消息发送管线在每条用户消息出站前调用 captureBeforePrompt()。依赖全部\n"
        " * 构造注入：stateRepo / uploadClient / uploadWorker / pendingManager（可\n"
        " * 缺省自建）/ tokenProvider（登录态）/ userIdProvider / globalConfigsProvider\n"
        " * （全局配置供给）/ captureScheduler（采集意图调度，去重 + 超时 + 丢弃）。\n"
        " */"
    ),
    "notes": [
        (
            r"^  async captureBeforePrompt\(intent\) \{$",
            "/**\n"
            "   * 对外入口。workspaceIdentity 非空视为重复触发直接跳过；否则丢给\n"
            "   * captureScheduler 调度（同一工作区进行中的采集会去重），外部 signal\n"
            "   * 与调度器 signal 用 AbortSignal.any 合并后进入 Unsafe 主编排。\n"
            "   */",
        ),
        (
            r"^  getCaptureQueueDiagnostics\(\) \{$",
            "/** 观测口：透出 captureScheduler 的队列诊断信息（积压/超时等）。 */",
        ),
        (
            r"^  async resolveUserId\(\) \{$",
            "/** 取当前登录用户 id；供给方缺失或抛错时静默返回 undefined。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotSidecarService.constructor"] = {
    "words": [("t", "deps")],
}

BLOCKS["RepoSnapshotSidecarService.captureBeforePrompt"] = {
    "words": [("o", "schedulerSignal"), ("n", "mergedSignal")],
}

BLOCKS["RepoSnapshotSidecarService.getCaptureQueueDiagnostics"] = {}
BLOCKS["RepoSnapshotSidecarService.resolveUserId"] = {}

BLOCKS["RepoSnapshotSidecarService.captureBeforePromptUnsafe"] = {
    "literals": [
        (
            "(ie) => ie.addedOrModified.length > 0 || ie.deleted.length > 0",
            "(group) => group.addedOrModified.length > 0 || group.deleted.length > 0",
        ),
        (".map((ie) => ie.path)", ".map((changedFile) => changedFile.path)"),
        (
            "(ie) =>\n"
            "                  ie.addedOrModified.map((me) => ({\n"
            "                    groupId: ie.groupId,\n"
            "                    path: me.path,\n"
            "                  })),",
            "(group) =>\n"
            "                  group.addedOrModified.map((changedFile) => ({\n"
            "                    groupId: group.groupId,\n"
            "                    path: changedFile.path,\n"
            "                  })),",
        ),
    ],
    "words": [
        ("r", "authToken"), ("o", "nowMs"), ("n", "workspaceKey"),
        ("i", "workspaceKeyHash"),
        ("s", "uploadKey"), ("c", "turnBoundary"), ("l", "maxArtifactBytes"),
        ("d", "providerGlobalConfigs"), ("u", "mergedGlobalConfigs"),
        ("p", "extraInputs"), ("f", "workspaceScan"), ("m", "extraScan"),
        ("y", "manifestHash"), ("w", "extraManifest"),
        ("S", "extraManifestHash"), ("C", "attribution"),
        ("A", "promptPayload"), ("O", "hasBaseSnapshot"),
        ("M", "acceptedCheckpoint"), ("B", "acceptedExtraCheckpoint"),
        ("L", "captureKind"), ("F", "delta"), ("E", "extraDelta"),
        ("U", "hasFileChanges"), ("T", "includedFiles"),
        ("Z", "includedExtraFiles"), ("q", "groupId"),
        ("Q", "artifactPaths"), ("J", "artifact"),
    ],
    "notes": [
        (
            r"^  async captureBeforePromptUnsafe\(intent\) \{$",
            "/**\n"
            "   * 采集主编排（Unsafe = 不自带去重/并发保护，由 captureScheduler 保证单飞）。\n"
            "   * 步骤：\n"
            "   *  1. 校验登录态（无 token 直接放弃 —— 未登录不采集）\n"
            "   *  2. getUploadKey 向服务端要上传凭证（RSA 公钥 + snapshotId + 体积上限）\n"
            "   *  3. 磁盘配额检查 + 记录本轮失败计数\n"
            "   *  4. 并行扫描：工作区文件 scanRepoSnapshot + 全局配置 buildRepoSnapshotExtra\n"
            "   *  5. 决定 baseline / increment（上一轮清单被服务端接受过且本地可读 → 增量）\n"
            "   *  6. createEncryptedRepoSnapshotArtifact：tar.gz 打包 → AES-256-CTR 加密\n"
            "   *  7. registerPendingUpload 登记待传队列，并踢一下上传状态机\n"
            "   * 任一步 abort 即终止；产物超限不抛错，静默放弃本轮。\n"
            "   */",
        ),
        (
            r"await this\.tokenProvider\(\)",
            "// 登录 token；拿不到 = 未登录，整轮采集静默放弃",
        ),
        (
            r"this\.uploadClient\.getUploadKey",
            "// 凭证协商：服务端返回 RSA 公钥、snapshotId（含基线 baseSnapshotId）、maxSize",
        ),
        (
            r"await enforceRepoSnapshotDiskQuota",
            "// 磁盘配额：驻留产物超限先清 stale 待传再复查；仍超限则放弃本轮",
        ),
        (
            r"scanRepoSnapshot\(\{",
            "// 并行扫两个车道：工作区文件（含 .git 全历史）与全局配置（MCP/AGENTS.md/skills/hooks…）",
        ),
        (
            r"^      acceptedCheckpoint =$",
            "// 读上次被服务端接受的清单检查点（lastAcceptedManifest*）；能读出才可能走增量",
        ),
        (
            r"captureKind = acceptedCheckpoint",
            "// 增量的前提：服务端确认过上一轮 manifest（基线链留在服务端，见 docs/05）",
        ),
        (
            r"delta = acceptedCheckpoint",
            "// 与已接受基线做 diff：增量只打包 addedOrModified/deleted 文件",
        ),
        (
            r"await createEncryptedRepoSnapshotArtifact\(\{",
            "// 打包 tar.gz（02）→ AES-256-CTR 加密 + 信封（03）；产物路径见 artifactPaths",
        ),
        (
            r"instanceof RepoSnapshotArtifactMaxSizeExceededError",
            "// 加密产物超限：记录体量、清理半成品，本轮静默放弃（不向调用方报错）",
        ),
        (
            r"await this\.pendingManager\.registerPendingUpload\(",
            "// 登记待传队列；lastAcceptedManifestHash 只在服务端接受后才推进（07）",
        ),
        (
            r"this\.uploadWorker\.flushWorkspace\(",
            "// 立即踢上传状态机；不 await 结果也不因失败回滚采集",
        ),
    ],
}

BLOCKS["removeGeneratedArtifactFiles"] = {
    "words": [("e", "paths")],
    "doc": (
        "/**\n"
        " * 并发清理一轮采集生成过的所有产物（Promise.allSettled：单个失败不影响\n"
        " * 其余）。明文包必须删；密文/信封/清单在登记待传前失败时也一并清。\n"
        " */"
    ),
}

# ───────────────────────────── 02 archive ─────────────────────────────

BLOCKS["buildRepoSnapshotDelta"] = {
    "literals": [
        (
            "    o = e.nextManifest.files\n"
            "      .filter((i) => {\n"
            "        let s = t.get(i.path);\n"
            "        return !s || s.sizeBytes !== i.sizeBytes;\n"
            "      })\n"
            "      .map(({ path: i, sizeBytes: s }) => ({ path: i, sizeBytes: s }))\n"
            "      .sort((i, s) => i.path.localeCompare(s.path)),\n"
            "    n = e.baseManifest.files\n"
            "      .filter((i) => !r.has(i.path))\n"
            "      .map((i) => i.path)\n"
            "      .sort((i, s) => i.localeCompare(s));",
            "    addedOrModified = input.nextManifest.files\n"
            "      .filter((nextFile) => {\n"
            "        let baseEntry = baseFiles.get(nextFile.path);\n"
            "        return !baseEntry || baseEntry.sizeBytes !== nextFile.sizeBytes;\n"
            "      })\n"
            "      .map(({ path, sizeBytes }) => ({ path, sizeBytes }))\n"
            "      .sort((a, b) => a.path.localeCompare(b.path)),\n"
            "    deleted = input.baseManifest.files\n"
            "      .filter((baseFile) => !nextFiles.has(baseFile.path))\n"
            "      .map((baseFile) => baseFile.path)\n"
            "      .sort((a, b) => a.localeCompare(b));",
        ),
    ],
    "words": [
        ("e", "input"), ("t", "baseFiles"), ("r", "nextFiles"),
        ("o", "addedOrModified"), ("n", "deleted"),
    ],
    "doc": (
        "/**\n"
        " * 计算两份 manifest 的增量：新增或体积变化的文件进 addedOrModified（按\n"
        " * 路径排序稳定 diff），基线有而本轮没有的进 deleted。结果带前后 manifest\n"
        " * 哈希，供服务端核对基线链。\n"
        " */"
    ),
}

BLOCKS["fileMap"] = {
    "words": [("e", "manifest"), ("t", "file")],
    "doc": "/** manifest.files 按 path 建索引，供增量 diff 查 O(1)。 */",
}

BLOCKS["createBufferTarEntry"] = {
    "words": [("e", "path"), ("t", "content"), ("r", "jsonBytes")],
    "doc": "/** 把 JS 对象序列化成 2 空格缩进 JSON 的内存 tar 条目（meta/*.json 用）。 */",
}

BLOCKS["writeRepoSnapshotPlainArchive"] = {
    "literals": [
        (
            "  for (let n of [...e.files].sort((i, s) => i.path.localeCompare(s.path)))\n"
            "    r.push({\n"
            "      path: `${t}/files/${n.path}`,\n"
            "      absolutePath: n.absolutePath,\n"
            "      sizeBytes: n.sizeBytes,\n"
            "    });",
            "  for (let file of [...input.files].sort((a, b) =>\n"
            "    a.path.localeCompare(b.path),\n"
            "  ))\n"
            "    entries.push({\n"
            "      path: `${snapshotId}/files/${file.path}`,\n"
            "      absolutePath: file.absolutePath,\n"
            "      sizeBytes: file.sizeBytes,\n"
            "    });",
        ),
        (
            "  for (let n of [...(e.extraFiles ?? [])].sort((i, s) =>\n"
            "    i.groupId === s.groupId\n"
            "      ? i.path.localeCompare(s.path)\n"
            "      : i.groupId.localeCompare(s.groupId),\n"
            "  )) {",
            "  for (let extraFile of [...(input.extraFiles ?? [])].sort((a, b) =>\n"
            "    a.groupId === b.groupId\n"
            "      ? a.path.localeCompare(b.path)\n"
            "      : a.groupId.localeCompare(b.groupId),\n"
            "  )) {",
        ),
        (
            "  } catch (n) {\n"
            "    throw n instanceof Dk && e.maxEncryptedArtifactBytes !== void 0\n"
            "      ? new Nk({\n"
            "          maxEncryptedArtifactBytes: e.maxEncryptedArtifactBytes,\n"
            "          actualEncryptedArtifactBytes: n.actualOutputBytes + k_e,\n"
            "        })\n"
            "      : n;\n"
            "  }",
            "  } catch (error) {\n"
            "    throw error instanceof RepoSnapshotGzipOutputTooLargeError &&\n"
            "      input.maxEncryptedArtifactBytes !== undefined\n"
            "      ? new RepoSnapshotArtifactMaxSizeExceededError({\n"
            "          maxEncryptedArtifactBytes: input.maxEncryptedArtifactBytes,\n"
            "          actualEncryptedArtifactBytes:\n"
            "            error.actualOutputBytes + ENCRYPTION_OVERHEAD_BYTES,\n"
            "        })\n"
            "      : error;\n"
            "  }",
        ),
    ],
    "words": [
        ("e", "input"), ("t", "snapshotId"), ("r", "entries"),
        ("o", "maxCompressedBytes"), ("n", "extraFile"), ("i", "entryPath"),
    ],
    "doc": (
        "/**\n"
        " * 归档主编排：meta（prompt/manifest[/delta][/extra-*]）+ files/ +\n"
        " * extra-files/ 组装成 tar 条目列表后经 writeGzipTar 压缩落盘。加密会给\n"
        " * 密文头部追加 16B nonce（ENCRYPTION_OVERHEAD_BYTES），所以压缩阶段的上限\n"
        " * 是 maxEncryptedArtifactBytes 减去这份开销；超限错误在这里换算成对外的\n"
        " * RepoSnapshotArtifactMaxSizeExceededError。\n"
        " */"
    ),
    "notes": [
        (
            r"^async function writeRepoSnapshotPlainArchive",
            "// 调用方：createEncryptedRepoSnapshotArtifact（09）；root 目录名 = snapshotId",
        ),
        (
            r"meta/prompt\.json",
            "// prompt.json 内含用户提问原文（content）、模型、会话/消息 id 等归因元数据",
        ),
        (
            r"maxCompressedBytes =",
            "// 给压缩阶段预留 16B 加密头（ENCRYPTION_OVERHEAD_BYTES），见函数 doc",
        ),
    ],
}

BLOCKS["normalizeTarPath"] = {
    "words": [("e", "path"), ("t", "normalized"), ("r", "segment")],
    "doc": (
        "/**\n"
        " * tar 路径规整：反斜杠归一为斜杠、去掉开头的 /；空段或 .. 段直接抛错\n"
        " * （防路径穿越）。注意：02 与 03 各有一份逐字相同的实现（bundle 内重复），\n"
        " * 本仓库按原样分文件保留。\n"
        " */"
    ),
}

# ───────────────────────────── 03 encrypt ─────────────────────────────

BLOCKS["encryptArchive"] = {
    "literals": [
        (
            "  // y_e=mkdir, w_e=dirname, v_e=randomBytes, Xst=createCipheriv\n"
            "  // ect=createWriteStream, rct=writeNoncePrefix, nct=pipeline\n"
            "  // b_e=createReadStream, Qst=publicEncrypt, Jst=crypto.constants\n"
            "  // df=writeJson, tct=fs.stat\n",
            "",
        ),
    ],
    "words": [
        ("e", "input"), ("t", "dataKey"), ("r", "noncePrefix"),
        ("o", "plaintextSha256"), ("n", "cipher"), ("i", "cipherOutput"),
        ("s", "envelope"), ("c", "encryptedStat"),
    ],
    "doc": (
        "/**\n"
        " * 信封加密编排：\n"
        " *  1. 随机生成 32B 数据密钥（AES-256）与 16B CTR nonce\n"
        " *  2. 明文 tar.gz 流式 AES-256-CTR 加密落盘，nonce 以 16B 前缀写在密文头\n"
        " *  3. 数据密钥用服务端 RSA 公钥（RSA-OAEP-SHA256）封装成 encryptedDataKey\n"
        " *  4. 信封 JSON（含明文 sha256）原子落盘\n"
        " * 私钥只在服务端 —— 本地加密的快照只有厂商云端能解。\n"
        " */"
    ),
    "notes": [
        (
            r"let dataKey = randomBytes\(32\)",
            "// 32B AES-256 数据密钥；只以 RSA 封装后的形态离开本机",
        ),
        (
            r"noncePrefix = randomBytes\(16\)",
            "// 16B CTR IV，明文存于密文文件头（ciphertext-prefix-16-byte）",
        ),
        (
            r"cipher = createCipheriv\(",
            "// 流式加密：明文 tar.gz → pipeline → 密文文件（先写 16B nonce 前缀）",
        ),
        (
            r"encryptedDataKey: publicEncrypt\(",
            "// RSA-OAEP-SHA256 封装数据密钥；公钥来自 04 的上传凭证（服务端下发）",
        ),
        (
            r"await atomicWriteJson\(input\.envelopePath",
            "// 信封 = 解密说明书：算法/keyId/nonce 编码/AAD + 封装后的密钥 + 明文哈希",
        ),
    ],
}

BLOCKS["sha256File"] = {
    "words": [
        ("e", "filePath"), ("t", "hash"), ("r", "resolve"), ("o", "reject"),
        ("n", "stream"), ("i", "chunk"),
    ],
    "doc": "/** 流式计算文件 sha256（hex）。加密前后各算一次：明文进信封，密文进上传请求。 */",
}

BLOCKS["writeNoncePrefix"] = {
    "words": [
        ("e", "stream"), ("t", "noncePrefix"), ("r", "resolve"),
        ("o", "reject"), ("n", "error"),
    ],
    "doc": (
        "/** 回调式 write 包装：把 16B nonce 前缀写进密文文件头，失败向上传递。 */"
    ),
}

# ───────────────────────────── 04 upload client ───────────────────────

BLOCKS["RepoSnapshotUploadClient"] = {
    "doc": (
        "/**\n"
        " * 上传客户端（类名 = bundle 内 keepNames 原名）。uploadCredentialsByHandle\n"
        " * 以随机 handle 缓存凭证（1 小时 TTL），换目标时校验「token 哈希 +\n"
        " * workspaceId」归属，防止跨工作区/跨账号错用凭证。\n"
        " */"
    ),
}

BLOCKS["RepoSnapshotUploadClient.constructor"] = {"words": [("t", "deps")]}

BLOCKS["RepoSnapshotUploadClient.getUploadCredential"] = {
    "words": [
        ("t", "authToken"), ("r", "workspaceId"), ("o", "signal"),
        ("n", "credentialUrl"), ("i", "response"), ("s", "credential"),
    ],
    "notes": [
        (
            r"^  async getUploadCredential\(authToken",
            "/**\n"
            "   * GET /api/v1/snapshot/upload-credential（Bearer 认证）。响应经\n"
            "   * resolveUploadCredentialData（08）校验 + assertSupportedEncryption 断言\n"
            "   * 加密算法受支持；服务端拒绝（code!=0）或无 data 时返回 null。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadClient.pruneExpiredUploadCredentials"] = {
    "words": [("t", "nowMs"), ("r", "handle"), ("o", "entry")],
    "notes": [
        (
            r"^  pruneExpiredUploadCredentials\(nowMs",
            "/** 清理过期凭证缓存；取凭证前/换目标前都会调用。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadClient.getUploadKey"] = {
    "words": [
        ("t", "authToken"), ("r", "workspaceId"), ("o", "traceId"),
        ("n", "options"), ("i", "credential"), ("s", "handle"),
    ],
    "notes": [
        (
            r"^  async getUploadKey\(authToken",
            "/**\n"
            "   * 01 的入口：要凭证 → 缓存 → 组装内部 uploadKey 结构\n"
            "   * （RSA 公钥 PEM / keyId=服务端 key_version / snapshotId+baseSnapshotId /\n"
            "   * maxSizeBytes）。workspaceId 实参是本地的 workspaceKeyHash（01 传入）。\n"
            "   */",
        ),
        (
            r"this\.uploadCredentialsByHandle\.set\(handle",
            "// 凭证缓存 1 小时（CREDENTIAL_CACHE_TTL_MS），换目标时按 handle 取回",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadClient.requestUploadTarget"] = {
    "words": [
        ("t", "authToken"), ("r", "request"), ("o", "traceId"),
        ("n", "options"), ("i", "cached"),
    ],
    "notes": [
        (
            r"^  async requestUploadTarget\(authToken",
            "/**\n"
            "   * 凭证 → OSS 直传目标。handle 不存在/过期 → key_expired；归属校验\n"
            "   * （workspaceKeyHash 与 token 哈希不匹配）同样 key_expired；通过则交给\n"
            "   * buildObjectUploadTarget（05）组装表单与回调。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadClient.consumeUploadCredential"] = {
    "words": [("t", "handle")],
    "notes": [
        (
            r"^  consumeUploadCredential\(handle",
            "/** 一次性消费：该凭证对应的上传结束后即从缓存移除。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadClient.uploadObject"] = {
    "words": [
        ("t", "request"), ("r", "fetchImpl"), ("o", "timeoutSignal"),
        ("n", "mergedSignal"), ("i", "response"), ("s", "errorBody"),
    ],
    "notes": [
        (
            r"^  async uploadObject\(request\) \{$",
            "/**\n"
            "   * OSS 直传统一入口：按凭证给的方法走 PUT（05.uploadPutObject）或 POST\n"
            "   * （05.uploadPostObject）。整体超时 60s；失败不重试 —— 重试/退避在 06 状态机。\n"
            "   */",
        ),
    ],
}

BLOCKS["buildUploadCredentialUrl"] = {
    "words": [("e", "workspaceId"), ("t", "url")],
    "doc": "/** 凭证端点 + workspace_id 查询参数；端点常量可被环境变量覆盖。 */",
}

BLOCKS["authHeaders"] = {
    "words": [("e", "authToken")],
    "doc": "/** Bearer 授权头（登录态 token）。 */",
}

BLOCKS["uploadCredentialTokenHash"] = {
    "words": [("e", "authToken")],
    "doc": "/** token 的 sha256（hex）。缓存凭证记哈希不记原文，归属校验用。 */",
}

# ───────────────────────────── 05 oss ─────────────────────────────

BLOCKS["uploadPutObject"] = {
    "words": [("e", "request"), ("t", "headers"), ("r", "checksum")],
    "doc": (
        "/**\n"
        " * PUT 预签名直传：以凭证给的表头为基础，附加快名校验头，body 为密文文件\n"
        " * 流（duplex half）；redirect: error 防止把密文跟到别的域。\n"
        " */"
    ),
}

BLOCKS["uploadPostObject"] = {
    "words": [
        ("e", "request"), ("t", "form"), ("r", "fileBlob"),
        ("o", "field"), ("n", "value"),
    ],
    "doc": (
        "/**\n"
        " * POST 表单直传：凭证下发 policy/x-oss-signature/安全 token 等表单域，\n"
        " * 文件字段名固定 repo-snapshot.tar.gz.enc（OSS 回调与审计都认这个名）。\n"
        " */"
    ),
}

BLOCKS["buildObjectUploadTarget"] = {
    "words": [
        ("e", "input"), ("t", "request"), ("r", "credential"),
        ("o", "maxSizeBytes"), ("n", "snapshotId"), ("i", "updateType"),
        ("s", "attributionFields"), ("c", "checksum"),
        ("l", "callbackBody"),
    ],
    "doc": (
        "/**\n"
        " * 凭证 + 待传请求 → OSS POST 目标：\n"
        " *  1. 体积预检：超 max_size 直接 payload_too_large（06 会记录体量并丢弃）\n"
        " *  2. 回调体模板填占位符：update_type（baseline/increment → 服务端命名）、\n"
        " *     checksum（sha256:密文哈希）、encrypted_aes_key（RSA 封装的密钥，base64）\n"
        " *  3. callback 字段 = base64(JSON{url, body, content_type})，OSS 落盘后回调\n"
        " *     业务服务器登记 —— 服务端由此知道快照已接受，成为下轮增量基线。\n"
        " */"
    ),
    "notes": [
        (
            r"ossAttributionPlaceholderValues\(request\.attribution\)",
            "// 归因元数据（会话/消息/模型等）展开进回调体，服务端据此入库存档",
        ),
    ],
}

BLOCKS["encodeOssCallback"] = {
    "words": [("e", "input")],
    "doc": "/** OSS callback 协议字段：base64(JSON{callbackUrl, callbackBody, callbackBodyType})。 */",
}

BLOCKS["replaceOssCallbackPlaceholders"] = {
    "words": [("e", "template"), ("t", "values"), ("r", "matched"), ("o", "key")],
    "doc": (
        "/** 回调体模板 ${name} 填充；URL 编码后替换，未注册的占位符原样保留。 */"
    ),
}

# ───────────────────────────── 06 worker ─────────────────────────────

BLOCKS["RepoSnapshotUploadWorker"] = {
    "doc": (
        "/**\n"
        " * 上传状态机（类名 = bundle 内 keepNames 原名）。flushesByWorkspaceKey\n"
        " * 保证同一工作区同时只有一个上传链在跑；每步结果决定继续循环还是收工。\n"
        " */"
    ),
}

BLOCKS["RepoSnapshotUploadWorker.constructor"] = {"words": [("t", "deps")]}

BLOCKS["RepoSnapshotUploadWorker.flushWorkspace"] = {
    "words": [("t", "trigger"), ("r", "workspaceKey"), ("n", "flushPromise")],
    "notes": [
        (
            r"^  async flushWorkspace\(trigger\) \{$",
            "/**\n"
            "   * 把本轮 flush 链式挂到该工作区上一个 flush 后面（串行化，防并发双传），\n"
            "   * 循环单步直到没有可传的待传项。01 采集完登记队列后调用这里。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadWorker.flushWorkspaceLoop"] = {
    "words": [("t", "trigger")],
    "notes": [
        (
            r"^  async flushWorkspaceLoop\(trigger\) \{$",
            "/** flushActiveUpload 返回 true = 还有后续（如晋升了下一条），继续循环。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadWorker.flushActiveUpload"] = {
    "literals": [
        (
            "      let p = await this.pendingManager.discardPendingUpload(t, i);\n"
            "      return (this.consumePendingCredential(i), p === \"promoted\");",
            "      let discardOutcome = await this.pendingManager.discardPendingUpload(\n"
            "        trigger,\n"
            "        attempt,\n"
            "      );\n"
            "      return (\n"
            "        this.consumePendingCredential(attempt),\n"
            "        discardOutcome === \"promoted\"\n"
            "      );",
        ),
        (
            "        let f = await this.pendingManager.discardPendingUpload(t, i);\n"
            "        return (this.consumePendingCredential(i), f === \"promoted\");",
            "        let discardOutcome =\n"
            "          await this.pendingManager.discardPendingUpload(trigger, attempt);\n"
            "        return (\n"
            "          this.consumePendingCredential(attempt),\n"
            "          discardOutcome === \"promoted\"\n"
            "        );",
        ),
        (
            "let f = await pdt(i.manifestPath);",
            "let workspaceSizeBytes = await readWorkspaceSizeBytes(attempt.manifestPath);",
        ),
        (
            "        let m = await this.pendingManager.discardPendingUpload(t, i);\n"
            "        return (this.consumePendingCredential(i), m === \"promoted\");",
            "        let discardOutcome =\n"
            "          await this.pendingManager.discardPendingUpload(trigger, attempt);\n"
            "        return (\n"
            "          this.consumePendingCredential(attempt),\n"
            "          discardOutcome === \"promoted\"\n"
            "        );",
        ),
    ],
    "words": [
        ("t", "trigger"), ("r", "state"), ("o", "pending"), ("n", "authToken"),
        ("i", "attempt"), ("s", "credentialHandle"), ("c", "targetRequest"),
        ("l", "target"), ("p", "failOutcome"), ("f", "workspaceSizeBytes"),
    ],
    "notes": [
        (
            r"^  async flushActiveUpload\(trigger\) \{$",
            "/**\n"
            "   * 状态机单步：取一条待传（activeUpload 优先，回落 latestPendingUpload），\n"
            "   * 走「记尝试 → 换目标 → 直传 → 收尾」。返回值 = 是否还有后续。\n"
            "   *\n"
            "   * 失败分流：\n"
            "   *   基线失效（base_not_found/base_invalid/hash_mismatch）→ 清本地基线，丢弃本轮\n"
            "   *   key_expired / payload_too_large                      → 丢弃本轮，可能晋升下一条\n"
            "   *   其它失败                                             → 计失败数；超限(3次/24h)才丢，否则保留待重试\n"
            "   * 成功 → markAcceptedManifest 推进基线（下轮增量锚点）并晋升下一条。\n"
            "   */",
        ),
        (
            r"pending = state\.activeUpload",
            "// 优先传 activeUpload（登记中的当前轮），没有才补传 latest（上一轮遗留）",
        ),
        (
            r"recordUploadAttempt\(trigger, pending\)",
            "// 记一次尝试（attemptCount+1）；返回 null = 待传已被其它流程处理（stale）",
        ),
        (
            r"await this\.stateRepo\.clearAcceptedManifest\(trigger\)",
            "// 服务端说基线不存在/不匹配：清掉本地基线 —— 下轮只能走 baseline 全量",
        ),
        (
            r"await this\.pendingManager\.markAcceptedManifest\(trigger, attempt",
            "// OSS 回调成功即视为服务端接受：基线推进到本轮 manifest（07）",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadWorker.consumePendingCredential"] = {
    "words": [("t", "attempt"), ("r", "handle")],
    "notes": [
        (
            r"^  consumePendingCredential\(attempt\) \{$",
            "/** 所有收尾路径统一消费凭证，避免 1h 缓存里挂着已用过的 handle。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotUploadWorker.buildUploadTargetRequest"] = {
    "words": [
        ("t", "args"), ("r", "envelope"), ("o", "encryptedStat"),
        ("n", "encryptedSha256"),
    ],
    "notes": [
        (
            r"^  async buildUploadTargetRequest\(args\) \{$",
            "/**\n"
            "   * 换目标请求体：读信封 JSON + stat 密文 + 算密文 sha256，连同基线链\n"
            "   * （baseManifestHash）一起交给服务端校验 —— 服务端验基线就是在这里。\n"
            "   */",
        ),
    ],
}

BLOCKS["readWorkspaceSizeBytes"] = {
    "words": [("e", "manifestPath"), ("r", "includedBytes")],
    "doc": "/** 从 manifest.stats 读工作区体量；读不到（缺失/损坏）返回 undefined。 */",
}

BLOCKS["readEnvelope"] = {
    "words": [("e", "path")],
    "doc": "/** 读信封 JSON（含 encryptedDataKey 等，供换目标请求体使用）。 */",
}

BLOCKS["readManifest"] = {
    "words": [("e", "path")],
    "doc": "/** 读 manifest JSON（目前只用其 stats.includedBytes）。 */",
}

# ───────────────────────────── 07 pending manager ─────────────────────

BLOCKS["RepoSnapshotPendingManager"] = {
    "doc": (
        "/**\n"
        " * 待传队列与状态事务（类名 = bundle 内 keepNames 原名）。状态文件布局：\n"
        " * <root>/<workspaceKey>/state.json，两个槽位 activeUpload /\n"
        " * latestPendingUpload + 基线锚点 lastAcceptedManifestHash(/Path) 与\n"
        " * lastCompressedSize、failureCount。operationsByWorkspaceKey 是按工作区的\n"
        " * Promise 链锁。\n"
        " */"
    ),
}

BLOCKS["RepoSnapshotPendingManager.constructor"] = {"words": [("t", "deps")]}

BLOCKS["RepoSnapshotPendingManager.initialize"] = {
    "notes": [
        (
            r"^  initialize\(\) \{$",
            "/** 懒初始化（只跑一次）：自愈持久化状态 + 清理 stale 加密产物。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.repairPersistedStates"] = {
    "words": [
        ("t", "rootDir"), ("r", "entries"), ("o", "entry"),
        ("n", "workspaceDir"), ("i", "persisted"),
    ],
    "notes": [
        (
            r"^  async repairPersistedStates\(\) \{$",
            "/** 启动自愈：遍历根目录下每个工作区目录，修 state.json 槽位与残留文件。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.readPersistedState"] = {
    "words": [("t", "path")],
    "notes": [
        (
            r"^  async readPersistedState\(path\) \{$",
            "/** 读 state.json；缺失/损坏一律当 null（自愈视角下宁可重建）。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.repairPersistedState"] = {
    "words": [
        ("t", "state"), ("r", "activeUpload"), ("o", "latestPendingUpload"),
        ("n", "activeIntact"), ("i", "latestIntact"), ("s", "promotedActive"),
        ("c", "demotedLatest"), ("d", "group"),
    ],
    "notes": [
        (
            r"^  async repairPersistedState\(state\) \{$",
            "/**\n"
            "   * 单工作区自愈：必需文件齐全的待传才配占槽位；active/latest 都完好但\n"
            "   * 不是同一条时，latest 降级保留 —— 与登记规则（07.registerPendingUpload）\n"
            "   * 对齐，再把孤儿产物文件清掉。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.withWorkspaceLock"] = {
    "words": [
        ("t", "input"), ("r", "operation"), ("o", "workspaceKey"),
        ("i", "chain"),
    ],
    "notes": [
        (
            r"^  async withWorkspaceLock\(input, operation\) \{$",
            "/** 工作区级互斥：所有状态变更挂在同一条 Promise 链上串行执行。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.recordFailureCountAtTurnBoundary"] = {
    "words": [
        ("t", "input"), ("r", "state"), ("o", "activeUpload"),
        ("n", "countedActive"), ("i", "nextState"),
    ],
    "notes": [
        (
            r"^  async recordFailureCountAtTurnBoundary\(input",
            "/**\n"
            "   * 01 每轮采集前调用：把上一轮已计数的失败固化为 failureCount 并标记\n"
            "   * failureCountedAt，防止同一次失败被反复计数（退避依据，见 06）。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.recordCompressedSize"] = {
    "words": [("t", "input"), ("r", "record"), ("n", "nextState")],
    "notes": [
        (
            r"^  async recordCompressedSize\(input, record\) \{$",
            "/** 记录本轮加密产物体量（encryptedSizeBytes/workspaceSizeBytes）供配额用。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.discardStalePendingForDiskQuota"] = {
    "words": [
        ("t", "input"), ("r", "state"), ("o", "activeUpload"),
        ("n", "latestPendingUpload"), ("i", "nextState"),
    ],
    "notes": [
        (
            r"^  async discardStalePendingForDiskQuota\(input\) \{$",
            "/** 配额吃紧时丢掉已计过失败的 active（stale），给新一轮腾地方；成功返回 true。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.registerPendingUpload"] = {
    "words": [
        ("t", "input"), ("r", "pending"), ("o", "state"),
        ("n", "activeUpload"), ("i", "latestPendingUpload"),
        ("s", "incoming"), ("c", "nextState"), ("l", "idleState"),
    ],
    "notes": [
        (
            r"^  async registerPendingUpload\(input, pending\) \{$",
            "/**\n"
            "   * 01 采集完成后登记新待传：无 active 直接占 active 槽；有 active 时新条目\n"
            "   * 进 latest 槽（排队），被顶掉/替换的旧条目清文件（保 manifest 供自愈）。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.recordUploadAttempt"] = {
    "words": [
        ("t", "input"), ("r", "pending"), ("o", "state"),
        ("n", "activeUpload"), ("i", "countedActive"),
    ],
    "notes": [
        (
            r"^  async recordUploadAttempt\(input, pending\) \{$",
            "/** 06 每次尝试前调用：attemptCount+1 + lastAttemptAt；不匹配返回 null（stale）。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.failPendingUpload"] = {
    "words": [
        ("t", "input"), ("r", "pending"), ("o", "state"),
        ("n", "activeUpload"), ("i", "latestPendingUpload"),
        ("c", "promotedState"), ("s", "clearedState"),
    ],
    "notes": [
        (
            r"^  async failPendingUpload\(input, pending\) \{$",
            "/**\n"
            "   * 普通失败收口：有排队的 latest → 晋升（\"promoted\"）；重试未超限\n"
            "   * （shouldExhaustPending：3 次 / 24h 内）→ 保留等下轮（\"retained\"）；\n"
            "   * 超限 → 丢弃（\"discarded\"）。待传已换人返回 \"stale\"。\n"
            "   */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.discardPendingUpload"] = {
    "words": [
        ("t", "input"), ("r", "pending"), ("o", "options"), ("n", "state"),
        ("i", "activeUpload"), ("s", "promotedFrom"), ("c", "nextState"),
    ],
    "notes": [
        (
            r"^  async discardPendingUpload\(input, pending, options\) \{$",
            "/** 明确丢弃（基线失效/凭证过期/超限）：清文件；discardLatest 时连同 latest 一起清。 */",
        ),
    ],
}

BLOCKS["RepoSnapshotPendingManager.markAcceptedManifest"] = {
    "words": [
        ("t", "input"), ("r", "pending"), ("o", "accepted"), ("n", "state"),
        ("i", "activeUpload"), ("s", "promotedFrom"), ("c", "nextState"),
    ],
    "notes": [
        (
            r"^  async markAcceptedManifest\(input, pending, accepted\) \{$",
            "/**\n"
            "   * OSS 回调成功后的收尾：写入 lastAcceptedManifestHash/Path —— 下一轮增量的\n"
            "   * 基线锚点。这也意味着服务端必然留存了这份 manifest（增量 diff 的基线），\n"
            "   * 「数据立即销毁」的说法与此直接冲突（docs/05）。\n"
            "   */",
        ),
    ],
}

# ───────────────────────────── 08 credential parsing ──────────────────

BLOCKS["describeUploadCredentialShape"] = {
    "words": [("e", "credential")],
    "doc": (
        "/** 响应结构指纹：code/msg + 各层键名列表，报错时附上便于对账。 */"
    ),
}

BLOCKS["resolveUploadCredentialData"] = {
    "literals": [
        (
            r'"upload-credential \u8FD4\u56DE\u4E86\u975E\u6CD5 max_size\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u5B57\u6BB5"',
            '"upload-credential 返回了非法 max_size，已忽略该字段"',
        ),
    ],
    "words": [
        ("e", "credential"), ("t", "missing"), ("r", "data"),
        ("o", "maxSizeBytes"), ("n", "maxSize"), ("i", "rest"),
    ],
    "doc": (
        "/**\n"
        " * 凭证响应校验：code!=0 抛错；无 data 返回 null；必填字段缺失抛错并附\n"
        " * 指纹。必填清单即服务端凭证面：oss.host/path/policy/x-oss-signature(+\n"
        " * version/credential/date)/x-oss-security-token、encryption.public_key/\n"
        " * key_version/algorithm、snapshot.snapshot_id、callback.url/body/content_type。\n"
        " */"
    ),
}

BLOCKS["formatObjectKeys"] = {
    "words": [("e", "value")],
    "doc": "/** 对象键名排序逗号串；非对象返回 \"none\"。指纹底材。 */",
}

BLOCKS["normalizeUploadCredentialMaxSize"] = {
    "words": [("e", "maxSize"), ("t", "parsed")],
    "doc": "/** max_size 容错：字符串数字也收，负数/非有限数一律视为未提供。 */",
}

BLOCKS["normalizePublicKeySpkiPem"] = {
    # 1.0 里被 prettier 展开的换行规整链，整段重写为等价紧凑形式
    "regex": [
        (
            r"let t = e\n    \.trim\(\)\n    \.replaceAll\([\s\S]*?    \);",
            'let trimmed = pem\n'
            '    .trim()\n'
            '    .replaceAll("\\\\r\\\\n", "\\n")\n'
            '    .replaceAll("\\\\n", "\\n")\n'
            '    .replaceAll("\\r\\n", "\\n");',
        ),
    ],
    "words": [("e", "pem"), ("t", "trimmed"), ("r", "normalized"), ("o", "rsaVariant")],
    "doc": (
        "/**\n"
        " * 服务端公钥 PEM 规整：统一换行、补尾换行；createPublicKey 校验失败时\n"
        " * 把 SPKI 头换成 RSA 头再试一次，仍失败则原样返回（后续加密阶段才会暴露）。\n"
        " */"
    ),
}

# ───────────────────────────── 09 related ─────────────────────────────

BLOCKS["scanRepoSnapshot"] = {
    "words": [
        ("e", "request"), ("t", "workspaceKey"), ("r", "includedFiles"),
        ("o", "discoveredPaths"), ("n", "candidatePaths"),
        ("i", "absolutePath"), ("s", "relativePath"), ("c", "stats"),
        ("l", "isSymbolicLink"), ("u", "sample"), ("f", "error"),
    ],
    "doc": (
        "/**\n"
        " * 扫描工作区：候选路径优先取 git 可见文件（listGitVisibleFiles，spawn\n"
        " * git），失败/为空兜底 walkFiles 递归，再补 .git 根元数据。逐个 lstat +\n"
        " * 采样，经两道过滤（采样前 shouldIncludeRepoSnapshotPathBeforeSample：\n"
        " * 大小/符号链接；采样后 shouldIncludeRepoSnapshotPath：二进制探测）后\n"
        " * 收录。产出 files[] 与 manifest（workspaceKey/createdAt/files/stats）。\n"
        " * .git 全历史默认在内 —— 只排除本工具自己的产物目录。\n"
        " */"
    ),
    "notes": [
        (
            r"listGitVisibleFiles\(request\.workspacePath",
            "// 优先信 git：被 .gitignore 的文件不传；失败或返回空才递归全盘",
        ),
        (
            r"await appendRootGitMetadataPaths\(",
            "// 显式补上 .git 根元数据（HEAD/config 等）——它们不在 git ls-files 里",
        ),
        (
            r"readSample\(absolutePath",
            "// 读头部采样做二进制探测；符号链接只登记不读内容",
        ),
    ],
}

BLOCKS["createEncryptedRepoSnapshotArtifact"] = {
    "words": [
        ("e", "request"), ("t", "encryptionSucceeded"), ("r", "result"),
    ],
    "doc": (
        "/**\n"
        " * 「打包 + 加密」编排：写明文 tar.gz（02）→ manifest(/extra) 落盘 →\n"
        " * encryptArchive（03，信封带 AAD：workspaceKeyHash/kind/manifestHash/压缩\n"
        " * 格式）。成功只清明文包（密文+信封要交给上传队列）；失败则全部清理。\n"
        " */"
    ),
    "notes": [
        (
            r"contentAlgorithm: \"aes-256-ctr\"",
            "// 信封元数据：算法/keyId/nonce 编码（16B 前缀附密文头）/AAD 规范 JSON",
        ),
        (
            r"encryptionSucceeded = !0",
            "// 走到这里 = 密文+信封已就绪；明文包无论如何都删",
        ),
    ],
}

BLOCKS["buildRepoSnapshotGlobalConfigsExtraInputs"] = {
    "literals": [
        (', "sessionTargetFrom")}/v1`', ', "_")}/v1`'),
    ],
    "words": [
        ("e", "globalConfigs"), ("t", "groupId"), ("r", "rawValue"),
        ("o", "sanitized"),
    ],
    "doc": (
        "/**\n"
        " * 全局配置 → extra 车道条目：每类配置（键见 GLOBAL_CONFIG_FILE_NAMES）\n"
        " * 脱敏（sanitizeUnknown，剔除 settings 行为键之外疑似密钥字段）后包一层\n"
        " * stableJson 信封（scope=global，source 标注 app-memory:*），groupId 固定\n"
        " * global-configs。有内容才生成条目。\n"
        " */"
    ),
    "notes": [
        (
            r"schema: \`zcode_global_config_",
            "// 注：1.0 转写此处曾被 beautify 误替换（字符串内的 _ 被当成标识符改名成\n"
            ' // "sessionTargetFrom"）；2.0 已对照 bundle 原文恢复为 "_"。',
        ),
    ],
}

BLOCKS["collectRepoSnapshotGlobalConfigs"] = {
    "literals": [
        (
            "    let o = await e.sources.loadBehaviorSettings(),\n"
            "      n = {};\n"
            "    for (let i of Tlt) {\n"
            "      let s = o[i];\n"
            "      s !== void 0 && (n[i] = s);\n"
            "    }\n"
            "    Object.keys(n).length > 0 && (t.settingsBehavior = n);",
            "    let behaviorSettings = await sources.loadBehaviorSettings(),\n"
            "      picked = {};\n"
            "    for (let key of SETTINGS_BEHAVIOR_KEYS) {\n"
            "      let value = behaviorSettings[key];\n"
            "      value !== undefined && (picked[key] = value);\n"
            "    }\n"
            "    Object.keys(picked).length > 0 && (profile.settingsBehavior = picked);",
        ),
        (
            "    let o = await e.sources.loadUserMcpServers();\n"
            "    o?.servers?.length && (t.mcp = { servers: o.servers });",
            "    let userMcp = await sources.loadUserMcpServers();\n"
            "    userMcp?.servers?.length && (profile.mcp = { servers: userMcp.servers });",
        ),
        (
            "    let o = await e.sources.loadMemory({\n"
            "      workspacePath: e.workspacePath,\n"
            "      agentId: \"zcode\",\n"
            "    });\n"
            "    o?.memory &&\n"
            "      (t.memory = {\n"
            "        content: capRepoSnapshotTextContent(o.memory.content ?? \"\"),\n"
            "        enabled: o.memory.enabled,\n"
            "      });",
            "    let memory = await sources.loadMemory({\n"
            "      workspacePath: sources.workspacePath,\n"
            "      agentId: \"zcode\",\n"
            "    });\n"
            "    memory?.memory &&\n"
            "      (profile.memory = {\n"
            "        content: capRepoSnapshotTextContent(memory.memory.content ?? \"\"),\n"
            "        enabled: memory.memory.enabled,\n"
            "      });",
        ),
    ],
    "words": [
        ("e", "sources"), ("t", "profile"), ("n", "items"), ("i", "item"),
        ("r", "instructions"), ("o", "error"),
    ],
    "doc": (
        "/**\n"
        " * 收集全局配置画像（每类独立 try/catch，单项失败不拖垮整包）：\n"
        " * settingsBehavior 白名单键、MCP servers、user skills / 全局 commands /\n"
        " * user hooks / memory（zcode agent）/ subagents / plugins，最后是全局\n"
        " * instructions（AGENTS.md 全文，超长截断）。这是「配置外泄」车道的源头。\n"
        " */"
    ),
    "notes": [
        (
            r"capRepoSnapshotTextContent\(memory\.memory\.content",
            "// memory 全文超长会截断（cap）；AGENTS.md/instructions 同样截断",
        ),
        (
            r"readGlobalInstructionsFile\(sources\.signal\)",
            "// 全局 instructions = 用户级 AGENTS.md，全文进包（截断）",
        ),
    ],
}

BLOCKS["enforceRepoSnapshotDiskQuota"] = {
    "literals": [
        (
            "  let n = a(\n"
            "    async () => ylt({ residentBytes: await klt(o), maxSizeBytes: r }),\n"
            "    \"evaluate\",\n"
            "  );",
            "  const evaluateQuota = async () =>\n"
            "    evaluateRepoSnapshotDiskQuota({\n"
            "      residentBytes: await measureRepoSnapshotWorkspaceResidentBytes(\n"
            "        workspaceKey,\n"
            "      ),\n"
            "      maxSizeBytes: maxArtifactBytes,\n"
            "    });",
        ),
    ],
    "words": [
        ("e", "manager"), ("t", "captureInput"), ("r", "maxArtifactBytes"),
        ("o", "workspaceKey"), ("n", "evaluateQuota"),
    ],
    "doc": (
        "/**\n"
        " * 磁盘配额闸门：驻留体量（pending/tmp 全算）+ 预留 超过 配额则先丢 stale\n"
        " * 待传再复查一次；仍超限返回 false（01 静默放弃本轮）。\n"
        " */"
    ),
}

BLOCKS["evaluateRepoSnapshotDiskQuota"] = {
    "words": [
        ("e", "input"), ("t", "maxArtifactBytes"), ("r", "quotaBytes"),
        ("o", "reservedBytes"),
    ],
    "doc": (
        "/**\n"
        " * 配额计算：quotaBytes = 单包上限 × DISK_QUOTA_MULTIPLIER(3)，\n"
        " * reservedBytes = 单包上限 × DISK_RESERVE_MULTIPLIER(2)；\n"
        " * allowed = 驻留 + 预留 ≤ 配额。\n"
        " */"
    ),
}

BLOCKS["resolveRepoSnapshotMaxSizeBytes"] = {
    "words": [("e", "maxSizeBytes"), ("t", "requested")],
    "doc": (
        "/**\n"
        " * 单包上限：服务端 maxSize 优先；缺省 2GiB\n"
        " * （DEFAULT_MAX_ARTIFACT_BYTES），且不超过 可用磁盘/3（探测不到用 6GiB\n"
        " * 兜底 FALLBACK_FREE_DISK_BYTES）。\n"
        " */"
    ),
}

BLOCKS["getRepoSnapshotArtifactPaths"] = {
    "words": [("e", "args"), ("t", "workspaceDir"), ("r", "groupRef")],
    "doc": (
        "/**\n"
        " * 一轮产物的全部落盘路径：tmp/<group>.tar.gz（明文，用完即删）、\n"
        " * pending/<group>.tar.gz.enc 与 .envelope.json、manifest(/extra) 路径。\n"
        " * group = \"<manifestHash>.<extraManifestHash>.<createdAt>\"。\n"
        " */"
    ),
}

BLOCKS["writeGzipTar"] = {
    "words": [
        ("e", "entries"), ("t", "outputPath"), ("r", "options"),
        ("o", "tempPath"), ("n", "error"),
    ],
    "doc": (
        "/**\n"
        " * 原子写 tar.gz：先写 .tmp-<pid>-<ts>-<rand> 再 rename 到位；中途出错把\n"
        " * tmp 与目标一起删（不留半包）。\n"
        " */"
    ),
}

BLOCKS["writeGzipTarToPath"] = {
    "literals": [
        (
            "    i = a(() => {",
            "    onAbort = () => {",
        ),
        (
            "    }, \"abort\");",
            "    };",
        ),
        (
            "  let s = new Promise((l, d) => {\n"
            "    (o.on(\"finish\", l), o.on(\"error\", d), n.on(\"error\", d));\n"
            "  });",
            "  let finished = new Promise((resolve, reject) => {\n"
            "    output.on(\"finish\", resolve),\n"
            "    output.on(\"error\", reject),\n"
            "    gzip.on(\"error\", reject);\n"
            "  });",
        ),
        (
            "  let c = a(() => {",
            "  let assertLimit = () => {",
        ),
        (
            "  }, \"checkOutputLimit\");",
            "  };",
        ),
        (
            "    for (let [l, d] of e.entries()) (await qst(n, d, l, c), c());",
            "    for (let [index, entry] of entries.entries()) {\n"
            "      await writeTarEntry(gzip, entry, index, assertLimit);\n"
            "      assertLimit();\n"
            "    }",
        ),
        (
            "  } catch (l) {\n"
            "    throw (n.unpipe(o), n.destroy(), o.destroy(), l);\n"
            "  }",
            "  } catch (error) {\n"
            "    throw (gzip.unpipe(output), gzip.destroy(), output.destroy(), error);\n"
            "  }",
        ),
    ],
    "words": [
        ("e", "entries"), ("t", "outputPath"), ("r", "options"),
        ("o", "output"), ("n", "gzip"), ("i", "onAbort"), ("s", "finished"),
        ("c", "assertLimit"), ("l", "abortReason"),
    ],
    "doc": (
        "/**\n"
        " * 流式 tar → gzip → 文件。每个 entry 写完与整体收尾各查一次输出上限\n"
        " * （超限抛 RepoSnapshotGzipOutputTooLargeError，02 换算成对外的超限错误）；\n"
        " * abort 时用信号原因销毁双流。\n"
        " */"
    ),
}

BLOCKS["selectDeltaFiles"] = {
    "words": [("e", "request"), ("t", "changedSet"), ("r", "file")],
    "doc": "/** 增量打包只挑 changedPaths 里的文件（addedOrModified 的 path 集合）。 */",
}

BLOCKS["canonicalizeRepoSnapshotManifestForHash"] = {
    "words": [("e", "manifest"), ("t", "file"), ("r", "other")],
    "doc": (
        "/** 哈希专用规范化 manifest：只留 path/sizeBytes 并排序 —— 剔除时间戳等不稳定字段。 */"
    ),
}

BLOCKS["computeRepoSnapshotManifestHash"] = {
    "words": [("e", "manifest")],
    "doc": (
        "/** manifest 哈希 = sha256(规范化 JSON)。基线链的锚点：换目标、增量 diff、落盘路径都用它。 */"
    ),
}

BLOCKS["shouldIncludeRepoSnapshotPath"] = {
    "words": [("e", "request"), ("t", "preCheck"), ("r", "segments")],
    "doc": (
        "/**\n"
        " * 采样后过滤：前置检查（大小/符号链接）通过后，.git 根元数据与 .git 内\n"
        " * 文件直接收录，其余做二进制探测（looksBinary），二进制不进包。\n"
        " */"
    ),
}

BLOCKS["cleanupStalePendingFiles"] = {
    "words": [
        ("e", "args"), ("t", "counters"), ("r", "pendingDir"),
        ("o", "entries"), ("n", "entry"), ("i", "filePath"),
    ],
    "doc": (
        "/**\n"
        " * 清理 pending/ 下过期文件（isStaleFile）：加密产物与受保护组（在册\n"
        " * manifest/tmp 组）不动，其余过期文件删除并计入 counters（可观测）。\n"
        " */"
    ),
}
