// 合成仓库生成器 — bench 专用。确定性种子，文本 98% / 二进制 2%（供扫描过滤）。
// --mutate K：改写 K 个文本文件内容但保持字节长度不变（演示 size-only 增量漏报）。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOCAB = 'sys usr opt dev run src lib core base main fast slow cache index render commit merge patch token schema stream buffer window signal packet frame queue stack heap retry backoff manifest snapshot upload encrypt archive digest payload'.split(' ');

function textChunk(rand, targetBytes) {
  const lines = [];
  let n = 0;
  while (n < targetBytes) {
    const words = [];
    for (let i = 0; i < 10; i++) words.push(VOCAB[Math.floor(rand() * VOCAB.length)]);
    const line = '// ' + words.join(' ') + ' ' + Math.floor(rand() * 1e9).toString(36);
    lines.push(line);
    n += line.length + 1;
  }
  return Buffer.from(lines.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^-+/, '')] = args[i + 1];
  const dir = opt.dir;
  const count = Number(opt.count || 1000);
  const seed = Number(opt.seed || 42);
  const mutate = Number(opt.mutate || 0);
  if (!dir) throw new Error('--dir required');
  const rand = mulberry32(seed);

  if (mutate > 0) {
    // 就地等长改写：小写字母 a..y → b..z，字节长度不变、内容全变
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && p.endsWith('.ts')) files.push(p);
      }
    })(dir);
    files.sort();
    let mutated = 0;
    for (const f of files) {
      if (mutated >= mutate) break;
      const buf = fs.readFileSync(f);
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b >= 97 && b <= 121) buf[i] = b + 1;
      }
      fs.writeFileSync(f, buf);
      mutated++;
    }
    console.log(JSON.stringify({ mutated, totalTs: files.length }));
    return;
  }

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let binaries = 0;
  for (let i = 0; i < count; i++) {
    const dirIdx = Math.floor(i / 25);
    const sub = path.join(dir, 'src', `pkg${Math.floor(dirIdx / 20)}`, `mod${dirIdx % 20}`);
    fs.mkdirSync(sub, { recursive: true });
    const file = path.join(sub, `file${i}.ts`);
    if (rand() < 0.02) {
      const size = 8 * 1024 + Math.floor(rand() * 56 * 1024);
      const buf = Buffer.allocUnsafe(size);
      for (let j = 0; j < size; j += 4096) {
        const c = require('node:crypto').randomBytes(Math.min(4096, size - j));
        c.copy(buf, j);
      }
      fs.writeFileSync(file, buf);
      binaries++;
    } else {
      fs.writeFileSync(file, textChunk(rand, 2 * 1024 + Math.floor(rand() * 30 * 1024)));
    }
  }
  // git 仓库化（让扫描走 git ls-files 车道，对齐真实优先级）
  const g = (args2) => spawnSync('git', args2, { cwd: dir, encoding: 'utf8' });
  g(['init', '-q']);
  g(['config', 'user.email', 'bench@local']);
  g(['config', 'user.name', 'bench']);
  g(['add', '-A']);
  console.log(JSON.stringify({ dir, count, binaries }));
}

main();
