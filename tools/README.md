# tools

可复现本仓库三件事：排版报告、从 ZCode `app.asar` 切出快照链路、生成两级可读转写。

| 脚本 | 做什么 |
| --- | --- |
| `build_report.py` | 把 docs 打成 `assets/zcode-snapshot-report.pdf` |
| `extract_snapshot.py` | 从 `.extract/host-index.js` 按 esbuild keepNames 切函数（输出 `src/readable-1.0` 原始块） |
| `beautify_snapshot.py` | 语义名回填 + 法律头 → `src/readable-1.0`；`--headers-only` 只盖头不重切 |
| `readable2.py` | 1.0 → `src/readable-2.0`：局部变量语义名、Node 别名还原、JSDoc/行内注释；校验型引擎（规则未命中/产物残留即报错退出） |
| `readable2_map.py` | 2.0 策划数据：命名对照与注释知识库（数据与引擎分离） |
| `probe_keepnames.py` | 从 bundle 批量找回 minified 标识符的原始名/常量值（维护 readable2_map 用） |
| `skeleton_check.py` | 1.0 vs 2.0 骨架等价校验：标识符归一后逐 token 对齐，防转写损坏 |
| `mq.json` | 图表/报告用的 mermaid 配置 |

## 转写（readable 1.0 / 2.0）

本机已安装 ZCode 时：

```
npx --yes @electron/asar extract-file <ZCode>/resources/app.asar out\host\index.js
# Windows asar 路径带反斜杠，文件会落到 cwd；挪到 .extract/host-index.js
python tools/extract_snapshot.py
python tools/beautify_snapshot.py
npx prettier --write "src/readable-1.0/*.js"
python tools/probe_keepnames.py      # （可选）核对 bundle 内原名
python tools/readable2.py
npx prettier --write "src/readable-2.0/*.js"
node --check src/readable-2.0/*.js && python tools/skeleton_check.py
```

`.extract/` 是完整 host bundle，**不要提交**（见仓库根 `.gitignore`）。

`src/readable-1.0/` 与 `src/readable-2.0/` 都是走读副本，**不是** ZCode 原文；1.0 已由 2.0 接替（见各自 README 入口）。引用、取证、对照请用 `../01-*.js` … `../08-*.js`（公开发行包 minified 摘录）。

## 署名

`extract_snapshot.py` / `beautify_snapshot.py` 由开源 **Grok Build** 会话写完。`readable2.py` / `readable2_map.py` / `skeleton_check.py` / `probe_keepnames.py` 由 **ZCode + GLM** 会话完成——拆包的锤子和修锤子的扳手出自同一只手。
