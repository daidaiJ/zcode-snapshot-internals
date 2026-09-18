#!/usr/bin/env bash
# bench 矩阵 — WSL docker 真配额（cgroup v2 cpu.max / memory.max）。
# 配额档：1C2G、1C4G、2C4G。用法（在 WSL 内）：
#   sudo bash /mnt/d/CODE/ai/zcode-snapshot-internals/bench/matrix.sh [--smoke]
set -u
BENCH=/mnt/d/CODE/ai/zcode-snapshot-internals/bench
IMG=snapshot-bench:latest
FXVOL=bench-fx
SMOKE=${1:-}

echo "== build =="
docker build -q -t "$IMG" "$BENCH" || { echo BUILD-FAILED; exit 1; }

docker volume inspect $FXVOL >/dev/null 2>&1 || docker volume create $FXVOL >/dev/null
for spec in "s 500" "m 5000" "l 20000"; do
  set -- $spec
  docker run --rm -v $FXVOL:/fx --entrypoint bash "$IMG" -c \
    "test -d /fx/$1/.git || node gen-fixtures.js --dir /fx/$1 --count $2"
done

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

if [ "$SMOKE" = "--smoke" ]; then
  run scan-s 1 2 s scan
  exit 0
fi

# ── 扫描车道 ──
run scan-m-1c2g    1 2 m scan
run scan-m-2c4g    2 4 m scan
run scan-l-1c2g    1 2 l scan
run scan-l-2c4g    2 4 l scan
run scan-l-1c4g    1 4 l scan

# ── 打包+加密全链路 ──
run pipeline-m-1c2g  1 2 m pipeline-baseline
run pipeline-m-2c4g  2 4 m pipeline-baseline
run pipeline-m-1c4g  1 4 m pipeline-baseline
run pipeline-l-1c2g  1 2 l pipeline-baseline \
  "--state-dir /tmp/bs" "--cpu-prof --cpu-prof-dir=/prof --cpu-prof-name=pipeline-l-1c2g.cpuprofile"
run pipeline-l-2c4g  2 4 l pipeline-baseline
run pipeline-l-1c4g  1 4 l pipeline-baseline

# ── baseline→等长改写→increment（增量漏报演示）──
run cycle-l-1c2g     1 2 l cycle "--mutate 50"
run cycle-l-2c4g     2 4 l cycle "--mutate 50"

# ── e2e：采集→登记→flush 上传（回环）──
run e2e-m-1c2g   1 2 m e2e \
  "--state-dir /tmp/bs" "--cpu-prof --cpu-prof-dir=/prof --cpu-prof-name=e2e-m-1c2g.cpuprofile"
run e2e-m-2c4g   2 4 m e2e
run e2e-m-1c4g   1 4 m e2e

# ── 上传通道：POST(openAsBlob) vs PUT(流式) ──
run upost-256m-1c2g  1 2 none upload-probe "--mb 256 --method post --state-dir /tmp/bs"
run upost-256m-2c4g  2 4 none upload-probe \
  "--mb 256 --method post --state-dir /tmp/bs" \
  "--cpu-prof --cpu-prof-dir=/prof --cpu-prof-name=upost-256m-2c4g.cpuprofile"
run upost-1g5-1c2g   1 2 none upload-probe "--mb 1536 --method post --state-dir /tmp/bs"
run upost-1g5-1c4g   1 4 none upload-probe "--mb 1536 --method post --state-dir /tmp/bs"
run upost-1g5-2c4g   2 4 none upload-probe "--mb 1536 --method post --state-dir /tmp/bs"
run uput-1g5-1c2g    1 2 none upload-probe "--mb 1536 --method put --state-dir /tmp/bs"

# ── 60s 总超时 vs 100Mbps 带宽（1GiB 需要 ~86s）──
run upost-1g-throttle-2c4g 2 4 none upload-probe "--mb 1024 --method post --throttle-mbps 100 --state-dir /tmp/bs"

# ── 凭证过期也要先付的全文件哈希 ──
run reject-256m-1c2g 1 2 none reject-after-hash "--mb 256 --state-dir /tmp/bs"

# ── manifest 规模 ──
run manifest-100k-1c2g 1 2 none manifest-scale "--count 100000"

echo "== matrix done =="
