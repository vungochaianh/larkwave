/**
 * session.js — the headless Lark web session, held alive via Playwright.
 *
 * Mirrors what the desktop's hidden BrowserWindow does
 * (apps/desktop/main/runtime/lark/larkWebSession.ts):
 *   • a PERSISTENT Chromium profile so login survives restarts,
 *   • periodic navigation to keep Lark's own session cookies fresh,
 *   • sniffing docs-host-id / docs-host-type / x-csrftoken off /space/api/ calls,
 *   • building a connector session = { domain, cookies (incl. httpOnly),
 *     csrfToken (from _csrf_token cookie), hostId, hostType }.
 */
import { chromium } from 'playwright';

const LOGIN_URL_RE = /\/login|\/accounts\/page\/login|\/suite\/passport|\/passport\/web\/login|\/accounts\/page\/url_login/i;

export class LarkSession {
  constructor(config) {
    this.config = config;
    this.context = null;
    this.page = null;
    this.capturedCsrf = '';
    this.capturedHostId = '';
    this.capturedHostType = '';
    this._nav = Promise.resolve();
  }

  async launch({ headless = true } = {}) {
    this.context = await chromium.launchPersistentContext(this.config.profileDir, {
      headless,
      viewport: { width: 1280, height: 860 },
      userAgent: this.config.userAgent,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        // Give the headed window a real size/position so it is visible over VNC
        // (a bare Xvfb otherwise leaves it at 1×1 → black screen).
        '--window-position=0,0',
        '--window-size=1360,900',
        '--start-maximized',
      ],
    });

    // Sniff the headers Lark's web app sends on its internal /space/api calls —
    // the connector endpoint wants docs-host-id/type + csrf, not just cookies.
    this.context.on('request', (reqObj) => {
      try {
        const u = reqObj.url();
        if (u.indexOf('/space/api/') < 0) return;
        const h = reqObj.headers();
        if (h['docs-host-id']) this.capturedHostId = h['docs-host-id'];
        if (h['docs-host-type']) this.capturedHostType = h['docs-host-type'];
        if (h['x-csrftoken']) this.capturedCsrf = h['x-csrftoken'];
      } catch {
        /* ignore */
      }
    });

    this.page = this.context.pages()[0] || (await this.context.newPage());
    return this;
  }

  /** Navigate to LARK_HOST (redirects to the login page when not authed). */
  async gotoLogin() {
    try {
      await this.page.goto(this.config.larkHost, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch {
      /* ignore */
    }
  }

  /** Open the QR-login panel (the toggle is the icon in the login card's
   *  top-right corner). Viewport is fixed at 1280×860 so the coordinate is stable.
   *  Retries a few candidate spots and verifies the QR panel actually appeared. */
  async openQrLogin() {
    await this.gotoLogin();
    await this.page.waitForTimeout(4500);
    const qrShown = async () => {
      try {
        return await this.page.evaluate(() =>
          /Log In With QR Code|Scan the QR code|Account Login/i.test(document.body.innerText || ''),
        );
      } catch {
        return false;
      }
    };
    // The toggle is a corner ribbon: <div class="login-qr-switch-box"> whose
    // clickable QR icon sits at its top-right. A locator click at that offset
    // dispatches a proper trusted event (a raw coordinate click only hovers).
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await qrShown()) return true;
      try {
        await this.page.locator('.login-qr-switch-box').click({ position: { x: 388, y: 16 }, force: true, timeout: 4000 });
      } catch {
        try {
          await this.page.mouse.click(585, 180);
        } catch {
          /* keep trying */
        }
      }
      await this.page.waitForTimeout(2800);
    }
    return await qrShown();
  }

  /** When the QR expired (Lark overlays a "Refresh QR Code" button on the code),
   *  click it to get a fresh QR. Returns true if it refreshed. */
  async refreshQrIfStale() {
    try {
      const stale = await this.page.evaluate(() => /Refresh QR Code|Làm mới/i.test(document.body.innerText || ''));
      if (!stale) return false;
      // the refresh button sits centered on the QR image (~380,433 at 1280×860)
      await this.page.mouse.click(380, 433);
      await this.page.waitForTimeout(2500);
      return true;
    } catch {
      return false;
    }
  }

  /** Screenshot the current page to a file (best-effort). */
  async screenshotTo(file) {
    try {
      await this.page.screenshot({ path: file, fullPage: true });
      return true;
    } catch {
      return false;
    }
  }

  /** Reload the Lark page so its session cookies stay fresh + host headers get
   *  re-captured. Serialized so overlapping ticks never fight over one page. */
  async keepAlive() {
    this._nav = this._nav.catch(() => {}).then(() => this._doKeepAlive());
    return this._nav;
  }

  async _doKeepAlive() {
    try {
      await this.page.goto(this.config.keepAliveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Give the SPA a moment to fire its internal /space/api calls.
      await this.page.waitForTimeout(4000);
    } catch {
      /* a transient nav failure is fine — the next tick retries */
    }
  }

  /** True when the profile holds a live Lark session (has session cookies AND
   *  the current page is not a login page). */
  async isLoggedIn() {
    try {
      const cookies = await this.context.cookies(this.config.larkHost);
      const hasSession = cookies.some((c) => /session|passport|_csrf_token/i.test(c.name));
      const url = this.page ? this.page.url() : '';
      return hasSession && !LOGIN_URL_RE.test(url);
    } catch {
      return false;
    }
  }

  /** Build the connector session pushed to the CMS backend. Null when no cookies. */
  async getConnectorSession() {
    let domain = '';
    try {
      domain = new URL(this.config.larkHost).host;
    } catch {
      return null;
    }
    const cookies = await this.context.cookies(this.config.larkHost);
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    if (!cookieStr) return null;
    const csrfCookie = cookies.find((c) => c.name === '_csrf_token');
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.value) : this.capturedCsrf || '';
    return {
      domain,
      cookies: cookieStr,
      csrfToken,
      hostId: this.capturedHostId || '',
      hostType: this.capturedHostType || 'Wiki',
    };
  }

  /** Seed a cookie string (e.g. copied from the desktop app's connector config,
   *  or DevTools) into the persistent profile — an alternative to `login` that
   *  needs no display. Values are attached to LARK_HOST. */
  async seedCookies(cookieStr) {
    const url = this.config.larkHost;
    const items = String(cookieStr)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf('=');
        if (i < 0) return null;
        return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(), url };
      })
      .filter((c) => c && c.name);
    if (items.length) await this.context.addCookies(items);
    return items.length;
  }

  async close() {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        /* ignore */
      }
    }
  }
}
