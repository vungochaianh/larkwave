/**
 * config.js — env-driven config for tw-cms-keeper.
 * Loads a local .env (no dependency) so `node src/index.js` works the same as
 * a systemd EnvironmentFile.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(file) {
  let txt;
  try {
    txt = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env — rely on the process environment (systemd EnvironmentFile)
  }
  for (const line of txt.split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

function env(key, def) {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}
function envInt(key, def) {
  const v = parseInt(env(key, ''), 10);
  return Number.isFinite(v) ? v : def;
}
function envBool(key, def) {
  const v = env(key, '');
  if (v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Multi-account support (opt-in): set ACCOUNTS to a JSON array to keep SEVERAL Lark
 * accounts alive at once, each in its own browser profile, each pushing its session
 * ONLY to its own jobs. Absent/empty ACCOUNTS → ONE implicit account from the flat
 * env below (identical to the original single-account behavior).
 *
 *   ACCOUNTS=[
 *     {"id":"hoanam","label":"Hoa Nam","larkHost":"https://xxx.larksuite.com",
 *      "profileDir":".profile-hoanam","match":{"domains":["xxx.larksuite.com"]}},
 *     {"id":"kh2","label":"Khách 2","larkHost":"https://yyy.feishu.cn",
 *      "profileDir":".profile-kh2","match":{"appTokens":["bascnXXXX"]}}
 *   ]
 *
 * match (all optional; a job is claimed if ANY matches): { larkAccountId, domains[],
 * appTokens[], jobIds[] }. If an account declares no match, it defaults to its own
 * host's domain. An account with no rule at all (the single implicit account) matches
 * EVERY job — the original behavior.
 */
function resolveProfileDir(dir, fallback) {
  const d = dir || fallback;
  return path.isAbsolute(d) ? d : path.resolve(ROOT, d);
}

/** Per-account QR screenshot file. Single-account keeps the original `qr.png`. */
/** The persisted HTTP token — created once, 0600, so a restart doesn't invalidate the QR link. */
function readOrCreateHttpToken() {
  const file = path.join(ROOT, '.http-token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* not created yet */
  }
  const token = crypto.randomBytes(24).toString('base64url');
  try {
    fs.writeFileSync(file, token + '\n', { mode: 0o600 });
  } catch (e) {
    console.error('[config] could not persist the HTTP token — it will rotate on restart:', e?.message || e);
  }
  return token;
}

export function qrFile(config, id) {
  return path.join(ROOT, config && config.multiAccount ? `qr-${id}.png` : 'qr.png');
}

function parseAccounts(base) {
  const raw = env('ACCOUNTS', '').trim();
  if (!raw) {
    // Single implicit account = the flat env; null match → refreshes ALL jobs (unchanged).
    return [{
      id: env('ACCOUNT_ID', 'default'),
      label: env('ACCOUNT_LABEL', 'Mặc định'),
      larkHost: base.larkHost,
      keepAliveUrl: base.keepAliveUrl,
      profileDir: base.profileDir,
      userAgent: base.userAgent,
      match: null,
    }];
  }
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error('ACCOUNTS phải là JSON array hợp lệ (kiểm tra dấu ngoặc/nháy).');
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('ACCOUNTS rỗng — bỏ hẳn biến này để chạy chế độ 1 tài khoản.');
  }
  return arr.map((a, i) => {
    const host = String(a.larkHost || base.larkHost).replace(/\/+$/, '');
    const id = String(a.id || a.larkAccountId || `acct${i + 1}`);
    let match = a.match || null;
    if (!match && (a.larkAccountId || a.domains || a.appTokens || a.jobIds)) {
      match = { larkAccountId: a.larkAccountId, domains: a.domains, appTokens: a.appTokens, jobIds: a.jobIds };
    }
    if (!match) {
      // Default: this account owns jobs on its own Lark host's domain.
      let dom = '';
      try { dom = new URL(host).host; } catch { /* leave empty */ }
      match = dom ? { domains: [dom] } : null;
    }
    return {
      id,
      label: a.label || id,
      larkHost: host,
      keepAliveUrl: a.keepAliveUrl || `${host}/`,
      profileDir: resolveProfileDir(a.profileDir, `.profile-${id}`),
      userAgent: a.userAgent || base.userAgent,
      match,
    };
  });
}

export function loadConfig() {
  const larkHost = env('LARK_HOST', 'https://lsgav2gopb4m.sg.larksuite.com').replace(/\/+$/, '');
  const base = {
    larkHost,
    keepAliveUrl: env('KEEPALIVE_URL', '') || `${larkHost}/`,
    profileDir: resolveProfileDir(env('PROFILE_DIR', ''), '.profile'),
    userAgent: env('USER_AGENT', DEFAULT_UA),
  };
  const accounts = parseAccounts(base);
  return {
    cmsApiBase: env('CMS_API_BASE', 'https://apihoanam.toolswave.net/api').replace(/\/+$/, ''),
    larkHost,
    keepAliveUrl: base.keepAliveUrl,
    profileDir: base.profileDir,
    userAgent: base.userAgent,
    accounts,
    multiAccount: accounts.length > 1,
    headless: envBool('HEADLESS', true),
    refreshIntervalSec: envInt('REFRESH_INTERVAL_SEC', 1800),
    keepAliveIntervalSec: envInt('KEEPALIVE_INTERVAL_SEC', 600),
    loginTimeoutSec: envInt('LOGIN_TIMEOUT_SEC', 300),
    alertWebhook: env('ALERT_WEBHOOK', ''),
    dryRun: envBool('DRY_RUN', false),
    // Tiny built-in HTTP server: serves /qr (a live self-refreshing QR page for
    // re-login) + /status. publicUrl is what the alert/app link to — set it to the
    // box's reachable address, e.g. http://100.100.164.92:8790
    httpPort: envInt('KEEPER_HTTP_PORT', 8790),
    httpHost: env('KEEPER_HTTP_HOST', '0.0.0.0'),
    // Access token for the built-in HTTP server. It binds 0.0.0.0 so the owner can open the QR
    // page from their phone — which also means anyone on the LAN/tailnet could reach it, and /qr
    // serves a LIVE Lark login QR: scanning it logs the scanner in AS the account. So every route
    // requires `?k=<token>`. Set KEEPER_HTTP_TOKEN to pin it; otherwise one is generated on first
    // run and persisted next to the QR files, so restarts keep existing links working.
    httpToken: env('KEEPER_HTTP_TOKEN', '') || readOrCreateHttpToken(),
    publicUrl:
      (env('KEEPER_PUBLIC_URL', '') || '').replace(/\/+$/, '') ||
      `http://localhost:${envInt('KEEPER_HTTP_PORT', 8790)}`,
  };
}
