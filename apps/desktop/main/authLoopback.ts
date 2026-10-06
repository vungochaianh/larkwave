import { createServer } from 'node:http';
import { app, type BrowserWindow } from 'electron';
import { IPC } from '@larkwave/core';

/** Bring the desktop app back to the foreground after the browser OAuth round-trip. */
function focusApp(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  // macOS: steal focus from the browser so the user lands back in the app.
  app.focus({ steal: true });
}

/**
 * One-shot loopback OAuth callback server. The desktop OAuth flow can redirect the
 * issued JWT to `http://127.0.0.1:<port>/cb?token=…` instead of the `larkwave://`
 * custom scheme — this works in `nextron dev` (no OS scheme registration) and on
 * locked-down machines, and is the most robust desktop OAuth pattern.
 *
 * We bind to an ephemeral port on 127.0.0.1, hand back the `/cb` URL for the caller
 * to pass as `?redirect=`, and on the first callback we push the token to the
 * renderer via the SAME `authDeepLink` channel the deep link uses, then close.
 */
export function startAuthLoopback(win: BrowserWindow): Promise<{ redirect: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        if (u.pathname !== '/cb') {
          res.writeHead(404).end();
          return;
        }
        const token = u.searchParams.get('token');
        const error = u.searchParams.get('error') || undefined;
        const ok = !!token;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>Larkwave</title>` +
            `<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-align:center;padding:64px;color:#1E2230">` +
            `<h2>${ok ? '✓ Đã đăng nhập' : 'Đăng nhập chưa hoàn tất'}</h2>` +
            `<p>Đang quay lại ứng dụng Larkwave — bạn có thể đóng tab này.</p></body>`,
        );
        if (!win.isDestroyed()) {
          focusApp(win);
          if (ok) {
            win.webContents.send(IPC.authDeepLink, token);
            win.webContents.send(IPC.authStatus, { phase: 'success' });
          } else {
            win.webContents.send(IPC.authStatus, { phase: 'error', error: error || 'cancelled' });
          }
        }
        setTimeout(() => server.close(), 300);
      } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    // Don't leak the server if the user abandons the flow.
    const timer = setTimeout(() => {
      try {
        server.close();
      } catch {
        /* already closed */
      }
    }, 5 * 60_000);
    server.on('close', () => clearTimeout(timer));
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ redirect: `http://127.0.0.1:${port}/cb` });
    });
  });
}
