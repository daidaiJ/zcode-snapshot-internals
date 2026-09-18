# -*- coding: utf-8 -*-
# 压测结果完整性校验：对 30 份结果 JSON 的关键结论做断言（容差范围），
# 全部通过退出码 0。用法：python bench/verify.py
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "bench", "results")

passed, failed = 0, []


def load(name):
    with open(os.path.join(RES, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
    else:
        failed.append(f"{name}: {detail}")
        print(f"FAIL {name}: {detail}")


def main():
    # ── 扫描：串行、配额无增益 ──
    for n in ("scan-m-1c2g", "scan-m-2c4g", "scan-l-1c2g", "scan-l-1c4g", "scan-l-2c4g"):
        r = load(n)
        w = r["phases"]["scan"]["wallMs"]
        check(f"{n}.wall", 2000 <= w <= 15000, w)
        check(f"{n}.serial", r["scanTiming"]["statSampleMs"] / w > 0.9,
              r["scanTiming"]["statSampleMs"] / w)
    l1, l2 = load("scan-l-1c2g")["phases"]["scan"]["wallMs"], load("scan-l-2c4g")["phases"]["scan"]["wallMs"]
    check("scan-l.1c-vs-2c", abs(l1 - l2) / l1 < 0.15, f"{l1} vs {l2}")

    # ── 打包+加密：1C CPU≈墙钟；2C 加速 1.2-1.7× ──
    for fx in ("m", "l"):
        w1 = load(f"pipeline-{fx}-1c2g")["phases"]["pack-encrypt-baseline"]
        check(f"pipeline-{fx}.cpu-eq-wall", 0.9 <= w1["cpuMs"] / w1["wallMs"] <= 1.15,
              w1["cpuMs"] / w1["wallMs"])
        w2 = load(f"pipeline-{fx}-2c4g")["phases"]["pack-encrypt-baseline"]["wallMs"]
        sp = w1["wallMs"] / w2
        check(f"pipeline-{fx}.2c-speedup", 1.2 <= sp <= 1.7, sp)
    pl = load("pipeline-l-1c2g")
    check("pipeline-l.size", 80e6 < pl["encryptedSizeBytes"] < 100e6, pl["encryptedSizeBytes"])

    # ── cycle：size-only delta 等长改写全漏 ──
    for n in ("cycle-l-1c2g", "cycle-l-2c4g"):
        r = load(n)
        check(f"{n}.missed", r["deltaMissed"] == r["mutatedFiles"] == 50,
              (r["deltaMissed"], r["mutatedFiles"]))
        check(f"{n}.increment-tiny", 0 < r["incrementEncryptedBytes"] < 1e6,
              r["incrementEncryptedBytes"])

    # ── e2e：prompt 阻塞 9-16s，成功落 state ──
    for n in ("e2e-m-1c2g", "e2e-m-1c4g", "e2e-m-2c4g"):
        r = load(n)
        check(f"{n}.blocking", 9000 <= r["totalPromptBlockingMs"] <= 16000,
              r["totalPromptBlockingMs"])
        check(f"{n}.accepted", len(r["finalStateAcceptedHash"]) == 64,
              r["finalStateAcceptedHash"][:12])

    # ── 上传：不限速全通过、RSS 不随体积放大 ──
    for n in ("upost-256m-1c2g", "upost-256m-2c4g", "upost-1g5-1c2g",
              "upost-1g5-1c4g", "upost-1g5-2c4g", "uput-1g5-1c2g"):
        r = load(n)
        check(f"{n}.ok", r["uploadOk"] is True)
        check(f"{n}.rss-flat", 0 < r["memory"]["peakRssBytes"] < 200 * 1048576,
              r["memory"]["peakRssBytes"] // 1048576)

    # ── 悬崖：实测通过/失败 == 理论线 mbps* = size*8/60 ──
    cliff = [
        ("cliff-256m-25mbps", 256, 25, False), ("cliff-256m-50mbps", 256, 50, True),
        ("cliff-512m-50mbps", 512, 50, False), ("cliff-512m-100mbps", 512, 100, True),
        ("cliff-1g-200mbps", 1024, 200, True), ("upost-1g-throttle-2c4g", 1024, 100, False),
        ("uput-1g-throttle-1c2g", 1024, 100, False),
    ]
    for n, size, mbps, expect_ok in cliff:
        r = load(n)
        theory = mbps > size * 8 / 60
        check(f"{n}.matches-theory", theory == expect_ok == r["uploadOk"],
              f"theory={theory} actual={r['uploadOk']}")
        if not r["uploadOk"]:
            check(f"{n}.aborted-at-60s", "timeout" in (r.get("uploadMessage") or "").lower(),
                  r.get("uploadMessage"))
            wall = r["phases"][f"upload-{'put' if 'uput' in n else 'post'}"]["wallMs"]
            check(f"{n}.wall-60s", 59500 <= wall <= 61000, wall)

    # ── key_expired 前白付的哈希 ──
    r = load("reject-256m-1c2g")
    check("reject.hash-cost", 300 <= r["hashMsBeforeKeyExpired"] <= 2000,
          r["hashMsBeforeKeyExpired"])

    # ── manifest 规模固定税 ──
    r = load("manifest-100k-1c2g")
    tax = sum(p["wallMs"] for p in r["phases"].values())
    check("manifest.tax", 150 <= tax <= 700, tax)

    # ── IO 账单：搬运倍数 12-16×；明文+密文双写 ──
    r = load("io-e2e-m-1c2g")
    moved = (r["ioTotal"]["rcharBytes"] + r["ioTotal"]["wcharBytes"]) / r["encryptedSizeBytes"]
    check("io-e2e.multiplier", 10 <= moved <= 20, round(moved, 1))
    w = r["phases"]["pack-encrypt-baseline"]["io"]["wcharBytes"]
    check("io-e2e.double-write", 1.7 <= w / r["encryptedSizeBytes"] <= 2.5,
          round(w / r["encryptedSizeBytes"], 2))
    rl = load("io-pipeline-l-1c2g")
    moved_l = (rl["ioTotal"]["rcharBytes"] + rl["ioTotal"]["wcharBytes"]) / rl["encryptedSizeBytes"]
    check("io-pipeline-l.multiplier", 8 <= moved_l <= 16, round(moved_l, 1))

    print(f"\n{passed} checks passed, {len(failed)} failed")
    if failed:
        sys.exit(1)
    print("ALL GREEN")


if __name__ == "__main__":
    main()
