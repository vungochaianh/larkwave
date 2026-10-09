import { isLarkHost } from './larkUiCore';

/**
 * Is the Lark web page REALLY logged in? Pure (no Electron) → apps/desktop/test/larkLoginState.cjs.
 *
 * The old check was "the URL is on a Lark host and isn't a login page", so the public marketing
 * site (https://www.larksuite.com/en_sg/ — where connect() lands by default) counted as logged in:
 * the status pill said "Đã đăng nhập" with no session at all, and the host was remembered as the
 * user's tenant. Now the signal is Lark's own "who am I" answer (`classifyWhoami`): logged in
 * only when Lark returns a NON-anonymous user with a real uid. The URL only decides whether we are
 * on a login page (keep waiting) or may probe.
 */

export type LarkPageKind = 'login' | 'public' | 'app' | 'other';

export const LOGIN_PATH = /\/(accounts|passport|login|sso|suite\/passport)(\/|$|\?)/i;

/** Hosts that serve the PUBLIC site / auth, never a tenant's workspace. */
const PUBLIC_HOSTS = /^(www\.|)(larksuite\.com|larkoffice\.com|feishu\.cn|feishu\.com)$|^(open|passport|accounts|login|sso|help|www-[a-z]+)\./i;
/** Paths of the logged-in web app (also valid on a public host, e.g. www.larksuite.com/next/messenger). */
const APP_PATH = /^\/(next|messenger|base|wiki|docx|docs|doc|sheets|drive|mindnotes|file|app|admin|calendar|minutes|approval|space|okr)(\/|$)/i;

export function classifyLarkPage(url: string | null | undefined): LarkPageKind {
  if (!url || !isLarkHost(url)) return 'other';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'other';
  }
  if (LOGIN_PATH.test(u.pathname) || /^(passport|accounts|login|sso)\./i.test(u.hostname)) return 'login';
  if (APP_PATH.test(u.pathname)) return 'app';
  if (PUBLIC_HOSTS.test(u.hostname)) return 'public'; // marketing pages (/en_sg/, /product/…)
  return 'app'; // tenant shard (abc.larksuite.com, abc.sg.larksuite.com) — any path
}

/** Endpoint the Lark web app itself calls for "who am I". Measured on the public site without a
 *  login: HTTP 200 `{code:0, data:{is_Anonymous:true, uid:"", name:"Guest User 66018", …}}` — so a
 *  200 alone proves nothing; the anonymity flag + a real uid do. (A `session` cookie is ALSO set for
 *  anonymous visitors — measured — so cookies are not a login signal either.) */
export const WHOAMI_PATH = '/space/api/user/';

export interface LarkWhoami {
  loggedIn: boolean;
  /** Definitive: Lark answered and said "anonymous" (vs. unknown = no/odd answer). */
  anonymous: boolean;
  name?: string;
  /** The tenant's web domain (e.g. abc.sg.larksuite.com) when logged in. */
  domain?: string;
}

/** Classify the whoami JSON. Fail-closed: anything but a clear non-anonymous user → not logged in. */
export function classifyWhoami(json: unknown): LarkWhoami {
  const j = json as { code?: unknown; data?: Record<string, unknown> } | null;
  if (!j || typeof j !== 'object' || j.code !== 0 || !j.data || typeof j.data !== 'object') return { loggedIn: false, anonymous: false };
  const d = j.data;
  const anon = d.is_Anonymous === true || d.isAnonymous === true || d.is_anonymous === true;
  // Đo thật 09/10/2026 trên một tài khoản ĐÃ đăng nhập: `uid` là CHUỖI RỖNG, mã thật nằm ở `suid`
  // (19 ký tự) và `id`. Khách ẩn danh thì is_Anonymous=true. Nên: không ẩn danh + có MỘT mã bất kỳ.
  const realUid = [d.uid, d.suid, d.id].some((v) => String(v ?? '').trim() !== '');
  if (anon) return { loggedIn: false, anonymous: true };
  if (!realUid) return { loggedIn: false, anonymous: false };
  const domain = typeof d.domain === 'string' && /^[a-z0-9.-]+$/i.test(d.domain) && isLarkHost('https://' + d.domain) ? d.domain : undefined;
  return { loggedIn: true, anonymous: false, name: typeof d.name === 'string' ? d.name.slice(0, 80) : undefined, domain };
}

/** A page we may run the whoami probe on (Lark host, not the login/SSO page itself). */
export function canProbeLogin(url: string | null | undefined): boolean {
  const k = classifyLarkPage(url);
  return k === 'app' || k === 'public';
}
