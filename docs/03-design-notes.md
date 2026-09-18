# 03 · 设计实现解析

抛开隐私争议，这条流水线的工程质量值得单独一读。十处设计与性能优化点：

![设计优化点](../assets/design-optimizations.svg)

## 采集侧

### 1. 增量快照（delta）

`buildRepoSnapshotDelta` 对比前后 manifest，仅上传 `addedOrModified` + `deleted`；首次为 baseline，后续 increment 携带 `baseManifestHash` 供服务端拼合。

**点评**：这是整条链路最核心的成本优化——日常使用中工作区绝大多数文件不变，增量让重复上传代价趋近于零。代价是服务端要维护快照树（`snapshot_id` / `base_snapshot_id` 链）。

### 2. 大小预算前置 + 记账

`lastCompressedSize` 持久化上次实测压缩尺寸；`maxEncryptedArtifactBytes`（服务端 `max_size` 下发）在归档压缩阶段就硬中断（yazl `maxOutputBytes`），实测值记入 state 供下次快速决策。

**点评**：避免"压完才发现超限"的浪费——压缩是最贵的一步，早停 + 记账让二次触发近乎零成本判断。这是流式管线里做预算控制的标准范式。

## 加密打包侧

### 3. 信封加密

数据 AES-256-CTR，32B 数据密钥 RSA-OAEP-SHA256 封装进 envelope。非对称开销与数据体积解耦，恒定一次 RSA。

**点评**：正确且高效。槽点在于密钥方向：公钥来自服务端、私钥不出云——加密保护的是**厂商的存储合规**（静态密文），不是用户的隐私边界。

### 4. 全流式管线

`readStream → gzip → cipher → writeStream`（`stream/promises.pipeline` 背压），哈希边流边算；上传用 `openAsBlob` + `duplex:"half"` 流式 POST。

**点评**：数百 MB 的仓库全程不整包驻留内存，内存占用 O(1)。这让"每个 prompt 都可能触发一次采集"在桌面端可行。

## 传输容错侧

### 5. 进程与并发模型

采集/上传在独立 sidecar（宿主进程外的 host）+ uploadWorker 中执行；`captureScheduler` 限流（`maxPendingCaptureIntents`、`AbortSignal` 级联取消）；`flushesByWorkspaceKey` 每工作区 promise 链串行化。

**点评**：UI 永不阻塞是桌面端底线；AbortSignal 全链路贯穿（采集、压缩、上传都可取消），窗口关闭/任务中止时不会留下半截状态。

### 6. 凭证缓存与修剪

`uploadCredentialsByHandle: Map<handle, {credential, tokenHash, expiresAt}>`，TTL 1h，`pruneExpiredUploadCredentials` 顺带清理；凭证与登录 token 哈希绑定防挪用。

**点评**：典型的"凭证服务 + 短时直传凭证"架构（类 STS），把对象存储细节完全收拢到服务端，bucket 可随时迁移而不破坏老客户端。

### 7. 内容寻址

manifest / delta / envelope / 密文全部 sha256 寻址（`manifestHash`、`contentHash`、`plaintextSha256`、`encryptedSha256`）。

**点评**：一次哈希同时服务四个目的：变更检测（diff）、去重（幂等重试）、完整性校验（envelope 内置）、审计（state.json 里的接收哈希）。哈希即协议。

### 8. 持久化待传队列

pending/ 目录落盘 `{artifact, envelope, manifest, uploadCredentialHandle}`，`state.json` 记 `failureCount` / `lastAcceptedManifestHash`；失败退避重试、`latestPendingUpload` 晋升替补。

**点评**：崩溃/断网安全，重启续传。实测有失败 564 次仍在队列里等的情况——退避做得非常顽固。从取证视角这反而是礼物：投料区把整条链路的证据都留在了磁盘上。

### 9. 侧车道变更策略

全局配置（MCP/instructions/skills/hooks）走 `extra-manifests`，分组标 `changePolicy:"rare"`，`contentHash` 不变即跳过。

**点评**：把"低频变更的大对象"与"高频变更的代码"分流，配置类内容几乎零重复上传。注意这也意味着 **MCP 配置里的服务地址与密钥、AGENTS.md 全文** 都在其上传范围内。

### 10. 语义化日志指纹

`describeUploadCredentialShape` 把凭证响应折叠成 `code/msg/ossKeys/encryptionKeys/callbackKeys` 指纹再打日志。

**点评**：既保留了排障信息又避免把签名、公钥等整段打进日志——这个细节值得所有做客户端的人抄。对取证者也是福音：它把响应结构直接写在了代码里。

---

## 槽点（工程之外）

1. **开关与行为不一致**：设置项 `optimizeAgentExperienceEnabled`（训练用途）与 `repoSnapshotIndexingEnabled`（云端索引）都不构成上传的开关；代码里根本不存在"不上传"的分支。用户以为的同意粒度与实际数据流严重错位。
2. **范围超配**：增量索引/远程续跑只需工作树与元数据，但链路默认带走完整 `.git`（含 reflog、LFS 缓存）与 prompt 原文——超出任何声称用途的必要范围。
3. **隐私政策错位**：政策只写"对话中提交"的内容，而该机制采集的是整个工作区及其全部历史。
