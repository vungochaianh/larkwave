import { BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron';
import { hiddenMode } from '../../hiddenMode';

/**
 * The Lark web page lives in a WebContentsView (not in a BrowserWindow's own webContents) so the
 * SAME webContents / session / login can be shown in several places without ever reloading:
 *
 *   • EMBEDDED — inside the main window at the "Trình duyệt Lark" placeholder (on top, visible).
 *   • PARKED   — inside the main window too, pushed past its bottom-right corner (1px overlap, see
 *                parkBounds). This is the normal "hidden" state. Why not just a hidden window: a WebContentsView in a window
 *                that was never shown has NO display surface — measured: `capturePage()` fails with
 *                "Current display surface not available for capture", `document.visibilityState`
 *                is 'hidden' (rAF stops, editors skip layout). The old design (the page WAS the
 *                hidden BrowserWindow's own webContents + paintWhenInitiallyHidden) did paint.
 *                Parked in the shown main window the page keeps painting like any visible page.
 *   • HOST     — the standalone host window: the visible login popup, or the fallback when no
 *                main window exists (macOS window closed, early boot).
 *
 * It mimics the slice of the BrowserWindow API larkWebSession uses (webContents, show/hide/focus,
 * loadURL, isDestroyed, destroy, on('closed'), once('ready-to-show')) so the session code barely
 * changed.
 */
type Place = 'host' | 'parked' | 'embedded';

export class LarkHost {
  readonly host: BrowserWindow;
  readonly view: WebContentsView;
  private place: Place = 'host';
  private parent: BrowserWindow | null = null; // main window when parked/embedded
  private parking: BrowserWindow | null = null;
  private parentCleanup: (() => void) | null = null;
  private dead = false;
  private viewVisible = true;

  constructor(partition: string, title: string, parking?: BrowserWindow | null) {
    this.host = new BrowserWindow({
      // Always created hidden (a window shown before first paint renders black on macOS dark mode).
      show: false,
      width: 1180,
      height: 820,
      title,
      backgroundColor: '#ffffff',
      paintWhenInitiallyHidden: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition },
    });
    this.view = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition, backgroundThrottling: false },
    });
    try {
      this.view.setBackgroundColor('#ffffff');
    } catch {
      /* older electron */
    }
    this.host.contentView.addChildView(this.view);
    this.fitHost();
    this.host.on('resize', () => {
      if (this.place === 'host') this.fitHost();
    });
    this.host.on('closed', () => {
      this.dead = true;
      this.detachFromParent();
      try {
        if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
      } catch {
        /* ignore */
      }
    });
    this.setParking(parking ?? null);
  }

  private fitHost(): void {
    try {
      const b = this.host.getContentBounds();
      this.view.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
    } catch {
      /* destroyed */
    }
  }

  /**
   * Parking bounds: the page sits just past the bottom-right corner, overlapping the window by ONE
   * pixel (hidden under macOS's rounded window corner). Measured: bounds fully outside the window
   * make Chromium mark the page hidden (visibilityState 'hidden', rAF stops, capturePage fails);
   * a 1px overlap keeps it 'visible' — rAF runs and capturePage returns the full page.
   */
  private parkBounds(win: BrowserWindow): Rectangle {
    let cw = 1280;
    let ch = 860;
    try {
      const b = win.getContentBounds();
      cw = b.width;
      ch = b.height;
    } catch {
      /* default */
    }
    return { x: Math.max(0, cw - 1), y: Math.max(0, ch - 1), width: Math.max(1180, cw), height: Math.max(820, ch) };
  }

  private detachFromParent(): void {
    const p = this.parent;
    this.parent = null;
    this.parentCleanup?.();
    this.parentCleanup = null;
    if (p && !p.isDestroyed()) {
      try {
        p.contentView.removeChildView(this.view);
      } catch {
        /* not a child */
      }
    }
  }

  private moveTo(win: BrowserWindow, place: Exclude<Place, 'host'>): void {
    if (this.parent !== win) {
      this.detachFromParent();
      try {
        this.host.contentView.removeChildView(this.view);
      } catch {
        /* not a child */
      }
      win.contentView.addChildView(this.view);
      this.parent = win;
      // The main window going away must not take the Lark page with it.
      const onClose = () => {
        if (this.parking === win) this.parking = null;
        this.toHost();
      };
      const onResize = () => {
        if (this.place === 'parked' && this.parent === win) this.view.setBounds(this.parkBounds(win));
      };
      win.once('close', onClose);
      win.on('resize', onResize);
      this.parentCleanup = () => {
        try {
          win.removeListener('close', onClose);
          win.removeListener('resize', onResize);
        } catch {
          /* ignore */
        }
      };
    } else if (place === 'embedded') {
      // Already a child (parked) → re-add to bring it on top of any other child view.
      try {
        win.contentView.addChildView(this.view);
      } catch {
        /* ignore */
      }
    }
    this.place = place;
  }

  private toHost(): void {
    this.detachFromParent();
    this.place = 'host';
    if (this.dead) return;
    try {
      this.viewVisible = true;
      this.view.setVisible(true);
      this.host.contentView.addChildView(this.view);
      this.fitHost();
    } catch {
      /* host gone */
    }
  }

  /** Park the page (corner, still painting) in the parking window — the default "hidden" place. */
  private park(): void {
    const win = this.parking;
    if (!win || win.isDestroyed() || this.dead) return this.toHost();
    this.moveTo(win, 'parked');
    this.viewVisible = true;
    this.view.setVisible(true);
    this.view.setBounds(this.parkBounds(win));
  }

  /** Set (or clear) the window to park in. Moves the page there unless it's embedded / popped up. */
  setParking(win: BrowserWindow | null): void {
    this.parking = win && !win.isDestroyed() ? win : null;
    if (this.isDestroyed() || this.place === 'embedded' || this.host.isVisible()) return;
    if (this.parking) this.park();
    else if (this.place === 'parked') this.toHost();
  }

  get webContents(): WebContents {
    return this.view.webContents;
  }

  isDestroyed(): boolean {
    try {
      return this.dead || this.host.isDestroyed() || this.view.webContents.isDestroyed();
    } catch {
      return true;
    }
  }

  get isEmbedded(): boolean {
    return this.place === 'embedded' && !!this.parent && !this.parent.isDestroyed();
  }

  /** Show the standalone host window (login popup / "Mở cửa sổ Lark"). Never in hidden dev mode;
   *  pointless while the page is already embedded in the app. */
  show(): void {
    if (hiddenMode() || this.isDestroyed() || this.isEmbedded) return;
    if (this.place !== 'host') this.toHost();
    this.fitHost();
    this.host.show();
  }
  /** Hide the popup → the page goes back to its parking place (keeps painting). */
  hide(): void {
    if (this.isDestroyed()) return;
    this.host.hide();
    if (this.place === 'host' && this.parking) this.park();
  }
  focus(): void {
    if (hiddenMode() || this.isDestroyed()) return;
    if (this.isEmbedded) this.view.webContents.focus();
    else if (this.place === 'host') this.host.focus();
  }
  isVisibleToUser(): boolean {
    if (this.isDestroyed()) return false;
    if (this.place === 'embedded') return this.viewVisible;
    return this.place === 'host' && this.host.isVisible();
  }

  loadURL(url: string, opts?: Electron.LoadURLOptions): Promise<void> {
    return this.view.webContents.loadURL(url, opts);
  }

  on(ev: 'closed', cb: () => void): void {
    this.host.on('closed', cb);
  }
  /** "first paint" equivalent for a view: the first finished load. */
  once(_ev: 'ready-to-show', cb: () => void): void {
    this.view.webContents.once('did-finish-load', cb);
  }

  destroy(): void {
    this.detachFromParent();
    try {
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    } catch {
      /* ignore */
    }
    try {
      if (!this.host.isDestroyed()) this.host.destroy();
    } catch {
      /* ignore */
    }
    this.dead = true;
  }

  /**
   * Show the page inside `win` at `rect` (CSS px of the renderer; scaled by the renderer zoom).
   * A zero-size rect keeps it attached but out of view (e.g. while an app modal is open over it).
   */
  embed(win: BrowserWindow, rect: { x: number; y: number; width: number; height: number }): void {
    if (this.isDestroyed() || win.isDestroyed()) return;
    if (this.place !== 'embedded' || this.parent !== win) {
      if (this.host.isVisible()) this.host.hide(); // login popup → continue inside the app
      this.moveTo(win, 'embedded');
    }
    let zoom = 1;
    try {
      zoom = win.webContents.getZoomFactor() || 1;
    } catch {
      /* default */
    }
    const b: Rectangle = {
      x: Math.round(rect.x * zoom),
      y: Math.round(rect.y * zoom),
      width: Math.max(0, Math.round(rect.width * zoom)),
      height: Math.max(0, Math.round(rect.height * zoom)),
    };
    if (b.width >= 2 && b.height >= 2) {
      this.viewVisible = true;
      this.view.setBounds(b);
    } else {
      // Keep painting (parked at the corner) instead of setVisible(false) — a hidden view stops rendering.
      this.viewVisible = false;
      this.view.setBounds(this.parkBounds(win));
    }
    this.view.setVisible(true);
  }

  /** Leave the screen: back to the parking place (or the hidden host). Session + automation go on. */
  unembed(): void {
    if (this.place !== 'embedded') return;
    if (this.parking && !this.parking.isDestroyed()) this.park();
    else this.toHost();
  }
}
