import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Offline-first (Phase 0) read-through cache for Larkwave-account GET responses.
 * Every account call funnels through the main-process accountFetch proxy; this
 * stores each successful GET's body under {userData}/account-cache/<key>.json so the
 * account views keep rendering the LAST-KNOWN data when apia is unreachable (the
 * recent multi-hour outage blanked every account screen). Server-authoritative,
 * read-mostly data → last-write-wins, no merge. Plain JSON files (no native dep),
 * matching the existing userData persistence pattern. Per-user keyed (token tail)
 * so one account's cache never serves another's.
 */
export class AccountCache {
  private readonly dir: string;
  constructor(baseDir: string) {
    this.dir = join(baseDir, 'account-cache');
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  /** GETs we must NOT cache: liveness probe + the payment-status poll (must be live). */
  static skip(url: string): boolean {
    return /\/health(\?|$)/.test(url) || /\/payments\/[^/]+(\?|$)/.test(url);
  }

  private key(method: string, url: string, headers?: Record<string, string>): string {
    const auth = headers?.Authorization || headers?.authorization || '';
    const tok = auth.slice(-16); // scope per user without storing the raw token
    return createHash('sha256').update(`${method.toUpperCase()} ${url} ${tok}`).digest('hex').slice(0, 40);
  }

  read(method: string, url: string, headers?: Record<string, string>): { status: number; text: string } | null {
    try {
      const f = join(this.dir, `${this.key(method, url, headers)}.json`);
      if (!existsSync(f)) return null;
      const c = JSON.parse(readFileSync(f, 'utf8')) as { status: number; text: string };
      return { status: c.status, text: c.text };
    } catch {
      return null;
    }
  }

  write(method: string, url: string, headers: Record<string, string> | undefined, status: number, text: string): void {
    try {
      writeFileSync(
        join(this.dir, `${this.key(method, url, headers)}.json`),
        JSON.stringify({ status, text, at: Date.now() }),
      );
      this.gc();
    } catch {
      /* best-effort cache */
    }
  }

  /** Cap the cache (~400 entries); evict oldest by mtime. */
  private gc(): void {
    try {
      const files = readdirSync(this.dir).map((f) => join(this.dir, f));
      if (files.length <= 400) return;
      files
        .map((f) => ({ f, t: statSync(f).mtimeMs }))
        .sort((a, b) => a.t - b.t)
        .slice(0, files.length - 400)
        .forEach((x) => rmSync(x.f, { force: true }));
    } catch {
      /* ignore */
    }
  }
}
