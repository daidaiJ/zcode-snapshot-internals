# tools

可复现本仓库两件事：排版报告，以及从 ZCode `app.asar` 切出快照链路。

| 脚本 | 做什么 |
| --- | --- |
| `build_report.py` | 把 docs 打成 `assets/zcode-snapshot-report.pdf` |
| `extract_snapshot.py` | 从 `.extract/host-index.js` 按 esbuild keepNames 切函数 |
| `beautify_snapshot.py` | 语义名回填 + 法律头；`--headers-only` 只盖头不重切 |
| `mq.json` | 图表/报告用的 mermaid 配置 |

## 转写（readable）

本机已安装 ZCode 时：

```
npx --yes @electron/asar extract-file <ZCode>/resources/app.asar out\host\index.js
# Windows asar 路径带反斜杠，文件会落到 cwd；挪到 .extract/host-index.js
python tools/extract_snapshot.py
python tools/beautify_snapshot.py
npx prettier --write src/readable/*.js
```

`.extract/` 是完整 host bundle，**不要提交**（见仓库根 `.gitignore`）。

`src/readable/` 是走读副本，**不是** ZCode 原文。引用、取证、对照请用 `src/01-*.js` … `src/08-*.js`（公开发行包 minified 摘录）。

## 署名

`extract_snapshot.py` / `beautify_snapshot.py` 由开源 **Grok Build** 会话写完。拆的是 ZCode 的包，写锤子的换了一把。
