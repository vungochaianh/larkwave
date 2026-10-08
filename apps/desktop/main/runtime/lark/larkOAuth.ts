import { BrowserWindow } from 'electron';
import { hiddenMode } from '../../hiddenMode';

/**
 * Lark user OAuth 2.0 (v2) — log in with a PERSONAL Lark account (QR scan or
 * credentials) to obtain a `user_access_token`. Unlike the custom app's
 * `tenant_access_token` (which only sees resources the app was added to), the user
 * token acts AS the user, so every API call reaches everything that user can access
 * (Bases, Docs, Sheets, Wiki, Drive, messages…).
 *
 * Flow (international Lark — larksuite.com):
 *   1. Open  accounts.larksuite.com/open-apis/authen/v1/authorize  (shows login + QR).
 *   2. After consent Lark 302s to  redirect_uri?code=…&state=…  (code valid 5 min).
 *   3. Exchange the code at  open.larksuite.com/open-apis/authen/v2/oauth/token
 *      (grant_type=authorization_code, client_id+client_secret — no app_access_token).
 *   4. Refresh with the same endpoint (grant_type=refresh_token) before expiry.
 *
 * Docs: open.larksuite.com → Authentication / authen v1 authorize + authen v2 oauth/token.
 */

const ACCOUNTS_HOST = 'https://accounts.larksuite.com';
const OPEN_HOST = 'https://open.larksuite.com';

/**
 * Redirect URL the user must register in their Lark app (Developer Console → app →
 * Security Settings → Redirect URL). We never actually load it: the child window's
 * navigation to it is intercepted to read the `code`. A Larkwave-owned https URL is
 * used because Lark validates redirect_uri against the registered list at authorize
 * time (a localhost/custom-scheme URL is not reliably accepted).
 */
/**
 * GIỮ NGUYÊN `app.toolswave.net` dù tên miền đó nay thuộc hệ thống khác.
 *
 * Chuỗi này là một ĐỊNH DANH, không phải một địa chỉ được tải: cửa sổ con bị chặn ngay ở bước
 * điều hướng để đọc `code`, nên trang đích không bao giờ được yêu cầu. Đổi nó đi thì mọi tenant
 * đã đăng ký URL cũ trong Lark Developer Console sẽ đăng nhập hỏng cho tới khi họ tự vào sửa —
 * tức là gây hỏng thật để chữa một cái không hỏng.
 */
export const LARK_OAUTH_REDIRECT = 'https://app.toolswave.net/lark/callback';

/**
 * Scopes requested at authorize time — kept BROAD so the user token can work with the
 * whole account (content + messaging + calendar). The user must ENABLE the matching
 * scopes on their Lark app (Developer Console → Permissions & Scopes → re-publish) —
 * Lark only grants scopes that are BOTH requested here AND enabled on the app; any extra
 * requested-but-not-enabled scope is simply ignored (no error). `offline_access` is
 * required to receive a refresh_token.
 *
 * To widen access further: enable the permission in the Lark Console, then add its scope
 * string here. NOTE: an INVALID scope string makes the authorize page error — so test the
 * QR login in the dev app after adding one. (Candidates to add when needed:
 * `task:task`, `approval:approval`, `contact:department.base:readonly`,
 * `contact:user.email:readonly`, `contact:user.phone:readonly`, `mail:user_mailbox`.)
 */
export const LARK_OAUTH_SCOPES = [
  'offline_access',
  // Content (read + write)
  'bitable:app',
  'docx:document',
  'drive:drive',
  'sheets:spreadsheet',
  'wiki:wiki',
  // Messaging
  'im:message',
  'im:chat',
  // Calendar (events + calendars) — matches the calendar_* tools
  'calendar:calendar',
  // People
  'contact:user.base:readonly',
].join(' ');

export interface LarkUserTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires. */
  expiresAt: number;
  /** epoch ms when the refresh token expires (re-login needed past this). */
  refreshExpiresAt: number;
  scope?: string;
}

// Some identity providers refuse to render their login/QR page inside an Electron webview whose
// UA carries the "Electron" token ("this browser may not be secure"). Present a plain Chrome UA.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

/** Build the Lark authorize URL (the page that shows the QR + login). */
export function buildAuthorizeUrl(appId: string, state: string): string {
  const p = new URLSearchParams({
    client_id: appId,
    redirect_uri: LARK_OAUTH_REDIRECT,
    // REQUIRED by Lark's authen/v1/authorize (an OAuth 2.0 authorization-code endpoint). Omitting
    // it makes Lark return invalid_request / render its own error page and never issue a code.
    response_type: 'code',
    scope: LARK_OAUTH_SCOPES,
    state,
  });
  return `${ACCOUNTS_HOST}/open-apis/authen/v1/authorize?${p.toString()}`;
}

/**
 * Open the Lark authorize page in a child window and resolve the OAuth `code` once
 * Lark redirects back to our registered callback. Strictly host-gated + state-checked.
 */
export function openLarkAuthWindow(
  mainWin: BrowserWindow,
  appId: string,
  state: string,
): Promise<{ code?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = new BrowserWindow({
      parent: mainWin,
      // NOT modal: an erroring/blank auth page must never OS-block the main window — that's what
      // left the "Cài đặt" modal frozen and uncloseable. The window still closes itself on finish().
      modal: false,
      width: 480,
      height: 720,
      autoHideMenuBar: true,
      // LARKWAVE_HIDDEN=1 (dev): render but never put a window on screen.
      show: !hiddenMode(),
      title: 'Đăng nhập Lark',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:tw-lark-oauth' },
    });
    child.setMenuBarVisibility(false);
    child.webContents.setUserAgent(CHROME_UA); // avoid the "browser not secure" block on the QR page
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    let settled = false;
    const timer = setTimeout(() => finish({ error: 'Hết thời gian đăng nhập Lark — hãy thử lại.' }), 5 * 60_000);

    function finish(result: { code?: string; error?: string }) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      // Lark's OWN failure (consent denied, invalid scope/request) comes back as error params on
      // ITS host — finish now instead of letting the window hang until the 5-minute timeout.
      if (u.hostname.endsWith('larksuite.com') || u.hostname.endsWith('feishu.cn')) {
        const e = u.searchParams.get('error_description') || u.searchParams.get('error');
        if (e) return finish({ error: e });
        return; // a normal navigation inside the login/QR flow
      }
      // Only read the code from OUR registered callback, never from any other hop.
      if (u.protocol !== 'https:' || u.hostname !== 'app.toolswave.net') return;
      if ((u.pathname.replace(/\/+$/, '') || '/') !== '/lark/callback') return;
      const err = u.searchParams.get('error') || u.searchParams.get('error_description');
      if (err) return finish({ error: err });
      if (u.searchParams.get('state') !== state) return finish({ error: 'state-mismatch' });
      const code = u.searchParams.get('code') || undefined;
      finish(code ? { code } : { error: 'no-code' });
    }

    child.webContents.on('will-redirect', (_e, url) => check(url));
    child.webContents.on('will-navigate', (_e, url) => check(url));
    child.webContents.on('did-redirect-navigation', (_e, url) => check(url));
    child.webContents.on('did-navigate', (_e, url) => check(url));
    // A page that fails to load (offline/proxy/blocked) or a crashed renderer must also resolve —
    // otherwise the window sits blank until the 5-minute timeout. -3 = ERR_ABORTED (a normal redirect).
    child.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) finish({ error: desc || `Không tải được trang đăng nhập (mã ${code}).` });
    });
    child.webContents.on('render-process-gone', () => finish({ error: 'Cửa sổ đăng nhập Lark bị lỗi — hãy thử lại.' }));
    child.on('closed', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ error: 'cancelled' });
      }
    });

    void child.loadURL(buildAuthorizeUrl(appId, state), { userAgent: CHROME_UA });
  });
}

interface V2TokenResponse {
  code?: number | string;
  error?: string;
  error_description?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

/**
 * An OAuth token-endpoint failure. `transient` distinguishes a network/5xx blip (keep the
 * stored session, retry later) from a PERMANENT failure (e.g. invalid_grant — the refresh
 * token is revoked/expired, so the user must log in again).
 */
export class LarkOAuthError extends Error {
  constructor(
    readonly oauthError: string | undefined,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = 'LarkOAuthError';
  }
}

function toTokens(j: V2TokenResponse): LarkUserTokens {
  const now = Date.now();
  if (!j.access_token || !j.refresh_token) {
    throw new Error(j.error_description || j.error || 'Lark không trả về token.');
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: now + (j.expires_in ?? 7200) * 1000,
    refreshExpiresAt: now + (j.refresh_token_expires_in ?? 604800) * 1000,
    scope: j.scope,
  };
}

async function postToken(body: Record<string, string>): Promise<LarkUserTokens> {
  let res: Response;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15_000);
    try {
      res = await fetch(`${OPEN_HOST}/open-apis/authen/v2/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: c.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    // Network error / timeout → transient (keep the session, retry later).
    throw new LarkOAuthError(undefined, `Lỗi mạng khi gọi token Lark: ${(e as Error).message}`, true);
  }
  const j = (await res.json().catch(() => ({}))) as V2TokenResponse;
  // v2 returns the token fields at the top level; code "0"/0 = success.
  if (j.access_token) return toTokens(j);
  // A 5xx (or no error code) is transient; a 4xx with an OAuth error (invalid_grant…) is permanent.
  const transient = res.status >= 500 || (!j.error && res.status === 0);
  throw new LarkOAuthError(j.error, j.error_description || j.error || `Lỗi token Lark (${j.code ?? res.status}).`, transient);
}

/** Exchange an authorization code for user tokens. */
export function exchangeCode(appId: string, appSecret: string, code: string): Promise<LarkUserTokens> {
  return postToken({
    grant_type: 'authorization_code',
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: LARK_OAUTH_REDIRECT,
  });
}

/** Refresh user tokens with a refresh_token. */
export function refreshTokens(appId: string, appSecret: string, refreshToken: string): Promise<LarkUserTokens> {
  return postToken({
    grant_type: 'refresh_token',
    client_id: appId,
    client_secret: appSecret,
    refresh_token: refreshToken,
  });
}

/** The logged-in user's display name (best-effort) via the user_access_token. */
export async function fetchUserName(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${OPEN_HOST}/open-apis/authen/v1/user_info`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const j = (await res.json().catch(() => ({}))) as { data?: { name?: string; en_name?: string } };
    return j.data?.name || j.data?.en_name;
  } catch {
    return undefined;
  }
}
