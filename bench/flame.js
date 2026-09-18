// .cpuprofile → 火焰图 SVG + 热点 markdown 表。bench 专用。
// 用法：node flame.js <a.cpuprofile> [b.cpuprofile ...] --outdir assets/flame --basename name
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { i++; continue; } // 跳过 --opt 及其值
  files.push(argv[i]);
}
const getOpt = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const outdir = getOpt('outdir', 'flame-out');
const base = getOpt('basename', 'flame');
const TITLE = getOpt('title', base);

function parseProfile(file) {
  const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nodes = new Map();
  for (const n of prof.nodes) nodes.set(n.id, n);
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  // self 时间：timeDeltas[i] 是 sample[i] 前的间隔
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) {
    const dt = Math.max(0, Math.min(prof.timeDeltas[i] ?? 0, 100_000)); // 100ms 封顶去空闲毛刺
    if (dt <= 0) continue;
    self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + dt);
  }
  const children = new Map();
  for (const n of prof.nodes) children.set(n.id, n.children ?? []);
  const totalCache = new Map();
  const total = (id) => {
    if (totalCache.has(id)) return totalCache.get(id);
    let t = self.get(id) ?? 0;
    for (const c of children.get(id) ?? []) t += total(c);
    totalCache.set(id, t);
    return t;
  };
  let rootId = prof.nodes[0].id;
  for (const n of prof.nodes) if (!parent.has(n.id)) { rootId = n.id; break; }
  return { nodes, parent, children, self, total, rootId };
}

function frameLabel(node) {
  const cf = node.callFrame;
  const fn = cf.functionName || '(anonymous)';
  let loc = (cf.url || '').replace(/^node:/, '');
  if (loc.includes('/')) loc = loc.split('/').pop();
  return { fn, loc, line: (cf.lineNumber ?? -1) + 1 };
}

function categorize(loc, fn) {
  if (loc === '' && /^(gzip|deflate|crc|sha|aes|rsa|crypto| PBKDF)/i.test(fn)) return 'native-crypto';
  if (loc.startsWith('zlib') || /crypto|zlib|internal\/streams/.test(loc + fn)) return 'native-streams';
  if (/^node:|internal\//.test(loc) || loc === '') return 'node-internal';
  if (/pipeline|tar|worker|state|run|metrics/.test(loc)) return 'bench';
  return 'other';
}
const CAT_COLOR = {
  'native-crypto': '#d64545',
  'native-streams': '#b23a8f',
  'node-internal': '#e08b3a',
  bench: '#3a7d44',
  other: '#c9a227',
};

function renderSvg(p, titleText, outFile) {
  const W = 1400, ROW = 17, PAD = 2, FONT = 10.5;
  const totalMs = p.total(p.rootId) / 1000;
  const rows = [];
  // 自底向上布局：root 在最下一行；children 画在父帧正上方
  const depthOf = new Map();
  const stack = [[p.rootId, 0]];
  let maxDepth = 0;
  while (stack.length) {
    const [id, d] = stack.pop();
    depthOf.set(id, d);
    maxDepth = Math.max(maxDepth, d);
    for (const c of p.children.get(id) ?? []) stack.push([c, d + 1]);
  }
  const H = Math.min(maxDepth + 1, 48) * ROW + 70;
  const rects = [];
  const labelOut = [];
  const layout = (id, x0, width, depth) => {
    if (width < 0.4 || depth > 46 || rects.length > 20000) return;
    const t = p.total(id);
    if (t <= 0) return;
    const node = p.nodes.get(id);
    const { fn, loc, line } = frameLabel(node);
    const cat = categorize(loc, fn);
    const y = H - 45 - (depth + 1) * ROW;
    rects.push({ x: x0, y, w: width, cat, fn, loc, line, ms: t / 1000, selfMs: (p.self.get(id) ?? 0) / 1000 });
    let cx = x0;
    const kids = [...(p.children.get(id) ?? [])].sort((a, b) => p.total(b) - p.total(a));
    for (const c of kids) {
      const cw = (p.total(c) / t) * width;
      layout(c, cx, cw, depth + 1);
      cx += cw;
    }
  };
  layout(p.rootId, 0, W - 20, 0);
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Consolas, Menlo, monospace">\n`;
  svg += `<rect width="${W}" height="${H}" fill="#f8f4ec"/>\n`;
  svg += `<text x="10" y="22" font-size="15" font-weight="bold" fill="#222">${esc(titleText)} — total ${(totalMs / 1000).toFixed(2)}s</text>\n`;
  svg += `<text x="10" y="40" font-size="${FONT}" fill="#555">frames: ${rects.length} · width ∝ total CPU time · 根在底部，向上是调用方→被调方 · 颜色: 红=native crypto 压缩 橙=node 内建 绿=bench 重建件</text>\n`;
  for (const r of rects) {
    svg += `<rect x="${r.x.toFixed(1)}" y="${r.y}" width="${Math.max(r.w, 0.4).toFixed(1)}" height="${ROW - PAD}" fill="${CAT_COLOR[r.cat]}" rx="1" opacity="0.92"><title>${esc(`${r.fn}  ${r.loc}:${r.line}\ntotal ${r.ms.toFixed(1)}ms  self ${r.selfMs.toFixed(1)}ms`)}</title></rect>\n`;
    if (r.w > 34) {
      const maxChars = Math.floor((r.w - 4) / (FONT * 0.62));
      const label = (r.fn + ' ' + (r.loc ? r.loc + ':' + r.line : '')).slice(0, maxChars);
      svg += `<text x="${(r.x + 2).toFixed(1)}" y="${r.y + ROW - 5}" font-size="${FONT}" fill="#111">${esc(label)}</text>\n`;
    }
  }
  svg += `</svg>\n`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, svg);
  return { rects, totalMs };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function topTable(rects, totalMs) {
  const bySelf = [...rects].sort((a, b) => b.selfMs - a.selfMs).slice(0, 22);
  const lines = ['| # | 函数 | 位置 | self ms | self % | total ms |', '|--:|---|---|--:|--:|--:|'];
  bySelf.forEach((r, i) => {
    lines.push(`| ${i + 1} | \`${r.fn}\` | ${r.loc || '-'}:${r.line} | ${r.selfMs.toFixed(0)} | ${(r.selfMs / totalMs * 100).toFixed(1)} | ${r.ms.toFixed(0)} |`);
  });
  // 按类别聚合
  const cat = {};
  for (const r of rects) cat[r.cat] = (cat[r.cat] ?? 0) + r.selfMs;
  lines.push('', '| 类别 | self ms | 占比 |', '|---|--:|--:|');
  for (const [k, v] of Object.entries(cat).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v.toFixed(0)} | ${(v / totalMs * 100).toFixed(1)}% |`);
  }
  return lines.join('\n');
}

for (const f of files) {
  const p = parseProfile(f);
  const name = path.basename(f, '.cpuprofile');
  const svgFile = path.join(outdir, `${base}.svg`);
  const { rects, totalMs } = renderSvg(p, TITLE, svgFile);
  const md = `# ${TITLE}\n\nprofile: \`${f}\` · total ${(totalMs / 1000).toFixed(2)}s\n\n${topTable(rects, totalMs)}\n`;
  fs.writeFileSync(path.join(outdir, `${base}.md`), md);
  console.log(JSON.stringify({ file: f, svg: svgFile, frames: rects.length, totalMs: Math.round(totalMs) }));
}
