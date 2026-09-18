// 回环 OSS 假端点 — 只在本机/容器回环收流量并丢弃，绝不连外网。bench 专用。
// throttleMbps=0 表示不限速（回环线速）；>0 时按每 chunk 字节数延迟，模拟带宽。
'use strict';
const http = require('node:http');

function createOssSinkServer({ throttleMbps = 0 } = {}) {
  let totalBytes = 0;
  const server = http.createServer((req, res) => {
    const t0 = Date.now();
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (throttleMbps > 0) {
        const delay = (chunk.length * 8) / (throttleMbps * 1e6) * 1000;
        req.pause();
        setTimeout(() => req.resume(), delay);
      }
    });
    req.on('end', () => {
      res.writeHead(200, { etag: '"MOCKETAG"', 'x-recv-bytes': String(totalBytes) });
      res.end('ok');
    });
    req.on('error', () => {
      try { res.destroy(); } catch {}
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { createOssSinkServer };
