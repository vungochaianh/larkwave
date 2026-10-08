/**
 * Hidden dev mode — `LARKWAVE_HIDDEN=1` (dev only, ignored in a packaged build).
 *
 * The main window and every Lark window are created `show:false` and are never shown, but keep
 * rendering (paintWhenInitiallyHidden + no background throttling), so a developer can drive and
 * screenshot the app through CDP without ever putting a window on the user's screen.
 * See docs/lark-browser.md.
 */
export function hiddenMode(): boolean {
  return process.env.LARKWAVE_HIDDEN === '1' && process.env.NODE_ENV !== 'production';
}
