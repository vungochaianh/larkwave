/**
 * keeper.js — the long-running loop.
 *
 * Holds Lark web session(s) alive and, on a schedule, pushes a fresh connector
 * session into every CMS connector job (+ revives any the backend auto-disabled
 * on session expiry). Removes the desktop/Mac dependency: the Bitable sync keeps
 * running on the apihoanam scheduler; this only feeds it a live session.
 *
 * MULTI-ACCOUNT: config.accounts holds one entry per Lark account (opt-in via the
 * ACCOUNTS env — see config.js). Each account runs an independent worker with its
 * own browser profile, its own QR re-login page, its own heartbeat, and pushes its
 * session ONLY to the jobs that match its rule (jobMatchesAccount). With no ACCOUNTS
 * set there is exactly ONE implicit account whose match is null → it refreshes every
 * job, identical to the original single-account behavior.
 *
 * When a session expires the worker switches to RE-LOGIN mode: it opens the Lark QR
 * login, keeps a live (auto-refreshing) QR at http://<box>/qr[/<id>], and alerts with
 * that link so the user can re-login by scanning — no SSH/VNC. It reports a per-account
 * heartbeat to the backend so the desktop app can show VM status.
 */
import { LarkSession } from './session.js';
import { refreshAll, postHeartbeat } from './cms.js';
import { startHttpServer } from './httpServer.js';
import { qrFile } from './config.js';

async function alert(config, text) {
  if (!config.alertWebhook) return;
  try {
    await fetch(config.alertWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: `[tw-cms-keeper] ${text}` } }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * One independent keeper worker for a single Lark account. Encapsulates the exact
 * per-account lifecycle (keep-alive → refresh, or QR re-login on expiry). Returns
 * handles the top-level runKeeper uses to expose state + start/stop.
 */
function createWorker(config, account, log) {
  const session = new LarkSession({
    ...config,
    larkHost: account.larkHost,
    keepAliveUrl: account.keepAliveUrl,
    profileDir: account.profileDir,
    userAgent: account.userAgent,
  });
  const QR_PATH = qrFile(config, account.id);
  // The public re-login link: single-account keeps /qr; multi-account is /qr/<id>.
  // The QR page is token-gated (see httpServer.js) — the alert is the ONLY place the owner gets a
  // working link, so it must carry `?k=`. Anyone who receives this alert can log the account in.
  const qrBase = config.multiAccount ? `${config.publicUrl}/qr/${account.id}` : `${config.publicUrl}/qr`;
  const qrUrl = config.httpToken ? `${qrBase}?k=${encodeURIComponent(config.httpToken)}` : qrBase;
  // A short prefix so multi-account logs/alerts say which account they're about.
  const tag = config.multiAccount ? `[${account.label}] ` : '';

  const state = {
    id: account.id,
    label: account.label,
    host: account.larkHost,
    state: 'starting',
    loggedIn: false,
    lastRefresh: null,
    reloginUrl: null,
    note: '',
    at: new Date().toISOString(),
  };

  let stopped = false;
  let running = false;
  let qrMode = false;
  let notLoggedStreak = 0;
  let alerted = false;
  let lastRefreshAt = 0;
  let timer = null;

  const heartbeat = async () => {
    await postHeartbeat(config.cmsApiBase, {
      accountId: account.id,
      label: account.label,
      host: account.larkHost,
      headless: config.headless,
      state: state.state,
      loggedIn: state.loggedIn,
      lastRefresh: state.lastRefresh,
      reloginUrl: state.reloginUrl,
      note: state.note,
      at: state.at,
    });
  };

  const schedule = () => {
    if (stopped) return;
    // Poll fast while a QR is up (keep it live), slow while healthy.
    const delay = state.loggedIn ? Math.max(60, config.keepAliveIntervalSec) * 1000 : 5000;
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      // Fresh navigation only when healthy; in QR mode we must STAY on the login
      // page (navigating away would drop the QR panel).
      if (!qrMode) await session.keepAlive();
      const logged = await session.isLoggedIn();

      if (logged) {
        if (qrMode || notLoggedStreak > 0 || alerted) log(`${tag}✅ Lark session đã đăng nhập trở lại.`);
        qrMode = false;
        notLoggedStreak = 0;
        alerted = false;
        state.reloginUrl = null;
        state.loggedIn = true;
        state.note = '';

        // Refresh the pushed session when due — ONLY this account's jobs (account.match).
        const now = Date.now();
        if (now - lastRefreshAt >= Math.max(60, config.refreshIntervalSec) * 1000) {
          const sess = await session.getConnectorSession();
          if (sess && sess.cookies) {
            if (config.dryRun) {
              state.note = 'DRY_RUN';
            } else {
              const res = await refreshAll(config.cmsApiBase, sess, account.match);
              state.lastRefresh = res;
              lastRefreshAt = now;
              log(
                `${tag}đẩy session: refreshed ${res.refreshed}/${res.total} · revived ${res.reenabled} · failed ${res.failed}` +
                  (res.errors.length ? ` · ${res.errors.slice(0, 3).join(' | ')}` : ''),
              );
            }
          }
        }
        state.state = 'ok';
      } else {
        // Logged out → show a live QR for re-login.
        notLoggedStreak += 1;
        if (!qrMode) {
          qrMode = true;
          await session.openQrLogin();
        } else {
          await session.refreshQrIfStale();
        }
        await session.screenshotTo(QR_PATH);
        state.loggedIn = false;
        state.state = 'need_relogin';
        state.reloginUrl = qrUrl;

        if (notLoggedStreak >= 3 && !alerted) {
          alerted = true;
          log(`${tag}⚠️ Session hết hạn ${notLoggedStreak} lần liên tiếp — gửi cảnh báo kèm link quét QR: ${qrUrl}`);
          await alert(
            config,
            `⚠️ Phiên Lark${config.multiAccount ? ` của tài khoản "${account.label}"` : ''} trên VM keeper đã hết hạn — CMS sync sẽ dừng tới khi đăng nhập lại.\n👉 Quét QR đăng nhập lại: ${qrUrl}`,
          );
        } else if (notLoggedStreak < 3) {
          log(`${tag}session chưa đăng nhập (lần ${notLoggedStreak}/3) — trang QR đã bật: ${qrUrl}`);
        }
      }
      state.at = new Date().toISOString();
    } catch (e) {
      log(`${tag}lỗi tick: ` + (e?.message || e));
      state.state = 'error';
      state.note = (e?.message || String(e)).slice(0, 200);
      state.at = new Date().toISOString();
    } finally {
      running = false;
      await heartbeat();
      schedule();
    }
  };

  return {
    account,
    getState: () => ({ ...state }),
    async start() {
      await session.launch({ headless: config.headless });
      await tick(); // immediate on boot (also schedules the next)
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      await session.close();
    },
  };
}

export async function runKeeper(config, log = console.log) {
  const workers = config.accounts.map((acc) => createWorker(config, acc, log));
  const httpd = startHttpServer(config, () => workers.map((w) => w.getState()));

  if (config.multiAccount) {
    log(`đa tài khoản: ${config.accounts.map((a) => a.label).join(', ')}`);
  }
  log(
    `launched · accounts=${config.accounts.length} · headless=${config.headless} · refresh=${config.refreshIntervalSec}s · http=${config.httpHost}:${config.httpPort} · public=${config.publicUrl}`,
  );

  // Start workers sequentially so multiple headed Chromium launches don't stampede.
  for (const w of workers) {
    try {
      await w.start();
    } catch (e) {
      log(`[${w.account.label}] không khởi động được: ` + (e?.message || e));
    }
  }

  let stopped = false;
  const shutdown = async (sig) => {
    if (stopped) return;
    stopped = true;
    log(`nhận ${sig} — dừng ${workers.length} worker.`);
    try {
      httpd.close();
    } catch {
      /* ignore */
    }
    await Promise.all(workers.map((w) => w.stop().catch(() => undefined)));
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
