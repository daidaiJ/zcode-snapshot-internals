# 03 · 数据驱动的修复蓝图（improvement plan）

> **输入**：[01-defects](01-defects.md)（D1–D16）+ [02-bench-flamegraphs](02-bench-flamegraphs.md)
> （30 场景实测，`bench/verify.py` 58 项断言全绿）。
> **定位**：这是"假如厂商要修好这条上传链"的工程排期建议，每项都给出**实测痛点 → 改法 →
> 预期收益 → 如何用 bench 重建件 A/B 验证**。用户侧改不了客户端，立即止损仍看
> [04-hardening](../04-hardening.md)。重建件声明同 02：`bench/` 非 ZCode 代码。

## 排期总览

| 优先级 | 项 | 修什么（缺陷） | 实测痛点 | 预期收益 | bench 验证场景 |
|--------|-----|----------------|----------|----------|----------------|
| **P0-1** | delta 判据加 mtime | 等长修改 100% 漏检（D1） | cycle：50/50 漏检，增量包 0.13MB，云端基线静默漂移 | 漏检 → 0；增量语义恢复 | `cycle` 断言 `deltaMissed==0` |
| **P0-2** | CTR → GCM（或 +HMAC） | 密文可篡改、AAD 无绑定、回调查验用明文哈希（D3） | 密码学审查结论（无性能争议） | 完整性叙事成立 | `pipeline` 吞吐不回退（断言 ±10%） |
| **P0-3** | 失败退避定时器 | 重试寄生在下一条 prompt（D4） | 悬崖失败后已传字节全作废，还要等用户说话 | 弱网下自动补传 | mock 慢端点场景断言重试时延 |
| **P0-4** | tar→gzip→aes 单流直写 | 明文落盘窗口 + 双写（D2） | IO 账单：写 = 产物 ×2（44.5MB/22MB），崩溃窗口明文滞留 | 磁盘写减半、明文窗口归零 | `io-e2e` 断言 pack 写 ≈ 1× 密文 |
| **P1-1** | 超时动态化 / 分片断点 | 60s 总超时不随体积（D10） | 悬崖 7 点实测：带宽 < size×8/60 即必败（1GiB@100Mbps 发出 70% 作废） | 100Mbps 传 1GiB 从必败 → 可传 | `cliff-*` 断言 1GiB@100 通过 |
| **P1-2** | 恢复 PUT 流式分流 | method 硬编码 POST（D7） | 实测 RSS 不放大（Node 22 惰性 Blob），但 PUT 分支不可达；分片/续传都需要它 | 大产物走流式/分片的通道前提 | `uput-*` 与 `upost-*` 对比场景 |
| **P1-3** | 哈希持久化 + 前置检查 | key_expired 先付全文件哈希（D8） | 256MB 白算 790ms（2GiB 外推 6.4s/次）；密文被读 3 遍 | 失败路径 O(1) 拒绝；成功路径少读 1 遍 | `reject-after-hash` 断言 hashMs→0 |
| **P1-4** | 扫描并发池（32） | 串行 lstat+采样（D13） | 0.55ms/文件，20k 文件 11.2s，1C/2C 持平 | 预期 5–10×（11.2s → 1–2s），prompt 阻塞直接砍 ~20% | `scan` 断言并发版 wall < 串行版 1/4 |
| **P1-5** | 小修 bundle | D6（max_size=0 反转 2GiB）、D5（failureCount 竞态）、D9（initialize 固化）、D11（吞错） | 各自缺陷章节 | 策略正确 + 可观测 | 单元级断言 |
| **P2-1** | manifest 单次序列化+流式 | 双 stringify + 常驻 ×2（D14、D16） | 100k 条目每 prompt ~305ms + 13.2MB/仓库 | 固定税 ↓ ~60%；凭证缓存命中省 1 次 GET/prompt | `manifest-scale` 复测 |
| **P2-2** | 压缩策略可调 | 打包+加密占 prompt 阻塞 81%（e2e 13.8s 中 11.2s） | 343MB 仓库 1C 50s，CPU≈墙钟 | zlib level ↓ 或 zstd：预期墙钟 30–50%↓（A/B 定） | `pipeline` 复测吞吐 |

## 实施要点与风险

**P0-1（delta）**：`nextManifest` 已采集 `modifiedTimeMs`（09:96-102），把它纳入
diff 与哈希规范化即可，不用全量内容哈希。风险：旧基线无此字段的兼容——manifest
schema 已有版本号，升级时视为"全量变化"即可。

**P0-2（GCM）**：AES-256-GCM 与 CTR 在现代 CPU 同量级（均有 AEAD/NI 加速），但
**注意 2GiB 上限产物的 tag/nonce 长度差异会改变密文偏移**——信封已有
`keyWrapAlgorithm` 字段，新增 `dataCipher: "aes-256-gcm"` 并按版本分流。回调
`checksum` 改用 `sha256:<密文哈希>`（P1-3 持久化后零成本取得）。

**P0-3（退避）**：`retained` 时安排 30s/2m/10m 定时器触发 flush；`failureCountedAt`
分支立即推进状态机而不是等 turn boundary（同时缓解 D5 竞态）。

**P0-4（单流直写）**：`tar → gzip → aes-256-ctr → 密文文件` 用 stream pipeline 一趟
写完，nonce 前缀与信封照旧。**收益双重**：消灭明文稳定路径（隐私窗口）+ 写 IO 减半
（44.5MB→22MB，低资源容器磁盘配额敏感）。注意保留逐条目限额语义（在 tar 装配层
计数）与 abort 传播。

**P1-1（超时/分片）**：两条路线——
1. 保守：`timeout = size / minBw + base`（如 minBw=10Mbps，1GiB → ~820s+60s），
   一行改动，治超时不治丢字节；
2. 正确：OSS multipart（InitializeMultipartUpload / UploadPart / Complete），
   每片独立重试，断点续传。P1-2 的 PUT/流式通道是前置。
悬崖实测给出的硬约束：**任何固定超时都只是把失败点搬家**，必须随 size 缩放或分片。

**P1-4（扫描并发）**：把 `for…await` 换成有界并发池（如 p-limit(32)）。串行瓶颈是
syscall 往返而非吞吐，并发后 1C 也有增益（IO 重叠），2C 更佳。注意 git ls-files
输出顺序与 manifest 排序稳定（canonical hash 依赖顺序）——并发收集后统一排序再入
manifest，哈希不变。

**P2-2（压缩）**：flame 图显示 zlib+GC 是主线程大头；gzip level 6→4 或切 zstd
（Node 22 已内建）预期 30–50% 墙钟收益，但压缩率变化会影响密文体积——服务端
`max_size` 是对密文的，A/B 时同时记录 `encryptedSizeBytes`。

## 验证方法（bench A/B 约定）

每项修复在重建件上同场景复跑，`bench/verify.py` 加对应断言（如 `deltaMissed==0`、
`cliff-1g@100mbps uploadOk==true`、`io pack 写 ≈1×`），基线数据已在
`bench/results/`。修完 P0 四项后 `e2e` 的预期形态：IO 搬运 16×→ ~11×、明文窗口
归零、delta 漏检归零；修完 P1 后：20k 文件 prompt 阻塞 13.8s → 预计 <8s（扫描
11.2s→1-2s 贡献最大），弱网大仓库从必败变为可传。

*2026-09-19 · 依据 commit 时点的 `bench/results/`（30 场景）与 `bench/verify.py`（58 断言）*
