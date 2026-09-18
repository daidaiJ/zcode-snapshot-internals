# bench — 低资源容器压测（重建件）

对 [src/readable-2.0](../src/readable-2.0/) 所述快照上传热路径的**性能重建压测**。
> ⚠️ `lib/` 是按 readable-2.0 逐函数对齐的**可执行重建件（reconstruction）**，不是
> ZCode 代码，不可作为取证引用。上传端点是**回环 mock**（数据即收即弃，绝不外发）；
> "服务端 RSA 公钥"为本地生成；无任何真实网络调用。

## 组成

| 文件 | 对应原文阶段 | 保真点 |
|---|---|---|
| `lib/pipeline.js` | 01/02/03/09 | 串行 lstat+16KB 采样扫描；git ls-files 优先；size-only 增量；tar.gz（tmp+rename、逐条目限额）；AES-256-CTR + RSA-OAEP 信封；明文先落盘再删 |
| `lib/state.js` | 07 | 每工作区 Promise 链锁、active/latest 双槽、promoted/retained/discarded |
| `lib/worker.js` | 04/05/06 | 凭证句柄 1h TTL、换目标前**全量重算密文 sha256**、60s 总超时、POST=openAsBlob / PUT=流式 |
| `lib/ossmock.js` | OSS 端点 | 回环 sink，可限速 |
| `lib/metrics.js` | — | 阶段 wall/CPU（全线程）+ RSS/VmHWM/cgroup `memory.peak` 采样 + 每阶段 IO 增量（`/proc/self/io` rchar/wchar/read_bytes/write_bytes + cgroup `io.stat`） |
| `gen-fixtures.js` | — | 确定性合成仓库（2% 二进制）；`--mutate` 等长改写演示增量漏报 |
| `run.js` | — | 场景 runner：scan / pipeline-baseline / cycle / e2e / upload-probe / reject-after-hash / manifest-scale |
| `flame.js` | — | `.cpuprofile` → CPU 火焰图 SVG + 热点表 |
| `heapflame.js` | — | `.heapprofile` → 分配火焰图 SVG + 热点表（注：Buffer 走堆外，heap-prof 对本链基本采不到东西） |
| `charts.py` | — | `results/*.json` → 分析图表 SVG（matplotlib，中文 YaHei，GitHub 内联渲染）→ `../assets/charts/` |
| `verify.py` | — | 结果完整性校验：对关键结论做 58 项断言（悬崖理论线、delta 漏检、RSS 不放大、IO 倍数等），全绿退出码 0 |
| `matrix.sh` | — | docker 1C2G / 1C4G / 2C4G 真配额主矩阵（20 场景） |
| `matrix2.sh` | — | 补充矩阵（10 场景）：IO 账单复跑、heap-prof、体积×带宽超时悬崖、PUT 限速对照 |

## 跑法（WSL 内 docker）

```bash
sudo bash matrix.sh --smoke   # 烟雾
sudo bash matrix.sh           # 主矩阵 → results/*.json
sudo bash matrix2.sh          # 补充矩阵（IO/heap/悬崖）
node flame.js prof/x.cpuprofile --outdir ../assets/flame --basename x --title "..."
node heapflame.js prof/x.heapprofile --outdir ../assets/flame --basename x --title "..."
python charts.py              # 重出全部分析图表（缺数据的图自动跳过）
python verify.py              # 校验结果完整性（58 断言）
```

结果分析见 `docs/analysis/02-bench-flamegraphs.md`。
