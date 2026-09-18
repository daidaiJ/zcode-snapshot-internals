#!/usr/bin/env bash
# bench 补充矩阵 — IO 账单（/proc/self/io + cgroup io.stat 增量）、heap-prof 分配火焰图、
# 带宽×体积的 60s 超时悬崖。用法（WSL 内）：sudo bash .../bench/matrix2.sh
set -u
BENCH=/mnt/d/CODE/ai/zcode-snapshot-internals/bench
IMG=snapshot-bench:latest
FXVOL=bench-fx

echo "== build =="
docker build -q -t "$IMG" "$BENCH" || { echo BUILD-FAILED; exit 1; }
docker volume inspect $FXVOL >/dev/null 2>&1 || docker volume create $FXVOL >/dev/null

# run <name> <cpus> <memGB> <fixture|none> <scenario> <extra-args> [node-flags]
run() {
  local name=$1 cpus=$2 mem=$3 fx=$4 sc=$5 extra=${6:-} nflags=${7:-}
  local t0=$(date +%s)
  docker run --rm --cpus=$cpus --memory=${mem}g --memory-swap=${mem}g \
    -v $FXVOL:/fx:ro -v "$BENCH/results":/results -v "$BENCH/prof":/prof \
    --entrypoint bash "$IMG" -c \
    "cp -r /fx/$fx /tmp/repo 2>/dev/null; cd /bench; node $nflags run.js --scenario $sc --repo /tmp/repo $extra --out /results/$name.json" \
    > "$BENCH/results/$name.log" 2>&1
  local code=$?
  echo "[$name] cpus=$cpus mem=${mem}g exit=$code elapsed=$(( $(date +%s) - t0 ))s"
  [ $code -ne 0 ] && tail -3 "$BENCH/results/$name.log" | sed 's/^/    /'
}

# ── IO 账单：同场景复跑，拿每阶段 /proc/self/io + cgroup io.stat 增量 ──
run io-pipeline-m-1c2g  1 2 m pipeline-baseline
run io-pipeline-l-1c2g  1 2 l pipeline-baseline
run io-e2e-m-1c2g       1 2 m e2e "--state-dir /tmp/bs"

# ── 分配热点：heap-prof（pipeline-m，含扫描采样/tar/JSON/信封全链）──
run heap-pipeline-m-1c2g 1 2 m pipeline-baseline \
  "" "--heap-prof --heap-prof-dir=/prof --heap-prof-name=heap-pipeline-m-1c2g.heapprofile"

# ── 带宽×体积悬崖：60s 总超时封顶，需要时长 size*8/mbps > 60s 的必失败 ──
# 悬崖线 mbps* = size*8/60：256MB→34，512MB→68，1GiB→137
run cliff-256m-25mbps  1 2 none upload-probe "--mb 256 --throttle-mbps 25 --state-dir /tmp/bs"
run cliff-256m-50mbps  1 2 none upload-probe "--mb 256 --throttle-mbps 50 --state-dir /tmp/bs"
run cliff-512m-50mbps  1 2 none upload-probe "--mb 512 --throttle-mbps 50 --state-dir /tmp/bs"
run cliff-512m-100mbps 1 2 none upload-probe "--mb 512 --throttle-mbps 100 --state-dir /tmp/bs"
run cliff-1g-200mbps   1 2 none upload-probe "--mb 1024 --throttle-mbps 200 --state-dir /tmp/bs"

# ── 慢 socket 下的 PUT 流式 vs POST Blob（内存 buffer 行为对照；1GiB@100Mbps 必超时）──
run uput-1g-throttle-1c2g 1 2 none upload-probe "--mb 1024 --method put --throttle-mbps 100 --state-dir /tmp/bs"

echo "== matrix2 done =="
