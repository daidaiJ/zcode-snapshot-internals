# -*- coding: utf-8 -*-
# bench 结果 JSON → 关键分析图表 SVG（GitHub 内联渲染优先：矢量、白底、大字号）。
# 用法：python bench/charts.py   （缺数据文件的图自动跳过，跑完补充矩阵后重跑即可）
import json
import os
import sys

import matplotlib

matplotlib.use("SVG")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "bench", "results")
OUT = os.path.join(ROOT, "assets", "charts")

plt.rcParams.update({
    "font.sans-serif": ["Microsoft YaHei", "SimHei", "DejaVu Sans"],
    "axes.unicode_minus": False,
    "font.size": 12.5,
    "axes.titlesize": 15,
    "axes.labelsize": 13,
    "xtick.labelsize": 11.5,
    "ytick.labelsize": 11.5,
    "legend.fontsize": 11.5,
    "figure.facecolor": "#ffffff",
    "axes.facecolor": "#ffffff",
    "axes.edgecolor": "#555555",
    "axes.grid": True,
    "grid.alpha": 0.28,
    "grid.linewidth": 0.7,
})

# 与火焰图同源的配色 + 三档配额色
C1, C2, C4 = "#d64545", "#e08b3a", "#3a7d44"   # 1C2G / 1C4G / 2C4G
CGOOD, CBAD, CBLUE, CPURP = "#3a7d44", "#c0392b", "#2f6db3", "#b23a8f"
PAPER = "#f8f4ec"


def load(name):
    p = os.path.join(RES, name + ".json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(fig, name):
    os.makedirs(OUT, exist_ok=True)
    fig.savefig(os.path.join(OUT, name + ".svg"), bbox_inches="tight", pad_inches=0.12)
    plt.close(fig)
    print("chart:", name)


def tier_color(tier):
    return {"1c2g": C1, "1c4g": C2, "2c4g": C4}[tier]


TIERS = ["1c2g", "1c4g", "2c4g"]


# ── 1. 扫描车道：串行，2C 无增益（D13）──
def chart_scan():
    data = {}
    for fx in ("m", "l"):
        for t in TIERS:
            r = load(f"scan-{fx}-{t}")
            if r:
                data[(fx, t)] = r["phases"]["scan"]["wallMs"]
    if not data:
        return
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.0), sharey=False)
    for ax, fx, label in ((axes[0], "m", "M 档 4,909 文件 / 86MB"),
                          (axes[1], "l", "L 档 19,594 文件 / 343MB")):
        tiers = [t for t in TIERS if (fx, t) in data]
        vals = [data[(fx, t)] / 1000 for t in tiers]
        bars = ax.bar(range(len(tiers)), vals, width=0.58,
                      color=[tier_color(t) for t in tiers], edgecolor="#333", linewidth=0.6)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + max(vals) * 0.02, f"{v:.1f}s",
                    ha="center", va="bottom", fontsize=12)
        ax.set_xticks(range(len(tiers)), tiers)
        ax.set_title(label)
        ax.set_ylim(0, max(vals) * 1.22)
        ax.set_ylabel("扫描墙钟 (s)" if ax is axes[0] else "")
    axes[1].annotate("1C → 2C：+0 核增益\n（串行 await，单文件 ~0.55ms）",
                     xy=(2, data[("l", "2c4g")] / 1000), xytext=(0.86, 0.60),
                     textcoords="axes fraction", fontsize=12, color="#333",
                     arrowprops=dict(arrowstyle="->", color="#333", lw=1.1))
    fig.suptitle("扫描车道（lstat + 16KB 采样）· 配额三档对比", fontsize=15.5, y=1.02)
    save(fig, "scan-cpu-scaling")


# ── 2. 打包+加密：1C 打满，2C 仅 ~1.4×（受 zlib 线程池/主线程结构限制）──
def chart_pipeline():
    data = {}
    for fx in ("m", "l"):
        for t in TIERS:
            r = load(f"pipeline-{fx}-{t}")
            if r:
                ph = r["phases"]["pack-encrypt-baseline"]
                data[(fx, t)] = (ph["wallMs"] / 1000, ph["cpuMs"] / 1000)
    if not data:
        return
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2))
    for ax, fx, label in ((axes[0], "m", "M 档 86MB 明文 → 22MB 密文"),
                          (axes[1], "l", "L 档 343MB 明文 → 88MB 密文")):
        tiers = [t for t in TIERS if (fx, t) in data]
        x = range(len(tiers))
        w = 0.36
        walls = [data[(fx, t)][0] for t in tiers]
        cpus = [data[(fx, t)][1] for t in tiers]
        b1 = ax.bar([i - w / 2 for i in x], walls, w, color=CBLUE, edgecolor="#333",
                    linewidth=0.6, label="墙钟")
        b2 = ax.bar([i + w / 2 for i in x], cpus, w, color=CPURP, edgecolor="#333",
                    linewidth=0.6, label="CPU（全线程合计）")
        for b, v in list(zip(b1, walls)) + list(zip(b2, cpus)):
            ax.text(b.get_x() + b.get_width() / 2, v + max(walls) * 0.015, f"{v:.0f}",
                    ha="center", va="bottom", fontsize=10.5)
        ax.set_xticks(x, tiers)
        ax.set_title(label)
        ax.set_ylim(0, max(walls) * 1.30)
        if ax is axes[0]:
            ax.set_ylabel("打包+加密耗时 (s)")
            ax.legend(loc="upper right", framealpha=0.9)
    if ("l", "1c2g") in data and ("l", "2c4g") in data:
        sp = data[("l", "1c2g")][0] / data[("l", "2c4g")][0]
        axes[1].annotate(f"2C 加速比仅 {sp:.2f}×\n1C 下 CPU≈墙钟（单核打满）",
                         xy=(2, data[("l", "2c4g")][0]), xytext=(0.52, 0.72),
                         textcoords="axes fraction", fontsize=12, color="#333",
                         arrowprops=dict(arrowstyle="->", color="#333", lw=1.1))
    fig.suptitle("打包+加密全链路（扫描→tar.gz→AES→双 sha256）· 配额三档", fontsize=15.5, y=1.02)
    save(fig, "pipeline-cpu-scaling")


# ── 3. e2e：每条 prompt 被阻塞的时间都花在哪 ──
def chart_e2e():
    tiers = [t for t in TIERS if load(f"e2e-m-{t}")]
    if not tiers:
        return
    scan, pack, up, other = [], [], [], []
    for t in tiers:
        r = load(f"e2e-m-{t}")
        st = r["scanTiming"]
        s = (st["gitMs"] + st["walkMs"] + st["statSampleMs"]) / 1000
        p = r["phases"]["pack-encrypt-baseline"]["wallMs"] / 1000
        u = r["phases"]["flush-upload"]["wallMs"] / 1000
        total = r["totalPromptBlockingMs"] / 1000
        scan.append(s); pack.append(p); up.append(u); other.append(max(total - s - p - u, 0))
    fig, ax = plt.subplots(figsize=(9.5, 3.9))
    y = range(len(tiers))
    ax.barh(y, scan, 0.52, color=C1, edgecolor="#333", linewidth=0.5, label="扫描（串行 lstat+采样）")
    ax.barh(y, pack, 0.52, left=scan, color=CBLUE, edgecolor="#333", linewidth=0.5, label="打包+加密")
    left2 = [a + b for a, b in zip(scan, pack)]
    ax.barh(y, up, 0.52, left=left2, color=CGOOD, edgecolor="#333", linewidth=0.5, label="上传（回环 mock）")
    left3 = [a + b for a, b in zip(left2, up)]
    ax.barh(y, other, 0.52, left=left3, color="#bbbbbb", edgecolor="#333", linewidth=0.5, label="其他（登记等）")
    for i, t in enumerate(tiers):
        total = scan[i] + pack[i] + up[i] + other[i]
        ax.text(total + 0.25, i, f"{total:.1f}s", va="center", fontsize=12.5, fontweight="bold")
        ax.text(scan[i] / 2, i, f"{scan[i]:.0f}", va="center", ha="center", fontsize=10.5, color="#fff")
        ax.text(scan[i] + pack[i] / 2, i, f"{pack[i]:.0f}", va="center", ha="center", fontsize=10.5, color="#fff")
    ax.set_yticks(y, tiers)
    ax.invert_yaxis()
    ax.set_xlabel("阻塞时长 (s) · M 档 86MB 仓库 · captureBeforePrompt 全程")
    ax.set_xlim(0, max(scan[i] + pack[i] + up[i] + other[i] for i in range(len(tiers))) * 1.16)
    ax.legend(loc="lower right", framealpha=0.95)
    ax.set_title("e2e：一条 prompt 触发的全链路阻塞分解（上传为回环，真实网络会更长）")
    save(fig, "e2e-blocking-breakdown")


# ── 4. 上传通道：RSS 不随体积放大（Node 22 惰性 Blob）+ 吞吐 ──
def chart_upload_rss():
    runs = [
        ("POST 256MB\n1C2G", "upost-256m-1c2g"), ("POST 256MB\n2C4G", "upost-256m-2c4g"),
        ("POST 1.5GB\n1C2G", "upost-1g5-1c2g"), ("POST 1.5GB\n1C4G", "upost-1g5-1c4g"),
        ("POST 1.5GB\n2C4G", "upost-1g5-2c4g"), ("PUT 1.5GB\n1C2G", "uput-1g5-1c2g"),
    ]
    runs = [(lbl, load(n)) for lbl, n in runs]
    runs = [(lbl, r) for lbl, r in runs if r]
    if not runs:
        return
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.3))
    x = range(len(runs))
    rss = [r["memory"]["peakRssBytes"] / 1048576 for _, r in runs]
    mbps = [r["effectiveMbps"] for _, r in runs]
    ok = [r["uploadOk"] for _, r in runs]
    colors = [CGOOD if o else CBAD for o in ok]
    b1 = ax1.bar(x, rss, 0.6, color=colors, edgecolor="#333", linewidth=0.6)
    for b, v in zip(b1, rss):
        ax1.text(b.get_x() + b.get_width() / 2, v + 3, f"{v:.0f}", ha="center", fontsize=11)
    ax1.set_xticks(x, [lbl for lbl, _ in runs], fontsize=10)
    ax1.set_ylabel("进程 RSS 峰值 (MB)")
    ax1.set_ylim(0, max(rss) * 1.25)
    ax1.set_title("整文件 Blob 的 POST 并未放大内存\n（Node 22 openAsBlob 文件惰性背书）")
    ax1.axhline(1536, color="#999", lw=1, ls="--")
    ax1.text(0.02, 0.96, "虚线=产物体积 1536MB（未触及）", transform=ax1.transAxes,
             fontsize=10.5, color="#777", va="top")
    b2 = ax2.bar(x, mbps, 0.6, color=CBLUE, edgecolor="#333", linewidth=0.6)
    for b, v in zip(b2, mbps):
        ax2.text(b.get_x() + b.get_width() / 2, v + 40, f"{v:.0f}", ha="center", fontsize=11)
    ax2.set_xticks(x, [lbl for lbl, _ in runs], fontsize=10)
    ax2.set_ylabel("回环吞吐 (Mbps)")
    ax2.set_ylim(0, max(mbps) * 1.22)
    ax2.set_title("回环吞吐：1C 下 POST ≈ 1.6-1.9 Gbps 封顶\n（CPU 单核打满，2C 提升有限）")
    fig.suptitle("上传通道：POST(openAsBlob) vs PUT(流式) · 内存与吞吐", fontsize=15.5, y=1.04)
    save(fig, "upload-rss-throughput")


# ── 5. 增量漏报：改动 50 个文件，增量包 0.14MB（D1）──
def chart_cycle():
    r = load("cycle-l-1c2g")
    if not r:
        return
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.0))
    sizes = [r["baselineEncryptedBytes"] / 1048576, r["incrementEncryptedBytes"] / 1048576]
    b = ax1.bar(["baseline 密文", "increment 密文"], sizes, 0.5, color=[CBLUE, C1],
                edgecolor="#333", linewidth=0.6)
    ax1.set_yscale("log")
    ax1.set_ylabel("密文体积 (MB, 对数轴)")
    for bb, v in zip(b, sizes):
        ax1.text(bb.get_x() + bb.get_width() / 2, v * 1.35, f"{v:.2f}MB", ha="center", fontsize=12.5)
    ax1.set_title("等长改写 50 文件后：增量包仅 0.14MB\n——50 个改动文件一个都没进包")
    det = [0, r["deltaMissed"]]
    b2 = ax2.bar(["被 diff 检出", "实际改动但漏检"], det, 0.5, color=[CGOOD, CBAD],
                 edgecolor="#333", linewidth=0.6)
    for bb, v in zip(b2, det):
        ax2.text(bb.get_x() + bb.get_width() / 2, v + 1.2, str(v), ha="center", fontsize=13)
    ax2.set_ylabel("文件数")
    ax2.set_ylim(0, max(det) * 1.25)
    ax2.set_title("size-only delta：等长修改 100% 漏检\n（mtime/内容哈希均未参与判定）")
    fig.suptitle("cycle（L 档）：size-only 增量的漏报面", fontsize=15.5, y=1.03)
    save(fig, "cycle-delta-miss")


# ── 6. 60s 超时悬崖：体积 × 带宽的通过/失败边界（D10）──
def chart_cliff():
    pts = []  # (sizeMB, mbps, ok)
    mapping = [
        ("cliff-256m-25mbps", 256, 25), ("cliff-256m-50mbps", 256, 50),
        ("cliff-512m-50mbps", 512, 50), ("cliff-512m-100mbps", 512, 100),
        ("cliff-1g-200mbps", 1024, 200), ("upost-1g-throttle-2c4g", 1024, 100),
    ]
    for name, size, mbps in mapping:
        r = load(name)
        if r:
            pts.append((size, mbps, r["uploadOk"], r.get("uploadWallMs", 0) / 1000))
    if len(pts) < 4:
        print("chart: cliff skipped (数据不足)")
        return
    fig, ax = plt.subplots(figsize=(9.8, 4.6))
    # 悬崖线：60s 内传完所需的最小持续带宽
    xs = [180, 1150]
    ax.plot(xs, [s * 8 / 60 for s in xs], ls="--", lw=1.6, color="#555",
            label="60s 超时悬崖 = size×8/60 Mbps")
    ax.fill_between(xs, [s * 8 / 60 for s in xs], [600, 600], alpha=0.10, color=CBAD)
    ax.fill_between(xs, 0, [s * 8 / 60 for s in xs], alpha=0.08, color=CGOOD)
    for size, mbps, ok, wall in pts:
        ax.scatter(size, mbps, s=150, color=CGOOD if ok else CBAD, edgecolor="#222",
                   linewidth=0.8, zorder=5)
        ax.annotate(f"{'通过' if ok else '超时'}\n{wall:.0f}s", (size, mbps),
                    textcoords="offset points", xytext=(12, 8), fontsize=11,
                    color=CGOOD if ok else CBAD)
    ax.set_xscale("log")
    ax.set_xticks([256, 512, 1024], ["256MB", "512MB", "1GiB"])
    ax.set_xlim(200, 1250)
    ax.set_ylim(0, 260)
    ax.set_xlabel("密文产物体积（POST 通道）")
    ax.set_ylabel("上行带宽 (Mbps)")
    ax.legend(loc="upper left")
    ax.set_title("60s 总超时悬崖：产物 × 带宽 —— 右上方=必失败（丢弃重来，且要等下一条 prompt 才重试）")
    save(fig, "timeout-cliff")


# ── 7. IO 账单：为 22MB 密文搬运了多少字节（D2/D8 的磁盘视角）──
def chart_io():
    r = load("io-e2e-m-1c2g")
    if not r or "ioTotal" not in r or "rcharBytes" not in r.get("ioTotal", {}):
        print("chart: io skipped (数据不足)")
        return
    payload_mb = r["encryptedSizeBytes"] / 1048576
    plain_mb = r["includedBytes"] / 1048576
    labels, rchar, wchar = [], [], []
    for ph, io in r["phases"].items():
        if "rcharBytes" not in io.get("io", {}):
            continue
        labels.append(ph)
        rchar.append(io["io"]["rcharBytes"] / 1048576)
        wchar.append(io["io"]["wcharBytes"] / 1048576)
    total_r = r["ioTotal"]["rcharBytes"] / 1048576
    total_w = r["ioTotal"]["wcharBytes"] / 1048576
    ph_sum_r, ph_sum_w = sum(rchar), sum(wchar)
    labels.append("扫描+启动\n（总账-阶段和）")
    rchar.append(max(total_r - ph_sum_r, 0))
    wchar.append(max(total_w - ph_sum_w, 0))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.5, 4.4))
    x = range(len(labels))
    b1 = ax1.bar(x, rchar, 0.58, color=CBLUE, edgecolor="#333", linewidth=0.6)
    for b, v in zip(b1, rchar):
        ax1.text(b.get_x() + b.get_width() / 2, v + max(rchar) * 0.02, f"{v:.0f}",
                 ha="center", fontsize=11)
    ax1.set_xticks(x, labels, fontsize=10)
    ax1.set_ylabel("逻辑读 rchar (MB)")
    ax1.set_ylim(0, max(rchar) * 1.22)
    ax1.set_title(f"读账单：全链路共读 {total_r:.0f}MB")
    b2 = ax2.bar(x, wchar, 0.58, color=CPURP, edgecolor="#333", linewidth=0.6)
    for b, v in zip(b2, wchar):
        ax2.text(b.get_x() + b.get_width() / 2, v + max(wchar) * 0.02, f"{v:.0f}",
                 ha="center", fontsize=11)
    ax2.set_xticks(x, labels, fontsize=10)
    ax2.set_ylabel("逻辑写 wchar (MB)")
    ax2.set_ylim(0, max(wchar) * 1.28)
    ax2.set_title(f"写账单：全链路共写 {total_w:.0f}MB（明文+密文双写）")
    ax2.axhline(payload_mb, color=CBAD, lw=1.2, ls="--")
    ax2.text(0.02, payload_mb * 1.06, f"最终上传的密文仅 {payload_mb:.0f}MB", fontsize=10.5, color=CBAD)
    fig.suptitle(f"IO 账单（e2e M 档：{plain_mb:.0f}MB 仓库）：搬运 {(total_r + total_w):.0f}MB"
                 f" ≈ 密文产物的 {(total_r + total_w) / payload_mb:.0f}×", fontsize=15.5, y=1.04)
    save(fig, "io-ledger")


def main():
    made = [f for f in (chart_scan, chart_pipeline, chart_e2e, chart_upload_rss,
                        chart_cycle, chart_cliff, chart_io)]
    for f in made:
        try:
            f()
        except Exception as e:  # 单图失败不拖累其余
            print("chart-failed:", f.__name__, e, file=sys.stderr)
    print("outdir:", OUT)


if __name__ == "__main__":
    main()
