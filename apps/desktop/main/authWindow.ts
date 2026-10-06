import { BrowserWindow } from 'electron';
import { IPC } from '@larkwave/core';

export interface AuthWindowResult {
  ok: boolean;
  kind?: 'login' | 'connect';
  provider?: string;
  error?: string;
}

/**
 * A current desktop Chrome User-Agent with NO "Electron" token. Google blocks
 * OAuth in identifiable embedded webviews ("this browser may not be secure" /
 * disallowed_useragent); presenting a plain Chrome UA is the standard workaround.
 * Residual risk is Google-only — GitLab/GitHub have no such policy.
 */
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

/** The JWT is only ever delivered to the trusted web origin's /auth/callback. */
const TRUSTED_HOSTS = new Set(['toolswave.net', 'cms.toolswave.net']);

/**
 * Run an OAuth flow inside a dedicated child window and intercept the server's
 * redirect back to the web app — no server change and no OS scheme registration.
 *
 * The deployed API always 302s the issued JWT to
 *   https://toolswave.net/auth/callback?token=<JWT>            (login)
 *   https://toolswave.net/auth/callback?token=<JWT>&next=…linked=1  (git connect)
 * We read the token from that URL (strictly host-gated) and hand it to the MAIN
 * window via the existing `authDeepLink` channel — which AccountAuthProvider
 * already consumes — then close the child. Errors land on `…/login?error=<p>`.
 */
export function openAuthWindow(mainWin: BrowserWindow, startUrl: string): Promise<AuthWindowResult> {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      parent: mainWin,
      modal: true,
      width: 480,
      height: 720,
      autoHideMenuBar: true,
      title: 'Đăng nhập',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // Isolated cookie jar — looks like a clean browser, no app session bleed.
        partition: 'persist:tw-oauth',
      },
    });
    child.setMenuBarVisibility(false);
    child.webContents.setUserAgent(CHROME_UA);
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    let settled = false;
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 5 * 60_000);

    function finish(result: AuthWindowResult, token?: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result.ok && token && !mainWin.isDestroyed()) {
        mainWin.focus();
        mainWin.webContents.send(IPC.authDeepLink, token);
      }
      if (!child.isDestroyed()) child.close();
      resolve(result);
    }

    function check(rawUrl: string) {
      let u: URL;
      try {
        u = new URL(rawUrl);
      } catch {
        return;
      }
      // STRICT host gate — never read a token from accounts.google.com, gitlab.com,
      // the API host, or any other navigation in the redirect chain.
      if (u.protocol !== 'https:' || !TRUSTED_HOSTS.has(u.hostname)) return;
      const path = u.pathname.replace(/\/+$/, '') || '/';

      if (path === '/login' && u.searchParams.get('error')) {
        finish({ ok: false, error: u.searchParams.get('error') || 'oauth' });
        return;
      }
      if (path === '/auth/callback') {
        const token = u.searchParams.get('token') || undefined;
        const next = decodeURIComponent(u.searchParams.get('next') || '');
        const kind: 'login' | 'connect' = next.includes('linked=1') ? 'connect' : 'login';
        const provider = /provider=([a-z]+)/i.exec(next)?.[1];
        finish({ ok: !!token, kind, provider, error: token ? undefined : 'no-token' }, token);
        return;
      }
      // Fallback: client-side router.replace target after a git connect, if the
      // /auth/callback hop was missed.
      if (path === '/import' && u.searchParams.get('linked') === '1') {
        finish({ ok: true, kind: 'connect', provider: u.searchParams.get('provider') || undefined });
      }
    }

    child.webContents.on('will-redirect', (_e, url) => check(url));
    child.webContents.on('will-navigate', (_e, url) => check(url));
    child.webContents.on('did-redirect-navigation', (_e, url) => check(url));
    child.webContents.on('did-navigate', (_e, url) => check(url));
    child.on('closed', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: 'cancelled' });
      }
    });

    void child.loadURL(startUrl, { userAgent: CHROME_UA });
  });
}
