// 阶段计时 + 内存采样 + 结果落盘 — bench 专用，非 ZCode 代码。
'use strict';
const fs = require('node:fs');

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

// /proc/self/io：rchar/wchar=逻辑读写字节（含页缓存命中）；read_bytes/write_bytes=
// 实际下块层的读写。cgroup io.stat：容器级 rbytes/wbytes/rios/wios（cgroup v2）。
function readProcIo() {
  try {
    const s = fs.readFileSync('/proc/self/io', 'utf8');
    const g = (k) => {
      const m = s.match(new RegExp(k + ':\\s+(\\d+)'));
      return m ? Number(m[1]) : 0;
    };
    return { rchar: g('rchar'), wchar: g('wchar'), readBytes: g('read_bytes'), writeBytes: g('write_bytes') };
  } catch {
    return null;
  }
}
function readCgroupIo() {
  try {
    const s = fs.readFileSync('/sys/fs/cgroup/io.stat', 'utf8');
    let rbytes = 0, wbytes = 0, rios = 0, wios = 0;
    for (const line of s.split('\n')) {
      for (const kv of line.trim().split(/\s+/).slice(1)) {
        const [k, v] = kv.split('=');
        if (k === 'rbytes') rbytes += Number(v);
        else if (k === 'wbytes') wbytes += Number(v);
        else if (k === 'rios') rios += Number(v);
        else if (k === 'wios') wios += Number(v);
      }
    }
    return { rbytes, wbytes, rios, wios };
  } catch {
    return null;
  }
}
function ioSnapshot() {
  return { proc: readProcIo(), cg: readCgroupIo() };
}
function ioDelta(a, b) {
  const d = {};
  if (a.proc && b.proc) {
    d.rcharBytes = b.proc.rchar - a.proc.rchar;
    d.wcharBytes = b.proc.wchar - a.proc.wchar;
    d.readBytes = b.proc.readBytes - a.proc.readBytes;
    d.writeBytes = b.proc.writeBytes - a.proc.writeBytes;
  }
  if (a.cg && b.cg) {
    d.cgReadBytes = b.cg.rbytes - a.cg.rbytes;
    d.cgWriteBytes = b.cg.wbytes - a.cg.wbytes;
    d.cgRios = b.cg.rios - a.cg.rios;
    d.cgWios = b.cg.wios - a.cg.wios;
  }
  return d;
}

// 记录每个阶段的 wall 与 CPU 时间（user+sys），语义同一次 profile 的绿/红条。
async function phase(name, fn) {
  const t0 = nowMs();
  const r0 = process.resourceUsage();
  const io0 = ioSnapshot();
  try {
    const value = await fn();
    return value;
  } finally {
    const wall = nowMs() - t0;
    const r1 = process.resourceUsage();
    const cpu =
      (r1.userCPUTime - r0.userCPUTime + (r1.systemCPUTime - r0.systemCPUTime)) /
      1000;
    phase.results[name] = { wallMs: wall, cpuMs: Math.round(cpu), io: ioDelta(io0, ioSnapshot()) };
  }
}
phase.results = {};

// 采样 RSS / VmHWM / cgroup memory.peak（容器内 cgroup v2）。
function startMemorySampler(intervalMs = 50) {
  const state = { peakRssBytes: 0, peakVmHwmBytes: 0, peakCgroupBytes: 0, samples: 0 };
  const timer = setInterval(() => {
    state.samples++;
    state.peakRssBytes = Math.max(state.peakRssBytes, process.memoryUsage().rss);
    try {
      const status = fs.readFileSync('/proc/self/status', 'utf8');
      const m = status.match(/VmHWM:\s+(\d+) kB/);
      if (m) state.peakVmHwmBytes = Math.max(state.peakVmHwmBytes, Number(m[1]) * 1024);
    } catch {}
    try {
      const p = Number(fs.readFileSync('/sys/fs/cgroup/memory.peak', 'utf8'));
      if (Number.isFinite(p)) state.peakCgroupBytes = Math.max(state.peakCgroupBytes, p);
    } catch {}
  }, intervalMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
      return state;
    },
  };
}

async function writeResults(file, payload) {
  fs.mkdirSync(require('node:path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

module.exports = { phase, startMemorySampler, writeResults, nowMs, ioSnapshot, ioDelta };
