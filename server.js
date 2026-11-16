#!/usr/bin/env node
/* خادم اختياري بلا أي اعتماديات: يقدّم الملفات ويربط شاشة التلفاز بجوالات التحكم عبر الشبكة المنزلية.
   التشغيل:  node server.js  [PORT]                                                                  */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

let lastState = null;
const clients = { host: new Set(), view: new Set() };

function lanUrls() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(n => {
    if (n.family === 'IPv4' && !n.internal) out.push('http://' + n.address + ':' + PORT + '/');
  }));
  return out;
}
function send(set, data) { const msg = 'data: ' + data + '\n\n'; set.forEach(res => res.write(msg)); }
function readBody(req, cb) {
  let body = '', size = 0;
  req.on('data', c => { size += c.length; if (size > 2e6) req.destroy(); else body += c; });
  req.on('end', () => { try { JSON.parse(body); cb(body); } catch (e) { cb(null); } });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, urls: lanUrls() }));
  }
  if (p === '/api/events') {
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'view';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1500\n\n');
    clients[role].add(res);
    if (role === 'view' && lastState) res.write('data: ' + lastState + '\n\n');
    if (role === 'view') send(clients.host, JSON.stringify({ type: 'HELLO' }));
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients[role].delete(res); });
    return;
  }
  if (p === '/api/state' && req.method === 'POST') {
    return readBody(req, body => { if (body) { lastState = body; send(clients.view, body); } res.writeHead(body ? 204 : 400); res.end(); });
  }
  if (p === '/api/action' && req.method === 'POST') {
    return readBody(req, body => { if (body) send(clients.host, body); res.writeHead(body ? 204 : 400); res.end(); });
  }
  // ملفات ثابتة
  let file = path.normalize(path.join(ROOT, decodeURIComponent(p === '/' ? '/index.html' : p)));
  if (!file.startsWith(ROOT + path.sep) || /(^|[\\/])\./.test(path.relative(ROOT, file))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('\n  🏆 بطولة العائلة تعمل الآن\n');
  console.log('  شاشة المقدّم (على هذا الجهاز):  http://localhost:' + PORT + '/');
  lanUrls().forEach(u => {
    console.log('  شاشة التلفاز:                    ' + u + '?view=tv');
    console.log('  جوال التحكم:                     ' + u + '?view=remote');
  });
  console.log('');
});
