// A tiny client-side ring buffer of recent console errors + uncaught errors, so
// an in-app bug report can attach real context for admins. No PII beyond what the
// app already logs; capped + truncated. Mirrors apps/web/src/lib/errorLog.ts so the
// desktop report carries the same diagnostics.

const BUF: string[] = [];
const MAX = 40;
let installed = false;

export function pushLog(line: string): void {
  BUF.push(line.slice(0, 1000));
  if (BUF.length > MAX) BUF.shift();
}

export function getRecentLogs(): string[] {
  return [...BUF];
}

/** Idempotently hook console.error + window error/rejection into the buffer. */
export function installErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      pushLog('[error] ' + args.map((a) => safeStr(a)).join(' '));
    } catch {
      /* ignore */
    }
    orig(...(args as []));
  };
  window.addEventListener('error', (e) => {
    pushLog(`[window.error] ${e.message ?? ''} @ ${e.filename ?? ''}:${e.lineno ?? ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    pushLog(`[unhandledrejection] ${safeStr((e as PromiseRejectionEvent).reason)}`);
  });
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
