# 04 · 加固方案

> 目标：阻断快照采集/上传，同时不影响 ZCode 其它功能。已实测验证。

## 原理

采集管线的落点固定为 `~/.zcode/v2/checkpoints/`（Windows: `%USERPROFILE%\.zcode\v2\checkpoints`）。让该目录**不可写**，`removeGeneratedArtifactFiles` / `mkdir` / `writeFile` 全部失败，客户端对这类 IO 错误静默吞掉——采集与上传随之停摆，主功能不受影响。

## 三平台一行版

| 平台 | 命令 |
| --- | --- |
| macOS | `chflags uchg ~/.zcode/v2/checkpoints` |
| Linux | `chattr +i ~/.zcode/v2/checkpoints` |
| Windows | 见下方 ACL 方案（无 chattr 等价物） |

## Windows 实测方案（icacls 写拒绝 ACL）

顺序关键：**先清空投料**（删 pending 密文，防被读走重传），**再上锁**（防新建）：

```powershell
$ck = 'C:\Users\panda\.zcode\v2\checkpoints'

# 1) 清空目录内容（pending 密文、manifests、state）
Get-ChildItem -LiteralPath $ck -Force | Remove-Item -Recurse -Force

# 2) 断继承 + 保留读 + 拒绝一切写
icacls $ck /inheritance:r
icacls $ck /grant "$env:USERNAME:(OI)(CI)(RX)"
icacls $ck /deny  "$env:USERNAME:(OI)(CI)(WD,AD,WEA,WA)"
#      WD=写数据  AD=追加  WEA=写扩展属性  WA=写属性

# 3) 验证
"test" | Out-File "$ck\probe.txt"    # 应报错 Access denied
icacls $ck                            # 应看到 (DENY)
```

已验证的行为：

- 锁生效后，运行中的 ZCode 持续触发 `captureBeforePrompt` 也无法再创建任何文件
- 客户端静默吞掉 IO 错误，无崩溃、无弹窗，其余功能正常
- 代价：checkpoint / 时间线回滚功能失效（该功能本就以全量上云为代价）

## 回滚（恢复上传）

```powershell
icacls C:\Users\panda\.zcode\v2\checkpoints /remove:d "$env:USERNAME"
```

## 进阶（可选，按侵入度递增）

1. **遥测拉黑**（需管理员改 hosts，与模型 API 无关，可安全阻断）：
   `sdk.rum.aliyuncs.com`、`*.log.aliyuncs.com`
2. **asar stub**（需完全退出 ZCode；升级后需重做）：
   备份 `resources/app.asar`，把 `captureBeforePromptUnsafe` 函数体等长替换为 `if(1)return;`
3. **网络层**：bucket 域名运行时签发（`*.oss-cn-*.aliyuncs.com`），无法用 hosts 精准阻断；如需网络级防御，用按应用/按域名规则的代理或防火墙拦截 OSS 直传域名，同时放行模型 API 域名

## 复检清单

- [ ] ZCode 升级后：ACL 是否仍在（`icacls $ck`）
- [ ] 升级后：上传逻辑是否变化（重新解包 app.asar 搜 `upload-credential`）
- [ ] 目录是否被重建/改名（`ls ~/.zcode/`，注意版本目录 v2 可能演进为 v3）
