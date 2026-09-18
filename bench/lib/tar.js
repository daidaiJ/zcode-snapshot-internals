// ustar tar entry writer — 重建件（reconstruction），非 ZCode 代码。
// 对应 readable-2.0 的 writeTarEntry（bundle 内未摘录），按 POSIX ustar 512B 头实现。
'use strict';
const { once } = require('node:events');
const { createReadStream } = require('node:fs');

function splitTarName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  for (let i = name.length - 101; i >= 0; i--) {
    if (name[i] === '/' && name.length - i - 1 <= 100 && i <= 155) {
      return { prefix: name.slice(0, i), name: name.slice(i + 1) };
    }
  }
  throw new Error('tar path too long: ' + name);
}

function octal(n, len) {
  return n.toString(8).padStart(len - 1, '0') + '\0';
}

function ustarHeader(filePath, size) {
  const { name, prefix } = splitTarName(filePath);
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100, 'utf8'); // mode
  h.write('0000000\0', 108, 'utf8'); // uid
  h.write('0000000\0', 116, 'utf8'); // gid
  h.write(octal(size, 12), 124, 'utf8'); // size
  h.write(octal(0, 12), 136, 'utf8'); // mtime = 0（稳定构建）
  h.write('        ', 148, 'utf8'); // checksum 占位（空格）
  h.write('0', 156, 'utf8'); // typeflag: regular file
  h.write('ustar\0', 257, 'utf8');
  h.write('00', 263, 'utf8');
  if (prefix) h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8');
  return h;
}

// 把一个条目写进 gzip Transform：meta 缓冲条目直接写；文件条目流式读盘。
// 与原文一致：逐条目 await（背压感知），这是扫描/打包串行性的热点之一。
async function writeTarEntry(gzip, entry) {
  gzip.write(ustarHeader(entry.path, entry.sizeBytes));
  if (entry.content) {
    if (!gzip.write(entry.content)) await once(gzip, 'drain');
  } else {
    for await (const chunk of createReadStream(entry.absolutePath)) {
      if (!gzip.write(chunk)) await once(gzip, 'drain');
    }
  }
  const pad = (512 - (entry.sizeBytes % 512)) % 512;
  if (pad) {
    if (!gzip.write(Buffer.alloc(pad))) await once(gzip, 'drain');
  }
}

module.exports = { ustarHeader, writeTarEntry };
