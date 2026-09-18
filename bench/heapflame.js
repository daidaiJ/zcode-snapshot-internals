// .heapprofile（--heap-prof 采样分配）→ 分配火焰图 SVG + 热点 markdown 表。bench 专用。
// 用法：node heapflame.js <a.heapprofile> --outdir assets/flame --basename name --title "..."
// 与 flame.js 的区别：宽度 ∝ 采样到的分配字节（不是 CPU 时间）；表按 self 分配字节排序。
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { i++; continue; }
  files.push(argv[i]);
}
const getOpt = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
const outdir = getOpt('outdir', 'flame-out');
const base = getOpt('basename', 'heap');
const TITLE = getOpt('title', base);

// .heapprofile 是一棵 { callFrame, selfSize, children } 树，直接聚合。
function parseHeapProfile(file) {
  const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nodes = new Map();
  const children = new Map();
  const self = new Map();
  let idSeq = 1;
  const walk = (n) => {
    const id = idSeq++;
    nodes.set(id, n);
    self.set(id, n.selfSize ?? 0);
    const kids = (n.children ?? []).map(walk);
    children.set(id, kids);
    return id;
  };
  const rootId = walk(prof.head);
  const totalCache = new Map();
  const total = (id) => {
    if (totalCache.has(id)) return totalCache.get(id);
    let t = self.get(id) ?? 0;
    for (const c of children.get(id) ?? []) t += total(c);
    totalCache.set(id, t);
    return t;
  };
  return { nodes, children, self, total, rootId };
}

function frameLabel(node) {
  const cf = node.callFrame;
  const fn = cf.functionName || '(anonymous)';
  let loc = (cf.url || '').replace(/^node:/, '');
  if (loc.includes('/')) loc = loc.split('/').pop();
  return { fn, loc, line: (cf.lineNumber ?? -1) + 1 };
}

function categorize(loc, fn) {
  if (loc === '' && /^(gzip|deflate|crc|sha|aes|rsa|crypto|random)/i.test(fn)) return 'native-crypto';
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

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const mb = (b) => (b / 1048576).toFixed(1);

function renderSvg(p, titleText, outFile) {
  const W = 1400, ROW = 17, PAD = 2, FONT = 10.5;
  const totalBytes = p.total(p.rootId);
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
  const layout = (id, x0, width, depth) => {
    if (width < 0.4 || depth > 46 || rects.length > 20000) return;
    const t = p.total(id);
    if (t <= 0) return;
    const { fn, loc, line } = frameLabel(p.nodes.get(id));
    const cat = categorize(loc, fn);
    const y = H - 45 - (depth + 1) * ROW;
    rects.push({ x: x0, y, w: width, cat, fn, loc, line, totalB: t, selfB: p.self.get(id) ?? 0 });
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
  svg += `<text x="10" y="22" font-size="15" font-weight="bold" fill="#222">${esc(titleText)} — 采样分配 ${mb(totalBytes)}MB</text>\n`;
  svg += `<text x="10" y="40" font-size="${FONT}" fill="#555">frames: ${rects.length} · width ∝ total 分配字节 · 根在底部 · 颜色: 红=native crypto 紫=native streams 橙=node 内建 绿=bench 重建件</text>\n`;
  for (const r of rects) {
    svg += `<rect x="${r.x.toFixed(1)}" y="${r.y}" width="${Math.max(r.w, 0.4).toFixed(1)}" height="${ROW - PAD}" fill="${CAT_COLOR[r.cat]}" rx="1" opacity="0.92"><title>${esc(`${r.fn}  ${r.loc}:${r.line}\ntotal ${mb(r.totalB)}MB  self ${mb(r.selfB)}MB`)}</title></rect>\n`;
    if (r.w > 34) {
      const maxChars = Math.floor((r.w - 4) / (FONT * 0.62));
      const label = (r.fn + ' ' + (r.loc ? r.loc + ':' + r.line : '')).slice(0, maxChars);
      svg += `<text x="${(r.x + 2).toFixed(1)}" y="${r.y + ROW - 5}" font-size="${FONT}" fill="#111">${esc(label)}</text>\n`;
    }
  }
  svg += `</svg>\n`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, svg);
  return { rects, totalBytes };
}

function topTable(rects, totalBytes) {
  const bySelf = [...rects].sort((a, b) => b.selfB - a.selfB).slice(0, 22);
  const lines = ['| # | 函数 | 位置 | self MB | self % | total MB |', '|--:|---|---|--:|--:|--:|'];
  bySelf.forEach((r, i) => {
    lines.push(`| ${i + 1} | \`${r.fn}\` | ${r.loc || '-'}:${r.line} | ${mb(r.selfB)} | ${(r.selfB / totalBytes * 100).toFixed(1)} | ${mb(r.totalB)} |`);
  });
  const cat = {};
  for (const r of rects) cat[r.cat] = (cat[r.cat] ?? 0) + r.selfB;
  lines.push('', '| 类别 | self MB | 占比 |', '|---|--:|--:|');
  for (const [k, v] of Object.entries(cat).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${mb(v)} | ${(v / totalBytes * 100).toFixed(1)}% |`);
  }
  return lines.join('\n');
}

for (const f of files) {
  const p = parseHeapProfile(f);
  const svgFile = path.join(outdir, `${base}.svg`);
  const { rects, totalBytes } = renderSvg(p, TITLE, svgFile);
  const md = `# ${TITLE}\n\nprofile: \`${f}\` · 采样分配 ${mb(totalBytes)}MB\n\n${topTable(rects, totalBytes)}\n`;
  fs.writeFileSync(path.join(outdir, `${base}.md`), md);
  console.log(JSON.stringify({ file: f, svg: svgFile, frames: rects.length, sampledBytes: Math.round(totalBytes) }));
}
