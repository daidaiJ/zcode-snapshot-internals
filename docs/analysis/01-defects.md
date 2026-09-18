# 01 · 缺陷侦探审查 — readable-2.0 缺陷与性能热点清单

> **范围**：[src/readable-2.0](../../src/readable-2.0/) 全部 9 个文件逐行通读（对照
> `src/0*.js` minified 原文抽查）。行号引用 readable-2.0（人类可读副本）；**取证引用
> 请用 minified 原文**，本仓库法律边界见 [README](../../README.md)。
> **方法**：人工代码审查（本篇）+ 低资源容器重建压测（证据标注"压测"处，数据与
> 火焰图见 [02-bench-flamegraphs](02-bench-flamegraphs.md)）。
> 重建件声明：压测代码在 `bench/`，是按 readable-2.0 语义对齐的 reconstruction，
> **不是 ZCode 代码**。

评级：**P0** = 功能错误/安全隐私/饥饿；**P1** = 健壮性/资源硬伤；**P2** = 性能/观测；
**P3** = 次要。

## 总表

| ID | 级别 | 类别 | 一句话 | 位置 |
|----|------|------|--------|------|
| D1 | P0 | 正确性 | 增量 diff 与 manifest 哈希只看 `sizeBytes`，等长内容修改全部漏传 | 02:44-50 · 09:608-628 |
| D2 | P0 | 隐私/安全 | 明文 tar.gz 先落稳定路径再加密，崩溃窗口内明文仓库快照滞留 `tmp/`，可见清理不覆盖 | 09:141-201 · 09:493-506 |
| D3 | P0 | 密码学 | AES-256-CTR 无 MAC/非 GCM，信封自称 AAD 但 CTR 不绑定；OSS 回调 checksum 用**明文**哈希 | 03:53 · 09:174-186 · 05:110 |
| D4 | P0 | 饥饿/时延 | 失败重试无退避定时器，完全寄生于下一条用户消息；用户不说话则 pending 挂到 24h 耗尽 | 06:54-107 · 07:277-321 |
| D5 | P1 | 并发 | 慢上传在途时 turn boundary 虚增 `failureCount`，3 次/24h 退避预算被提前耗尽 | 01:126-127 · 07:155-177 |
| D6 | P1 | 功能 | 服务端 `max_size=0`（意图禁传）被当作"未提供"回落 **2GiB 默认上限** | 08:116-121 · 09:448-459 |
| D7 | P1 | 资源 | 上传只有 POST 通道可达（`method` 硬编码），PUT 流式分支是死代码；实测 RSS 不放大，真实短板是单核 CPU + 60s 超时 | 05:64-68 · 05:126 · 04:160-172 |
| D8 | P1 | 浪费 | 换目标前**全量重算密文 sha256**，`key_expired` 也要先付全文件哈希；成功路径密文共哈希两遍 | 06:114-123 · 06:219-223 · 03:88-91 |
| D9 | P1 | 健壮性 | `initialize()` 自愈失败被 `.catch(()=>{})` 吞掉且 promise 固化，永不重试 | 07:50-59 |
| D10 | P2 | 功能 | 上传 60s 总超时不随体积缩放：100Mbps 链路传 1GiB 必超时 → 丢弃重来 | 04:148-157 |
| D11 | P2 | 观测 | `flushWorkspace`/链锁全链 `.catch(()=>{})`，上传失败零日志零遥测 | 06:60-61 · 07:141-142 |
| D12 | P2 | 一致性 | tar 主车道文件路径不过 `normalizeTarPath`（extra 车道却过），防穿越防御不对称 | 02:116-123 · 02:129 |
| D13 | P2 | 性能 | 扫描逐文件**串行 await** lstat+16KB 采样，20k 文件 = 20k 次同步往返，双核无增益 | 09:61-103 |
| D14 | P2 | 性能/内存 | manifest 三重驻留 + 双重 2 空格 JSON 序列化（tar 条目 + 落盘各一遍） | 09:96-131 · 02:73 · 09:158 |
| D15 | P2 | 边界 | `writeGzipTar` 错误路径连 `outputPath` 一起删；groupId 退化为纯 manifestHash 时同名误删概率升高 | 09:493-506 · 09:468-469 |
| D16 | P3 | 性能 | 凭证"缓存"无命中逻辑——每条 prompt 都新 GET 一次凭证；`sha256File` 读流不带 signal | 04:79-85 · 03:97-108 |

---

## P0

### D1 · 等长修改对增量与 manifest 哈希完全不可见

`buildRepoSnapshotDelta` 判"变化"的唯一信号是字节数：

```js
// 02-archive-writer.js:44-50
addedOrModified = input.nextManifest.files.filter((nextFile) => {
  let baseEntry = baseFiles.get(nextFile.path);
  return !baseEntry || baseEntry.sizeBytes !== nextFile.sizeBytes;   // ← 只比 size
})
```

而 manifest 哈希的规范化同样只保留 `path/sizeBytes`（09:608-616
`canonicalizeRepoSnapshotManifestForHash`）。扫描明明采集了
`modifiedTimeMs/changeTimeMs`（09:96-102），diff 与哈希**全部不用**。

**触发条件**：任何等字节长度的内容修改——配置项微调、等长字符串替换、版本号对齐
替换（`1.0.2`→`1.0.3`）等，在真实开发中高频出现。
**影响**：增量包不含这些文件；`manifestHash` 不变 → 服务端基线链与磁盘实况静默
漂移，云端快照系统性过期。**修复方向**：diff 纳入 mtime 或内容哈希；哈希规范化
纳入同源信号（保序：只影响增量判定字段，不必全量内容哈希）。
**压测复现**：`cycle` 场景等长改写 50 个文件，`delta.addedOrModified === 0`
（**50/50 全漏**），增量包仅 0.13MB（见 02 §增量）。

### D2 · 明文快照落盘窗口 + tmp/ 无可见清理

编排顺序是"先完整写出明文 tar.gz → 再流式加密 → finally 删明文"
（09:141-201 `createEncryptedRepoSnapshotArtifact`）。且 `writeGzipTar` 把临时文件
**rename 到稳定路径** `tmp/<group>.tar.gz`（09:493-506）——不是匿名临时文件。

**影响**：
1. 进程崩溃/断电在 rename 之后、`finally rm` 之前 → **整个仓库的明文快照**滞留
   磁盘，无密码学保护；
2. 可见清理只覆盖 `pending/` 信封（09:652-671 `cleanupStalePendingFiles`）与
   加密产物（`cleanupStaleRepoSnapshotEncryptedArtifacts`，名称即指向密文）——
   `tmp/` 下的明文没有任何可见回收路径；
3. 磁盘双写：明文 + 密文各一份，配额紧张的低资源容器上等于产物体积 ×2。

**修复方向**：`tar → gzip → aes-256-ctr → 密文文件` 单 pipeline 直写（少一遍盘
IO、消灭明文落盘窗口），nonce 前缀与信封照旧。

### D3 · CTR 无完整性绑定，回调校验值还是明文哈希

- 分组密码用 CTR 而非 GCM，无 MAC：密文可被按位预测地篡改（malleable）；
- 信封写明 `aadEncoding: "canonical-json-v1"`（09:174-186），但 **CTR 模式没有
  AAD 槽位**——这些元数据没有任何密码学绑定，纯属文档性字段；
- OSS 回调的 `checksum` 填的是 `plaintextSha256`（05:110-113）——OSS 无法验证、
  服务端解密前也无法验证；密文哈希 `encryptedSha256` 在 03:88-91 算完却不进
  信封/回调，仅存于本地内存。

**影响**：完整性叙事（信封"解密说明书"+回调查验）在密码学上不成立；篡改检测
完全依赖服务端解密后的应用层比对（本仓库未见证据）。
**修复方向**：AES-256-GCM（AAD 真绑定）或 CTR+HMAC-SHA256；回调 checksum 改用
`sha256:<密文哈希>`，任何一方落地即可校验。

### D4 · 失败重试寄生在用户消息上

`flushWorkspaceLoop` 循环里没有任何 sleep/退避；`failPendingUpload` 返回
`retained` 后循环结束（06:70-72、07:306-307）。九个文件里**没有一处 setTimeout**。
待传项获得重试的唯一途径：下一条用户消息触发 `captureBeforePrompt` →
`registerPendingUpload`（踢 `flushWorkspace`）。

**影响**：
1. 用户停止交互 → 队列里的快照静默滞留至 24h（`DEFAULT_MAX_RETENTION_MS`）被
   耗尽丢弃；
2. `attempt.failureCountedAt` 路径（06:96-107）更绕：必须等下一轮 capture 的
   turn boundary 才能推进状态机——失败恢复的最小延迟是"用户下一条消息"；
3. 弱网下表现为"发一条消息才传一点"的锯齿形上传。

**修复方向**：retained 时安排指数退避定时器（如 30s/2m/10m）自触发 flush；
`failureCountedAt` 分支改为立即可 discard/promote。

---

## P1

### D5 · failureCount 虚增竞态

`captureBeforePromptUnsafe` 每轮开头调 `recordFailureCountAtTurnBoundary`
（01:126-127）：activeUpload 存在、attemptCount>0 且未计数 → failureCount+1 并
打 `failureCountedAt`。但 01 调 `flushWorkspace` 时**不 await**（01:350-355）——
上传在途完全可能跨越 turn boundary。

**序列**：attempt#1 发出（attemptCount=1）→ 网络慢 → 用户发下一条消息 →
boundary 计数 failureCount=1 → 上传**成功**（markAccepted 清槽，failureCount
不复原）。三次这样的"成功前的慢"就把 3 次/24h 退避预算烧光，后续真实失败被
提前 exhausted 丢弃。
**修复方向**：计数条件加"上次尝试已结束"（如 `lastAttemptAt < now - grace`）或
成功时回滚计数。

### D6 · max_size=0 反转成 2GiB 默认

```js
// 08-credential-parsing.js:116-121 —— 0 通过（parsed >= 0）
if (!(typeof parsed != "number" || !Number.isFinite(parsed) || parsed < 0)) return parsed;
// 09-related.js:448-454 —— 0 被当"无效"回落默认
maxSizeBytes > 0 ? maxSizeBytes : DEFAULT_MAX_ARTIFACT_BYTES   // 2GiB
```

**影响**：服务端以下发 `max_size: 0` 表达"禁止上传/配额用尽"时，客户端把它读成
"没说"，按 **2GiB** 继续采集打包——策略反转。
**修复方向**：`maxSizeBytes >= 0` 都视为有效；0 = 本轮放弃。

### D7 · 唯一可达的上传通道是整文件 Blob 的 POST

`buildObjectUploadTarget` 永远返回 `method: "POST"`（05:126），POST 用
`openAsBlob` 把整个密文文件做成 Blob 再塞进 FormData（05:60-68）；
`uploadObject` 里的 PUT 分支（流式 `createReadStream`，04:160-172 → 05:37-53）
**不可达**——流式上传是死代码，服务端给 PUT 预签名也走不到。
**实测修正**（02 §上传通道）：Node 22 的 `openAsBlob` 是文件惰性背书，整文件
Blob **并不放大 RSS**（256MB→1.5GB 产物 RSS 恒 ~110MB，慢 socket 下也不积水）；
真实短板是 POST 全程单核 CPU 饱和（1.5GB 7.6s）与 60s 总超时（弱网大产物必败，
PUT 流式同败——它救内存，救不了墙钟）。
**修复方向**：按凭证方法真正分流；大产物走流式 PUT 或分片+断点续传。

### D8 · 换目标顺序反了：先付全文件哈希再被 key_expired 拒绝

`flushActiveUpload` 的顺序是 `buildUploadTargetRequest`（读信封 + stat +
**sha256File(密文全文件)**，06:219-223）→ `requestUploadTarget`（04:119-143，
只做 handle 查表 + 两个字符串比对）。凭证过期/归属不匹配本可在 **O(1)** 内拒绝，
却先付了一趟全文件读+哈希。叠加 03:88-91 加密时已算过一次密文哈希（未持久化），
**成功路径密文共哈希两遍，失败重试每轮再多一遍**。实测：256MB 密文 key_expired
前白付 **790ms**（外推 2GiB 上限 ≈ 6.4s/次）；IO 账单里密文被读 3 遍（哈希×2 +
上传×1），见 02 §IO。
**修复方向**：先查 handle 有效性；密文 sha256 加密时算完写进信封复用。

### D9 · initialize() 静默失败且固化

```js
// 07-pending-manager.js:51-58
this.initializePromise ??= this.repairPersistedStates()
  .then(() => cleanupStaleRepoSnapshotEncryptedArtifacts())
  .then(() => {})
  .catch(() => {});      // ← 吞掉且永不重试
```

自愈/清理一次失败 → promise 已固化，进程生命周期内不再尝试；损坏 state.json
的后果散落到各操作的独立报错里，且没有日志。
**修复方向**：失败记录日志并允许下次 `initialize()` 重试（失败时清空 memo）。

---

## P2 / P3

### D10 · 60s 总超时不随体积缩放
`AbortSignal.timeout(60s)` 罩住整个上传（04:148-157）。512MiB 产物要求持续
≥71Mbps；1GiB@100Mbps 需 86s → 必超时 → 走 `failPendingUpload`（有 latest 时
直接丢弃当前轮 promote 下一条）。超时要么按 `size/最小带宽` 动态，要么分片。
压测复现（02 §超时悬崖）：体积×带宽 7 个实测点全部落在理论悬崖线
`mbps* = size×8/60` 的预测侧（256MB@25、512MB@50、1GiB@100 全 60.0s abort，
各发出 70–76% 即作废重来；PUT 流式同败）。

### D11 · 静默吞错贯穿上传链
`flushWorkspace` 链上两个 `.catch(() => {})`（06:60-61）、07 链锁同款——上传
失败/状态机异常零输出。整个 6 文件里唯一的日志调用是 08 的 max_size 告警。线上
排障只能靠 `state.json` 尸检。

### D12 · 防穿越检查不对称
主车道 `${snapshotId}/files/${file.path}` 直拼（02:116-123），extra 车道
`normalizeTarPath` 两处调用（02:129）+ 独立实现重复两份（02:179-187、
03:124-138）。主车道完全信任 `toRepoRelativePath` 的输出；同名恶意文件名
（含 `..` 段）在 walk 兜底车道下无第二道防线。

### D13 · 扫描串行
`for (path of candidates) { await lstat; await readSample; }`（09:61-103）——
单文件粒度的串行 IO 往返；多核容器无增益（压测 1C vs 2C 对照）。有界并发池
（如 32）是数量级修复。热点定位见 02 火焰图。
实测（02 §扫描）：20k 文件 11.2s，1C2G/2C4G/1C4G 三档持平（0.55ms/文件），
每条 prompt 重付一遍。

### D14 · manifest 重复驻留与序列化
files 数组在扫描结果与 manifest 里各一份对象图（09:96-131）；写 tar 的 meta
条目 `JSON.stringify(manifest, null, 2)`（02:73）之后 `atomicWriteJson` 又
stringify 一遍（09:158）；`readWorkspaceSizeBytes`（06:243-252）在超限路径还要
`JSON.parse` 整个 manifest 只为取一个数字。规模量化见 02 `manifest-scale`：
100k 条目 = 每条 prompt **~305ms** 固定开销 + 13.2MB 常驻堆/仓库。

### D15 · writeGzipTar 错误路径误删稳定目标
catch 分支 `rm(outputPath)`（09:499-505）： outputPath 是稳定产物路径，若同
`groupRef` 已存在旧产物（`getRepoSnapshotArtifactPaths` 在无 groupId 时退化为
纯 `manifestHash`，09:468-469），写入失败会连带删除旧密文/信封。概率低（groupId
含 ms 时间戳），但退化路径下同 manifest 重试即同名。

### D16 · 凭证缓存名不副实 & 信号缺失
`getUploadKey` 每次都发凭证 GET（04:79-85，缓存只作为"句柄仓库"供后续
`requestUploadTarget` 用，没有按 workspace 命中）——每条用户消息一次凭证请求；
`sha256File` 的读取流不带 `signal`（03:97-108），abort 后明文哈希读不停。

---

## 与官方回应的对照

[05-official-response](../05-official-response.md) 中"数据立即销毁/仅元数据"类
说法与本清单的直接冲突点：D1（基线链长期留存且可能过期）、D2（明文滞留本机）。
加密相关回应与 D3 的完整性缺口对照阅读。

*生成：2026-09-18 · 审查基线 commit `6ba7860` · 配套压测数据见 [02-bench-flamegraphs](02-bench-flamegraphs.md)*
