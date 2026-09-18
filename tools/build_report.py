#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble the generic ZCode snapshot forensics report (HTML).
Reads diagrams from ../assets, writes HTML to D:\\Download\\, then print to PDF via headless Chromium.
"""
import pathlib

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
OUT_HTML = pathlib.Path(r"D:\Download\ZCode快照上传取证报告.html")
REPO = "https://github.com/daidaiJ/zcode-snapshot-internals"
SVG = {"m1": "trace-chain.svg", "m2": "upload-flow.svg", "m3": "packaging.svg", "m4": "design-optimizations.svg"}

def svg(key):
    import re
    s = (ASSETS / SVG[key]).read_text(encoding="utf-8")
    s = s[s.find("<svg"):]
    m = re.search(r"<svg[^>]*>", s)
    tag = m.group(0)
    if "viewBox" not in tag:
        w = re.search(r'width="([\d.]+)"', tag)
        h = re.search(r'height="([\d.]+)"', tag)
        if w and h:
            new_tag = tag[:-1] + f' viewBox="0 0 {w.group(1)} {h.group(1)}">'
            s = s.replace(tag, new_tag, 1)
    return s

html = rf"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZCode 仓库快照上传链路 · 溯源与代码拆解</title>
<style>
  :root {{ --ink:#1a2233; --muted:#5a6579; --line:#e3e8f0; --brand:#2563eb; --bg:#f7f9fc; --red:#c0392b; --ok:#1e8e3e; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif; color:var(--ink); background:var(--bg); line-height:1.75; }}
  .wrap {{ max-width:980px; margin:0 auto; padding:48px 28px 80px; }}
  header.hero {{ background:linear-gradient(135deg,#0f1b33,#1e3a8a); color:#fff; border-radius:16px; padding:40px 36px; margin-bottom:36px; }}
  header.hero h1 {{ margin:0 0 10px; font-size:26px; }}
  header.hero p {{ margin:4px 0; opacity:.85; font-size:14px; }}
  .meta {{ display:flex; gap:18px; flex-wrap:wrap; margin-top:16px; font-size:13px; opacity:.9; }}
  .verdict {{ display:inline-block; background:#fde8e8; color:var(--red); font-weight:700; border-radius:8px; padding:4px 12px; margin-top:14px; }}
  h2 {{ font-size:20px; margin:44px 0 14px; padding-left:12px; border-left:4px solid var(--brand); }}
  section.card {{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:26px 30px; margin:18px 0; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; margin:12px 0; }}
  th,td {{ border-bottom:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:top; }}
  th {{ background:#f0f4fa; font-weight:600; white-space:nowrap; }}
  .mono {{ font-family:Consolas,monospace; font-size:12px; }}
  .figure {{ margin:18px 0; text-align:center; }}
  .figure img {{ max-width:100%; height:auto; border:1px solid var(--line); border-radius:10px; background:#fff; }}
  .figure svg {{ max-width:100% !important; height:auto !important; overflow:hidden !important; border:1px solid var(--line); border-radius:10px; background:#fff; }}
  code {{ background:#eef2f7; border-radius:5px; padding:1px 6px; font-family:Consolas,monospace; font-size:12.5px; }}
  pre {{ background:#0f172a; color:#d7e3ff; border-radius:10px; padding:16px 18px; overflow-x:auto; font-size:12.5px; line-height:1.6; }}
  pre code {{ background:none; color:inherit; padding:0; }}
  blockquote {{ margin:14px 0; padding:10px 16px; border-left:4px solid var(--line); background:#f8fafc; border-radius:8px; font-size:13.5px; }}
  .note {{ background:#fff8e6; border:1px solid #f2dfa0; border-radius:10px; padding:12px 16px; font-size:13.5px; }}
  .tag {{ display:inline-block; border-radius:6px; padding:1px 8px; font-size:12px; font-weight:600; }}
  .tag-red {{ background:#fde8e8; color:var(--red); }}
  .tag-yellow {{ background:#fff3cd; color:#8a6d00; }}
  .tag-green {{ background:#e3f4e6; color:var(--ok); }}
  .foot {{ color:var(--muted); font-size:12px; margin-top:40px; text-align:center; }}
  a {{ color:var(--brand); text-decoration:none; }}
  @media print {{ body{{background:#fff}} section.card{{border:none;padding:8px 0}} header.hero{{border-radius:0}} }}
  @media print {{ .figure{{break-inside:avoid; page-break-inside:avoid}} table{{break-inside:avoid; page-break-inside:avoid}} blockquote{{break-inside:avoid}} pre{{break-inside:avoid}} .note{{break-inside:avoid}} tr{{break-inside:avoid}} h2{{break-after:avoid; page-break-after:avoid}} }}
</style>
</head>
<body>
<div class="wrap">

<header class="hero">
  <h1>ZCode 仓库快照上传链路 · 溯源与代码拆解</h1>
  <p>研究样本：ZCode Desktop 3.12.2（Windows 公开发行包，build 4e1c9d87）· 方法：本地 artifacts 解析 + app.asar 静态逆向</p>
  <p>完整代码摘录与逐段解析：<a href="{REPO}" style="color:#9ec3ff">{REPO}</a></p>
  <div class="meta"><span>2026-09-18</span><span>交叉验证：ferstar 博客 / NodeLoc / Reddit r/ZaiGLM / OSCHINA / 钜亨网</span></div>
  <div class="verdict">结论：登录态下，ZCode 将工作区（含完整 .git 历史）打包加密直传阿里云 OSS，私钥仅存云端，UI 开关不可阻断</div>
</header>

<section class="card">
<h2 style="margin-top:0">〇、花絮：这份报告是怎么做出来的</h2>
<div class="note" style="border-color:#a7c4f5;background:#eef4ff">
颇具讽刺意味的是：<b>本报告的全部流程图，正是用 ZCode 驱动 GLM-5.3-Flash 调用
<a href="https://github.com/daidaiJ/mmdx">mmdx</a>（mermaid → SVG/PNG 的渲染 CLI）生成的</b>——
而 mmdx 本身也是此前用 ZCode + GLM 开发的，驱动它的 skill 同样出自这套工作流
（<a href="https://github.com/daidaiJ/my-skills/blob/master/dev-tools/mermaid/SKILL.md">my-skills/dev-tools/mermaid/SKILL.md</a>）。<br>
用被告的锤子钉被告的罪证，再把罪证排版成 PDF 放进仓库。工具没有立场，用工具的人心里得有数。
</div>
</section>

<section class="card">
<h2>一、溯源链</h2>
<p>三段闭环：本地实物证明"有什么"，客户端逆向证明"怎么走"，凭证结构证明"谁能看"。每一环都有可复验的磁盘/代码实物。</p>
<div class="figure">{svg('m1')}
<figcaption>图 1 · 溯源链：本地实物 → 客户端逆向 → 云端通道</figcaption></div>
<table>
<tr><th>#</th><th>证据</th><th>位置 / 内容</th><th>指向结论</th></tr>
<tr><td>E1</td><td>投料目录</td><td class="mono">~/.zcode/v2/checkpoints/&lt;workspace-hash&gt;/</td><td>每个打开过的工作区一个目录：manifests/ + pending/ + state.json</td></tr>
<tr><td>E2</td><td>pending 密文</td><td class="mono">pending/*.tar.gz.enc + *.envelope.json</td><td>信封加密产物，等待重试上传（失败退避极顽固，社区实测有重试 564 次）</td></tr>
<tr><td>E3</td><td>明文清单</td><td class="mono">manifests/*.json</td><td>工作区全部文件清单，含 .git/* 历史对象——上传范围即此清单</td></tr>
<tr><td>E4</td><td>状态文件</td><td class="mono">state.json → lastAcceptedManifestHash</td><td>代码级确认：该哈希仅在上传成功后写入（07-pending-manager）</td></tr>
<tr><td>E5</td><td>采集入口</td><td class="mono">RepoSnapshotSidecarService.captureBeforePrompt</td><td>每条用户消息发出前自动触发，任务结束亦触发</td></tr>
<tr><td>E6</td><td>凭证接口</td><td class="mono">GET /api/v1/snapshot/upload-credential</td><td>响应含 data.oss / data.encryption / data.callback 三段</td></tr>
<tr><td>E7</td><td>OSS 表单签名</td><td class="mono">policy · x-oss-signature · x-oss-credential · x-oss-date</td><td>阿里云 OSS PostObject V4 直传，客户端代码内嵌</td></tr>
<tr><td>E8</td><td>加密方向</td><td class="mono">encryption.public_key（服务端下发）+ rsa-oaep-sha256</td><td>私钥仅存云端：加密是传输/静态保护，非端到端</td></tr>
</table>
</section>

<section class="card">
<h2>二、上传全链路</h2>
<div class="figure">{svg('m2')}
<figcaption>图 2 · 时序：prompt 前自动采集，POST 直传 OSS，不经智谱业务服务器</figcaption></div>
<table>
<tr><th>阶段</th><th>机制</th><th>细节</th></tr>
<tr><td>触发</td><td>captureBeforePrompt</td><td>sidecar 服务在宿主启动时无条件构造；消息事件驱动采集，AbortSignal 全链路可取消</td></tr>
<tr><td>凭证协商</td><td>GET upload-credential</td><td>服务端按 workspace_id 签发：动态 Object Key、max_size、RSA 公钥（带 key_version）、OSS 表单签名、回调配置</td></tr>
<tr><td>打包</td><td>tar.gz 流式归档</td><td>meta/prompt.json（提问原文）+ meta/manifest.json + meta/delta.json + files/*；侧车道 extra-files 装全局配置</td></tr>
<tr><td>加密</td><td>信封加密</td><td>随机 32B 数据密钥走 AES-256-CTR；密钥经 RSA-OAEP-SHA256 用服务端公钥封装进 envelope</td></tr>
<tr><td>直传</td><td>POST multipart</td><td>formFields 携带 OSS 签名直传 bucket；PUT 预签名 URL 为备用通道；文件名定死 repo-snapshot.tar.gz.enc</td></tr>
<tr><td>登记</td><td>OSS callback</td><td>OSS 回调智谱后端登记 snapshot_id；客户端写 lastAcceptedManifestHash（上传成功铁证）</td></tr>
</table>
<div class="note">增量机制：服务端已有 base 快照时仅上传 manifest diff（addedOrModified/deleted），标记 increment；首次为 baseline。prompt 原文、工作区身份（workspace_id）、账号身份（token 哈希绑定）全程随行。</div>
</section>

<section class="card">
<h2>三、快照打包内容</h2>
<div class="figure">{svg('m3')}
<figcaption>图 3 · 双车道：工作区快照主车道 + 全局配置侧车道</figcaption></div>
<table>
<tr><th>车道</th><th>内容</th><th>说明</th></tr>
<tr><td rowspan="3">主车道<br>工作区快照</td><td>工作树全部文件</td><td>受 ignore 规则约束有限，manifest 为准</td></tr>
<tr><td>.git 完整历史</td><td>提交对象、reflog、LFS 缓存——含已删除文件与历史中的凭据</td></tr>
<tr><td>meta/prompt.json</td><td>触发采集的用户提问原文</td></tr>
<tr><td rowspan="4">侧车道<br>extra-manifests</td><td>mcp.json</td><td>全局 MCP 服务器配置（服务地址、env——按含密钥对待）</td></tr>
<tr><td>instructions.json</td><td>全局指令（AGENTS.md）全文</td></tr>
<tr><td>skills / subagents / hooks / 行为设置</td><td>客户端能力配置全景</td></tr>
<tr><td>prompt 附件</td><td>对话中粘贴的图片等附件原件</td></tr>
</table>
</section>

<section class="card">
<h2>四、开关核验：UI 开关均不构成上传开关</h2>
<table>
<tr><th>设置项</th><th>代码级实际作用</th></tr>
<tr><td class="mono">optimizeAgentExperienceEnabled</td><td>仅控制数据是否用于模型训练；采集与上传不受其影响</td></tr>
<tr><td class="mono">repoSnapshotIndexingEnabled</td><td>仅控制服务端索引用途；sidecar 服务无条件构造，capture/upload 无此判断分支</td></tr>
</table>
<p>隐私政策原文只覆盖「对话中提交」的文本/文件/代码，未提及整仓与 Git 历史（ferstar 博客与多家媒体一致指出）。</p>
</section>

<section class="card">
<h2>五、官方回应 vs 代码事实</h2>
<blockquote>官方临时回复（2026-09-18）："此次问题源于 ZCode 的"代码库索引"功能。该功能旨在帮助用户在本地生成仓库索引，以支持包括历史版本在内的会话检查点恢复、历史版本回退及 Repo Wiki 等功能。Repo Wiki 功能在生成 Wiki 页面时可能会触发仓库数据上传。Wiki 页面在云端生成后，相关上传数据会立即销毁，不会保存。由于该功能在上线初期默认开启，部分用户因此受到影响。"</blockquote>
<table>
<tr><th>#</th><th>官方说法</th><th>代码事实</th><th>判定</th></tr>
<tr><td>1</td><td>问题源于"代码库索引"，该功能<b>在本地生成</b>索引</td><td>采集经凭证协商 → OSS 直传 → callback 完整出云；"索引"开关不控制采集上传</td><td><span class="tag tag-yellow">命名相关·因果错位</span></td></tr>
<tr><td>2</td><td>用途：检查点恢复 / 历史回退 / Repo Wiki</td><td>三者作为快照<b>消费方</b>在代码中确实存在</td><td><span class="tag tag-green">属实</span>（只解释用途，未解释范围）</td></tr>
<tr><td>3</td><td><b>Repo Wiki 可能</b>触发上传</td><td>captureBeforePrompt 由<b>每条用户消息</b>触发，与是否使用 Repo Wiki 无关</td><td><span class="tag tag-yellow">误导</span>：上传是常态路径</td></tr>
<tr><td>4</td><td>云端生成后上传数据<b>立即销毁，不会保存</b></td><td>① 私钥服务端托管，厂商全程可解；② 增量快照依赖 base_snapshot_id 基线链——基线必须留存供拼合；③ callback 登记持久化</td><td><span class="tag tag-red">存疑且自相矛盾</span></td></tr>
<tr><td>5</td><td>上线初期<b>默认开启</b>，部分用户受影响</td><td>sidecar 无条件构造，唯一门槛是登录态；所有登录用户的全部工作区都在范围内，且用户侧无关闭手段</td><td><span class="tag tag-yellow">半承认</span></td></tr>
<tr><td>6</td><td>（未回应）</td><td>.git 全历史 / prompt 原文 / MCP 配置 / AGENTS.md / 对话附件均在打包范围</td><td><span class="tag tag-red">范围超配未回应</span></td></tr>
</table>
<p><b>事实面敲定</b>：官方确认了"功能存在、默认开启、上传发生过"；但在因果（索引≠上传通道）、数据生命周期（"立即销毁"与增量基线留存直接矛盾，且私钥托管使销毁无法外部验证）、采集范围（超出任何声称用途的必要性）三点上与代码事实相悖或回避。逐条展开见仓库 <a href="{REPO}/blob/main/docs/05-official-response.md">docs/05-official-response.md</a>。</p>
</section>

<section class="card">
<h2>六、工程优化点（逆向观察）</h2>
<div class="figure">{svg('m4')}
<figcaption>图 4 · 采集-加密-传输三侧十处设计</figcaption></div>
<table>
<tr><th>侧</th><th>设计</th><th>点评</th></tr>
<tr><td rowspan="2">采集侧</td><td class="mono">manifest 增量 diff</td><td>baseManifestHash + addedOrModified/deleted，日常只传变更；代价是服务端维护快照树</td></tr>
<tr><td class="mono">大小预算前置</td><td>maxEncryptedArtifactBytes 在压缩阶段硬中断 + 实测尺寸记账，二次触发零成本决策</td></tr>
<tr><td rowspan="2">加密打包侧</td><td class="mono">信封加密</td><td>对称管数据、非对称只管 32B 密钥，开销与体积解耦；槽点：公钥服务端下发=非端到端</td></tr>
<tr><td class="mono">全流式管线</td><td>readStream→gzip→cipher→writeStream 背压，openAsBlob 流式上传；内存 O(1)，桌面端可行</td></tr>
<tr><td rowspan="4">传输容错侧</td><td class="mono">sidecar + worker + 调度器</td><td>UI 不阻塞；maxPendingCaptureIntents 限流；flushesByWorkspaceKey 串行化防竞争</td></tr>
<tr><td class="mono">凭证缓存 1h + prune</td><td>类 STS 架构，bucket 对客户端不可见可随时迁移；tokenHash 绑定防挪用</td></tr>
<tr><td class="mono">内容寻址 sha256</td><td>一套哈希服务 diff/去重/校验/审计四个目的——哈希即协议</td></tr>
<tr><td class="mono">pending 持久化队列</td><td>崩溃断网安全、退避重试、替补晋升；顽固到失败数百次仍在等——取证视角反而是礼物</td></tr>
</table>
<p>逐条展开见仓库 <a href="{REPO}/blob/main/docs/03-design-notes.md">docs/03-design-notes.md</a>。</p>
</section>

<section class="card">
<h2>七、加固</h2>
<p>原理：采集管线落点固定为 <code>~/.zcode/v2/checkpoints/</code>，令其不可写即可停摆整条链路（客户端对 IO 错误静默吞掉，主功能不受影响）。顺序关键：先清投料、再上锁。</p>
<pre><code># macOS                          # Linux
chflags uchg ~/.zcode/v2/checkpoints    chattr +i ~/.zcode/v2/checkpoints

# Windows（icacls 写拒绝 ACL）
$ck = 'C:\Users\&lt;user&gt;\.zcode\v2\checkpoints'
Get-ChildItem -LiteralPath $ck -Force | Remove-Item -Recurse -Force
icacls $ck /inheritance:r
icacls $ck /grant "$env:USERNAME:(OI)(CI)(RX)"
icacls $ck /deny  "$env:USERNAME:(OI)(CI)(WD,AD,WEA,WA)"</code></pre>
<p>回滚：删除对应 immutable 标志 / <code>icacls $ck /remove:d $env:USERNAME</code>。进阶（asar stub、遥测拉黑、网络层）与复检清单见仓库 <a href="{REPO}/blob/main/docs/04-hardening.md">docs/04-hardening.md</a>。</p>
</section>

<section class="card">
<h2>八、开源仓库与参考</h2>
<p>核心代码摘录（原文逐字 + 批注头）、六阶段流程走读、设计解析与加固方案的完整版本：</p>
<p style="font-size:15px"><a href="{REPO}">{REPO}</a></p>
<table>
<tr><th>仓库路径</th><th>内容</th></tr>
<tr><td class="mono">src/01-08-*.js</td><td>八个模块的还原代码摘录（sidecar / 归档 / 加密 / 上传客户端 / OSS 直传 / 状态机 / 队列 / 凭证解析）</td></tr>
<tr><td class="mono">docs/01-trace-chain.md</td><td>溯源链 E1-E8 完整版</td></tr>
<tr><td class="mono">docs/02-code-flow.md</td><td>六阶段代码走读（关键代码段 + 点评）</td></tr>
<tr><td class="mono">docs/03-design-notes.md</td><td>十处设计优化点解析 + 槽点</td></tr>
<tr><td class="mono">docs/04-hardening.md</td><td>三平台加固 + 回滚 + 复检清单</td></tr>
<tr><td class="mono">docs/05-official-response.md</td><td>官方回应逐条对照 + 事实面敲定</td></tr>
<tr><td class="mono">assets/diagrams-source.md + tools/</td><td>图表源码与报告构建脚本（本 PDF 可复现）</td></tr>
</table>
<p style="font-size:13px">参考：ferstar《扒一扒 ZCode 静默上传全量 Git 历史的骚操作》· NodeLoc《ZCode 会静默上传整仓快照》· Reddit r/ZaiGLM · OSCHINA · 钜亨网</p>
</section>

<div class="foot">分析仅基于静态客户端代码与本地 artifacts，未对服务端做任何探测 · 原始代码版权归 Z.ai（智谱）所有 · 图表由 ZCode + GLM-5.3-Flash + mmdx 渲染</div>
</div>
</body>
</html>"""

OUT_HTML.write_text(html, encoding="utf-8")
print(f"written: {OUT_HTML} ({OUT_HTML.stat().st_size/1024:.0f} KB)")
