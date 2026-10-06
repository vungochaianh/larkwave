/**
 * httpServer.js — a tiny built-in HTTP server for the keeper.
 *
 * Single-account (unchanged URLs):
 *   GET /status  → JSON keeper state (loggedIn, lastRefresh, reloginUrl, …)
 *   GET /qr.png  → the current login-QR screenshot (when re-login is needed)
 *   GET /qr, /   → a self-refreshing page showing the LIVE QR (or "đã đăng nhập")
 *
 * Multi-account (ACCOUNTS set) adds per-account routes:
 *   GET /status        → { accounts: [state, …] }
 *   GET /status/<id>   → that account's state object
 *   GET /qr.png?acct=<id> (or /qr/<id>/qr.png) → that account's QR screenshot
 *   GET /qr/<id>       → that account's live-QR page
 *   GET /qr, /         → an index listing every account + a link to each QR page
 *
 * This is what the session-expiry alert links to: the user opens it, scans the
 * live auto-refreshing QR, and the box logs back in — no SSH/VNC, no stale code.
 */
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { qrFile } from './config.js';

/** Length-safe constant-time string compare (timingSafeEqual throws on a length mismatch). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/** Append the access token to a same-server URL the page will fetch. */
function withKey(url, key) {
  if (!key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(key)}`;
}

/** Live-QR page for one account, bound to its own /status + /qr.png endpoints. */
function qrPage(statusUrl, qrPngUrl, label) {
  const heading = label ? `📲 Đăng nhập lại Lark — ${label}` : '📲 Quét để đăng nhập lại Lark';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đăng nhập Lark cho VM</title><style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6f8;color:#1c1f26;display:flex;justify-content:center;padding:28px 16px}
@media(prefers-color-scheme:dark){body{background:#0e1014;color:#eceef3}.card{background:#171a21;border-color:#262a33}}
.wrap{width:100%;max-width:440px;display:flex;flex-direction:column;gap:16px}
.card{background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:22px}
h1{font-size:18px;margin:0 0 6px}
p{margin:6px 0;color:#7a8090;font-size:14px;line-height:1.5}
.qr{width:300px;height:300px;margin:14px auto;border:1px solid #e6e8ee;border-radius:12px;background-color:#fff;background-repeat:no-repeat;background-size:1920px 1290px;background-position:-420px -500px;image-rendering:pixelated}
.ok{text-align:center}.big{font-size:44px}
.hint{text-align:center;font-size:12px;color:#9aa1b1}
</style></head><body><div class="wrap">
<div class="card" id="box">
 <h1>${heading}</h1>
 <p>Mở <b>app Lark trên điện thoại</b> → quét mã dưới đây → Xác nhận. Mã tự làm mới, quét lúc nào cũng được.</p>
 <div class="qr" id="qr"></div>
 <p class="hint" id="hint">Đang tải mã…</p>
</div></div>
<script>
var STATUS=${JSON.stringify(statusUrl)},QRPNG=${JSON.stringify(qrPngUrl)};
async function tick(){
 try{
  const s=await (await fetch(STATUS,{cache:'no-store'})).json();
  if(s.loggedIn){document.getElementById('box').innerHTML='<div class="ok"><div class="big">✅</div><h1>Đã đăng nhập</h1><p>VM keeper đang giữ phiên đồng bộ 24/7. Có thể đóng trang này.</p></div>';return;}
  document.getElementById('qr').style.backgroundImage="url('"+QRPNG+(QRPNG.indexOf('?')<0?'?':'&')+"t="+Date.now()+"')";
  document.getElementById('hint').textContent='Mã tự làm mới · cập nhật '+new Date().toLocaleTimeString('vi-VN');
 }catch(e){document.getElementById('hint').textContent='Mất kết nối tới VM keeper…';}
 setTimeout(tick,3000);
}
tick();
</script></body></html>`;
}

/** Index page (multi-account) — every account + a link to its QR/login page. */
function indexPage(states, key) {
  const rows = states
    .map((s) => {
      const badge = s.loggedIn ? '✅ Đã đăng nhập' : '⚠️ Cần đăng nhập lại';
      const color = s.loggedIn ? '#16B98D' : '#F59E0B';
      const link = s.loggedIn
        ? ''
        : ` — <a href="${withKey(`/qr/${encodeURIComponent(s.id)}`, key)}">Quét QR đăng nhập</a>`;
      return `<div class="row"><b>${s.label || s.id}</b> <span style="color:${color}">${badge}</span>${link}<div class="sub">${s.host || ''}</div></div>`;
    })
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VM keeper — tài khoản Lark</title><style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6f8;color:#1c1f26;display:flex;justify-content:center;padding:28px 16px}
@media(prefers-color-scheme:dark){body{background:#0e1014;color:#eceef3}.card{background:#171a21;border-color:#262a33}}
.wrap{width:100%;max-width:520px}.card{background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:22px}
h1{font-size:18px;margin:0 0 12px}.row{padding:10px 0;border-top:1px solid #e6e8ee}.row:first-of-type{border-top:none}
.sub{color:#9aa1b1;font-size:12px;margin-top:2px}a{color:#6C5CE7}
</style></head><body><div class="wrap"><div class="card">
<h1>📲 VM keeper — ${states.length} tài khoản Lark</h1>${rows}
</div></div><script>setTimeout(function(){location.reload()},5000)</script></body></html>`;
}

export function startHttpServer(config, getStates) {
  const server = createServer((req, res) => {
    const full = req.url || '/';
    const [pathname, qs = ''] = full.split('?');
    // AUTH — this server binds 0.0.0.0 (so the owner can scan from their phone), and /qr serves a
    // LIVE Lark login QR: anyone on the LAN or the tailnet who opened it could log in AS the
    // account. Every route therefore needs `?k=<token>`; the alert links already carry it.
    // Compared in constant time so the token can't be recovered by timing the 401s.
    const key = new URLSearchParams(qs).get('k') || '';
    if (config.httpToken && !safeEqual(key, config.httpToken)) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('Thiếu hoặc sai mã truy cập. Hãy mở đúng đường dẫn trong cảnh báo (có ?k=…).');
      return;
    }
    const states = getStates();
    const byId = (id) => states.find((s) => s.id === id);
    const acctParam = new URLSearchParams(qs).get('acct');

    const sendJson = (obj) => {
      // No `access-control-allow-origin: *` — the state is token-gated now, and a wildcard would
      // let any page the owner visits read it back with the token from a leaked link.
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    const sendHtml = (html) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    };
    const sendPng = (id) => {
      try {
        const b = fs.readFileSync(qrFile(config, id));
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        res.end(b);
      } catch {
        res.writeHead(404);
        res.end('no qr');
      }
    };

    // /status/<id> → one account
    const mStatusId = /^\/status\/(.+)$/.exec(pathname);
    if (mStatusId) {
      const s = byId(decodeURIComponent(mStatusId[1]));
      if (s) return sendJson(s);
      res.writeHead(404); res.end('no account'); return;
    }
    if (pathname === '/status') {
      // Single account → the bare state object (unchanged); multi → { accounts }.
      return sendJson(states.length === 1 ? states[0] : { accounts: states });
    }

    // /qr/<id>/qr.png and /qr/<id>
    const mQrIdPng = /^\/qr\/([^/]+)\/qr\.png$/.exec(pathname);
    if (mQrIdPng) return sendPng(decodeURIComponent(mQrIdPng[1]));
    const mQrId = /^\/qr\/([^/]+)$/.exec(pathname);
    if (mQrId) {
      const id = decodeURIComponent(mQrId[1]);
      const s = byId(id);
      if (!s) { res.writeHead(404); res.end('no account'); return; }
      return sendHtml(
        qrPage(
          withKey(`/status/${encodeURIComponent(id)}`, config.httpToken),
          withKey(`/qr.png?acct=${encodeURIComponent(id)}`, config.httpToken),
          s.label,
        ),
      );
    }

    if (pathname === '/qr.png') {
      return sendPng(acctParam || (states[0] && states[0].id));
    }
    if (pathname === '/qr' || pathname === '/') {
      // Single account → the direct QR page (unchanged); multi → the account index.
      if (states.length === 1)
        return sendHtml(qrPage(withKey('/status', config.httpToken), withKey('/qr.png', config.httpToken), null));
      return sendHtml(indexPage(states, config.httpToken));
    }

    res.writeHead(404);
    res.end('not found');
  });
  server.on('error', (e) => console.error('[http] error:', e?.message || e));
  server.listen(config.httpPort, config.httpHost);
  return server;
}
