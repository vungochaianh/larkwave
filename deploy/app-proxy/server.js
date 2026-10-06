#!/usr/bin/env node
// Toolswave generated-app reverse proxy.
// Serves `<slug>.toolswave.net` by streaming `<slug>.pages.dev` (the Cloudflare
// Pages deployment). The hostname's DNS points at our OWN tunnel (not pages.dev),
// so there is no cross-account CNAME (Cloudflare error 1014); single-level
// `<slug>.toolswave.net` is also covered by the free Universal SSL `*.toolswave.net`.
'use strict';
const http = require('node:http');
const https = require('node:https');

const PORT = Number(process.env.PORT || 8095);
const BASE = (process.env.APP_BASE_DOMAIN || 'toolswave.net').toLowerCase();
const SLUG_RE = new RegExp('^([a-z0-9][a-z0-9-]*)\\.' + BASE.replace(/\./g, '\\.') + '$', 'i');
// platform/infra subdomains that must never be proxied to pages.dev
const RESERVED = new Set(
  (process.env.RESERVED_SUBDOMAINS || 'app,aapp,apia,www,cms,api,admin,mail,root,ns1,ns2,a')
    .split(',')
    .map((s) => s.trim().toLowerCase()),
);

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  const m = host.match(SLUG_RE);
  if (!m || RESERVED.has(m[1])) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Toolswave: không tìm thấy app cho tên miền này.');
  }
  const target = `${m[1]}.pages.dev`;
  const headers = { ...req.headers, host: target };
  delete headers['x-forwarded-host'];

  const upstream = https.request(
    {
      hostname: target,
      port: 443,
      path: req.url,
      method: req.method,
      headers,
      servername: target, // SNI
      timeout: 25000,
    },
    (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Toolswave: lỗi proxy tới Pages.');
  });
  req.pipe(upstream);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tw-app-proxy on 127.0.0.1:${PORT} for *.${BASE} -> *.pages.dev`);
});
