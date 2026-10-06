#!/usr/bin/env node
/**
 * tw-cms-keeper — CLI entry.
 *
 * Commands (append an <accountId> when ACCOUNTS holds more than one Lark account):
 *   accounts       List the configured Lark accounts (from ACCOUNTS / flat env).
 *   login  [id]    Open a browser to sign into Lark (needs a display / VNC).
 *   login-qr [id]  Headless: capture a live QR to qr[-<id>].png for scanning.
 *   seed-cookies [id] "c=v; …"   Inject an existing cookie string (no display).
 *   seed-from-backend [id]       Pull the session the desktop last pushed.
 *   run            Run the keeper (all accounts) in the foreground (systemd/pm2 mode).
 *   once   [id]    Run one push cycle for an account then exit (setup smoke-test).
 *   jobs           List the connector jobs on the CMS backend (+ which account owns each).
 */
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, ROOT, qrFile } from './config.js';
import { LarkSession } from './session.js';
import { runKeeper } from './keeper.js';
import { listJobs, refreshAll, fetchStoredSession, jobMatchesAccount } from './cms.js';

const config = loadConfig();
const cmd = (process.argv[2] || 'run').toLowerCase();

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(...a) {
  console.log(`[${ts()}]`, ...a);
}

/** Resolve which account a command targets (arg id, or the sole account). */
function pickAccount(idArg) {
  const accts = config.accounts;
  if (idArg) {
    const a = accts.find((x) => x.id === idArg);
    if (!a) {
      log(`Không thấy tài khoản id="${idArg}". Có: ${accts.map((x) => x.id).join(', ')}`);
      process.exit(1);
    }
    return a;
  }
  if (accts.length > 1) {
    log(`Nhiều tài khoản — cần chỉ định id: node src/index.js ${cmd} <id>  (có: ${accts.map((x) => x.id).join(', ')})`);
    process.exit(1);
  }
  return accts[0];
}
/** A LarkSession config bound to one account's host/profile/UA. */
function sessionCfgFor(a) {
  return { ...config, larkHost: a.larkHost, keepAliveUrl: a.keepAliveUrl, profileDir: a.profileDir, userAgent: a.userAgent };
}

function accounts() {
  log(`${config.accounts.length} tài khoản · backend ${config.cmsApiBase}`);
  for (const a of config.accounts) {
    const m = a.match ? JSON.stringify(a.match) : 'tất cả job (mặc định)';
    log(` - ${a.id} · ${a.label} · ${a.larkHost} · profile=${a.profileDir} · match=${m}`);
  }
  process.exit(0);
}

async function login() {
  const a = pickAccount(process.argv[3]);
  const s = new LarkSession(sessionCfgFor(a));
  await s.launch({ headless: false });
  log(`Mở cửa sổ Lark [${a.label}] — đăng nhập bằng QR hoặc email/mật khẩu…`);
  await s.gotoLogin();
  const deadline = Date.now() + config.loginTimeoutSec * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await s.isLoggedIn()) {
      ok = true;
      break;
    }
  }
  if (ok) {
    await s.keepAlive(); // capture host headers/csrf once
    log(`✅ Đăng nhập thành công [${a.label}]. Session đã lưu tại`, a.profileDir);
  } else {
    log('⚠️ Hết thời gian chờ — chưa đăng nhập. Chạy lại `login`.');
  }
  await s.close();
  process.exit(ok ? 0 : 1);
}

async function seedCookies() {
  const a = pickAccount(process.argv[3]);
  // Cookie string is the args after the (optional) id; also accept SEED_COOKIES.
  const rest = process.argv.slice(3).filter((x) => x !== a.id);
  const cookieStr = (rest.join(' ').trim() || process.env.SEED_COOKIES || '').trim();
  if (!cookieStr.includes('=')) {
    log('Dùng: node src/index.js seed-cookies [id] "cookie1=val; cookie2=val"');
    process.exit(1);
  }
  const s = new LarkSession(sessionCfgFor(a));
  await s.launch({ headless: config.headless });
  const n = await s.seedCookies(cookieStr);
  log(`[${a.label}] đã nạp ${n} cookie, đang kiểm tra…`);
  await s.keepAlive();
  const ok = await s.isLoggedIn();
  log(ok ? '✅ Cookies hợp lệ — session đã lưu.' : '⚠️ Cookies không hợp lệ (vẫn ở trang login).');
  await s.close();
  process.exit(ok ? 0 : 1);
}

async function loginQr() {
  const a = pickAccount(process.argv[3]);
  const shot = qrFile(config, a.id);
  const result = path.resolve(ROOT, config.multiAccount ? `login-result-${a.id}.json` : 'login-result.json');
  try { fs.rmSync(result, { force: true }); } catch { /* ignore */ }
  const s = new LarkSession(sessionCfgFor(a));
  await s.launch({ headless: config.headless });
  const shown = await s.openQrLogin();
  await s.refreshQrIfStale();
  await s.screenshotTo(shot);
  log(
    shown
      ? `[${a.label}] QR đã lưu: ${shot} — quét bằng app Lark trên điện thoại (đúng tài khoản này).`
      : `⚠️ [${a.label}] Chưa mở được panel QR (vẫn chụp trang hiện tại): ${shot}`,
  );
  const deadline = Date.now() + config.loginTimeoutSec * 1000;
  let ok = false;
  let i = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    if (await s.isLoggedIn()) {
      ok = true;
      break;
    }
    const refreshed = await s.refreshQrIfStale();
    if (refreshed || ++i % 4 === 0) await s.screenshotTo(shot);
  }
  let pushed = null;
  if (ok) {
    log(`✅ [${a.label}] Đăng nhập thành công — session đã lưu vào profile.`);
    const sess = await s.getConnectorSession();
    if (sess?.cookies && !config.dryRun) {
      try {
        pushed = await refreshAll(config.cmsApiBase, sess, a.match);
        log(`[${a.label}] đẩy session ngay: refreshed ${pushed.refreshed}/${pushed.total} · revived ${pushed.reenabled} · failed ${pushed.failed}`);
      } catch (e) {
        log('đẩy session lỗi: ' + (e?.message || e));
      }
    }
  } else {
    log('⚠️ Hết thời gian chờ — chưa quét/đăng nhập. Chạy lại `login-qr`.');
  }
  try { fs.writeFileSync(result, JSON.stringify({ ok, pushed, at: new Date().toISOString() })); } catch { /* ignore */ }
  await s.close();
  process.exit(ok ? 0 : 1);
}

async function seedFromBackend() {
  const a = pickAccount(process.argv[3]);
  const stored = await fetchStoredSession(config.cmsApiBase);
  if (!stored || !stored.cookies) {
    log('Không tìm thấy session đã lưu trên backend (chưa job nào có cookies). Hãy mở app desktop 1 lần để nó đẩy session, rồi chạy lại.');
    process.exit(1);
  }
  const host = stored.domain ? `https://${stored.domain}` : a.larkHost;
  log(`[${a.label}] lấy session từ backend: host=${stored.domain || '?'} · ${stored.cookies.split('; ').length} cookie`);
  const s = new LarkSession({ ...sessionCfgFor(a), larkHost: host, keepAliveUrl: `${host}/` });
  await s.launch({ headless: config.headless });
  const n = await s.seedCookies(stored.cookies);
  log(`nạp ${n} cookie, kiểm tra…`);
  await s.keepAlive();
  const ok = await s.isLoggedIn();
  if (ok) {
    log('✅ Session hợp lệ — đã lưu vào profile.');
    if (host !== a.larkHost) log(`⚠️ Đặt larkHost=${host} cho tài khoản "${a.id}" cho khớp trước khi chạy \`run\`.`);
  } else {
    log('⚠️ Session không hợp lệ (có thể đã hết hạn trên backend). Dùng `login` hoặc `seed-cookies` với cookie tươi.');
  }
  await s.close();
  process.exit(ok ? 0 : 1);
}

async function once() {
  const a = pickAccount(process.argv[3]);
  const s = new LarkSession(sessionCfgFor(a));
  await s.launch({ headless: config.headless });
  await s.keepAlive();
  if (!(await s.isLoggedIn())) {
    log(`⚠️ [${a.label}] Session chưa đăng nhập. Chạy \`login\` (hoặc \`seed-cookies\`) trước.`);
    await s.close();
    process.exit(1);
  }
  const sess = await s.getConnectorSession();
  log(
    `[${a.label}] session: ${sess?.cookies ? sess.cookies.split('; ').length + ' cookie' : '∅'} · csrf=${sess?.csrfToken ? 'có' : 'KHÔNG'} · host=${sess?.domain}`,
  );
  if (config.dryRun) {
    log('DRY_RUN — không đẩy lên backend.');
    await s.close();
    process.exit(0);
  }
  const res = await refreshAll(config.cmsApiBase, sess, a.match);
  log(`[${a.label}] kết quả: refreshed ${res.refreshed}/${res.total} · revived ${res.reenabled} · failed ${res.failed}`);
  for (const e of res.errors) log('  · lỗi:', e);
  await s.close();
  process.exit(0);
}

async function jobs() {
  const list = await listJobs(config.cmsApiBase);
  const conn = list.filter((j) => j.syncMode === 'connector');
  log(`tổng ${list.length} job · ${conn.length} connector · backend ${config.cmsApiBase}`);
  for (const j of conn) {
    const state = j.enabled === false ? '⛔ tắt' : '✅ bật';
    const status = j.lastStatus || j.lastSyncStatus || '?';
    const err = j.lastError ? ' · ' + String(j.lastError).slice(0, 70) : '';
    // Which configured account claims this job (multi-account only).
    let owner = '';
    if (config.multiAccount) {
      const a = config.accounts.find((acc) => jobMatchesAccount(j, acc.match));
      owner = ` · 👤 ${a ? a.label : 'CHƯA GÁN'}`;
    }
    log(` - ${state} · ${j.name} (${j._id || j.id}) · ${status}${owner}${err}`);
  }
  process.exit(0);
}

const handlers = {
  accounts,
  login,
  'login-qr': loginQr,
  'seed-cookies': seedCookies,
  'seed-from-backend': seedFromBackend,
  once,
  jobs,
  run: () => runKeeper(config, log),
};

if (!handlers[cmd]) {
  console.log(
    [
      'tw-cms-keeper — giữ phiên Lark web cho CMS Bitable sync (chạy 24/7 trên VM).',
      '',
      'Lệnh (thêm <id> tài khoản khi ACCOUNTS có nhiều tài khoản):',
      '  accounts           Liệt kê các tài khoản Lark đã cấu hình',
      '  seed-from-backend  Tự lấy session desktop đã đẩy lên CMS (TIỆN NHẤT — 1 lệnh, khỏi login)',
      '  login [id]         Mở trình duyệt để đăng nhập Lark (cần màn hình/VNC)',
      '  login-qr [id]      Chụp QR trực tiếp (không cần màn hình) để quét đăng nhập',
      '  seed-cookies [id]  Nạp cookie string sẵn có (không cần đăng nhập lại)',
      '  run                Chạy nền: keep-alive + đẩy session định kỳ cho MỌI tài khoản (mode chính)',
      '  once [id]          Chạy 1 lần cho 1 tài khoản rồi thoát (kiểm thử cấu hình)',
      '  jobs               Liệt kê job connector trên CMS (+ tài khoản nào phụ trách)',
      '',
      `backend  = ${config.cmsApiBase}`,
      `accounts = ${config.accounts.map((a) => a.id).join(', ')}${config.multiAccount ? '' : ' (1 tài khoản)'}`,
    ].join('\n'),
  );
  process.exit(1);
}

handlers[cmd]();
