# 01 · 溯源链

从"目录占用了几百 MB"到"实锤整仓加密上云"，链条上每一环都有可复验的实物。三段式：

![溯源链](../assets/trace-chain.svg)

## ① 本地实物

| # | 证据 | 位置 | 指向 |
| --- | --- | --- | --- |
| E1 | 投料目录 | `~/.zcode/v2/checkpoints/<workspace-hash>/` | 每个打开过的工作区一个目录，含 `manifests/`、`pending/`、`state.json` |
| E2 | pending 密文 | `pending/*.tar.gz.enc` + 同名 `.envelope.json` | 信封加密产物（AES 载荷 + RSA 封装的密钥信封），等待重试上传 |
| E3 | 状态文件 | `state.json` 的 `lastAcceptedManifestHash` / `failureCount` | 见 ⑦ 代码级确认：接收哈希**仅在上传成功后**写入 |
| E4 | 明文清单 | `manifests/*.json` | 工作区全部文件清单，含 `.git/*` 历史对象——上传范围即此清单 |

## ② 客户端逆向

| # | 证据 | 位置（app.asar → out/host/index.js） | 指向 |
| --- | --- | --- | --- |
| E5 | 采集入口 | `RepoSnapshotSidecarService.captureBeforePrompt` | 每条 prompt 前自动触发采集 |
| E6 | 凭证接口 | `buildUploadCredentialUrl` → `POST /api/v1/snapshot/upload-credential` | 上传前先向自家后端买"邮票" |
| E7 | OSS 签名 | `uploadPostObject` 内嵌 `x-oss-signature-version` / `x-oss-credential` / `x-oss-signature` / `policy` | 阿里云 OSS PostObject V4 表单直传，实锤对象存储为阿里云 OSS |

## ③ 云端通道

| # | 证据 | 内容 | 指向 |
| --- | --- | --- | --- |
| E8 | 响应结构 | 凭证响应含 `data.oss` / `data.encryption` / `data.callback` 三段 | 服务端签发直传凭证 + 回调登记 |
| E9 | 加密方向 | `encryption.public_key` 由服务端下发，`keyWrapAlgorithm: rsa-oaep-sha256` | **私钥仅在云端**：密文本地不可解、厂商可解 |
| E10 | 遥测旁证 | `sdk.rum.aliyuncs.com`、`*.log.aliyuncs.com`（ARMS/SLS cn-beijing） | 基础设施整体构建在阿里云 |

## 逻辑闭环

```
E1-E4 证明"有什么"（工作区全量 + .git 在投料区）
E5-E7 证明"怎么走"（sidecar 采集 → 凭证 → OSS 直传）
E8-E9 证明"谁能看"（私钥云端托管，加密只是传输/静态保护，非端到端）
```

唯一无法从客户端证实的：OSS bucket 名称与对象命名规则（URL 运行时签发，不落盘）。但这不影响结论——接收哈希写入即代表 OSS 回调确认成功。
