# zcode-snapshot-internals

> ZCode（智谱 Z.ai 官方 AI 编程桌面端）仓库快照上传链路逆向：核心代码摘录、流程拆解与设计实现解析。
>
> ⚠️ 逆向研究表明：登录态下的 ZCode 会把工作区（含完整 `.git` 历史）打包加密后直传阿里云 OSS，加密私钥仅存云端。UI 上的「优化计划」「仓库快照索引」开关均不阻断该行为。

## 仓库结构

```
├── README.md                      ← 本文
├── docs/
│   ├── 01-trace-chain.md          ← 溯源链：磁盘实物 → 代码逆向 → 云端通道
│   ├── 02-code-flow.md            ← 代码流程拆解：六个阶段逐步走读（配 src/）
│   ├── 03-design-notes.md         ← 设计实现解析：10 个性能优化点点评 + 槽点
│   └── 04-hardening.md            ← 加固方案：三平台阻断方法与回滚
├── src/                           ← 还原代码摘录（原文逐字 + 批注头，见下表）
│   ├── 01-sidecar-service.js      ← 采集入口 RepoSnapshotSidecarService
│   ├── 02-archive-writer.js       ← 归档打包 + 增量 delta
│   ├── 03-encrypt-archive.js      ← 信封加密 AES-256-CTR + RSA-OAEP
│   ├── 04-upload-client.js        ← 上传客户端（凭证/目标/直传）
│   ├── 05-oss-post-object.js      ← OSS PUT 预签名 / POST 表单直传
│   ├── 06-upload-worker.js        ← 上传状态机（失败退避/晋升/丢弃）
│   ├── 07-pending-manager.js      ← 待传队列（接收哈希仅成功后落盘）
│   └── 08-credential-parsing.js   ← 凭证响应解析（data.oss / callback）
├── assets/
│   ├── trace-chain.svg            ← 溯源链图
│   ├── upload-flow.svg            ← 上传时序图
│   ├── packaging.svg              ← 快照内容双车道图
│   ├── design-optimizations.svg   ← 设计优化点图
│   └── zcode-snapshot-report.pdf  ← 完整取证报告（同 docs，排版版）
```

## 一分钟版本

每次用户发送消息前，sidecar 服务自动执行 `captureBeforePrompt`：

1. 向 `POST /api/v1/snapshot/upload-credential` 申请上传凭证，服务端返回 OSS 表单签名 + **RSA 公钥**
2. 工作区全量文件（含 `.git`）+ prompt 元数据 → tar.gz → AES-256-CTR 加密（密钥用服务端公钥封装）
3. 不经业务服务器，POST 表单**直传阿里云 OSS**，OSS 回调登记

意味着：对方持有解密私钥；`.git` 历史里的一切（含已删除文件、历史提交中的凭据）都在其可解密范围内。详见 [docs/01-trace-chain.md](docs/01-trace-chain.md)。

## 关键标识符对照（minified → 语义名）

| 混淆名 | 语义名 | 职责 |
| --- | --- | --- |
| `Bk` | RepoSnapshotSidecarService | 采集调度入口 |
| `ict` | writeRepoSnapshotPlainArchive | tar 归档写入 |
| `__e` | buildRepoSnapshotDelta | 增量 diff |
| `oct` | encryptArchive | 信封加密 |
| `Wk` | RepoSnapshotUploadClient | 凭证协商与直传 |
| `odt` / `idt` | uploadPutObject / uploadPostObject | OSS PUT/POST |
| `Hk` | RepoSnapshotUploadWorker | 上传状态机 |
| `hIe` | describeUploadCredentialShape | 凭证响应结构校验 |

## 免责声明

- 本仓库所有代码摘录自 ZCode Desktop 3.12.2 公开发行包，**原文逐字未美化**，仅截取理解链路所需最小片段
- 目的是安全研究、用户知情权与防御加固（如何阻断），不提供任何滥用性内容
- 原始代码版权归 Z.ai（智谱）所有；如有侵权请联系处理
- 分析仅针对静态客户端代码与本地 artifacts，未对服务端做任何探测

## 参考

- ferstar，《扒一扒 ZCode 静默上传全量 Git 历史的骚操作》（2026-09-18）
- NodeLoc，《ZCode 会静默上传整仓快照：Windows 实测证实 + 三重防御落地》
- Reddit r/ZaiGLM：Zcode uploads full git repository without disclosure
- OSCHINA / 钜亨网 相关报道

## 花絮

本报告的全部流程图，正是用 ZCode 驱动 GLM-5.3-Flash 调用 [mmdx](https://github.com/daidaiJ/mmdx)（mermaid → SVG/PNG 的渲染 CLI）生成的——而 mmdx 本身也是此前用 ZCode + GLM 开发的，驱动它的 skill 同样出自这套工作流（[my-skills/dev-tools/mermaid/SKILL.md](https://github.com/daidaiJ/my-skills/blob/master/dev-tools/mermaid/SKILL.md)）。

用被告的锤子钉被告的罪证，再把罪证排版成 PDF 放进仓库。工具没有立场，用工具的人心里得有数。
