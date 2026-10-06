import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';

/**
 * Persists the Larkwave account JWT in the MAIN process (encrypted via the OS keychain), so it
 * survives the renderer ORIGIN flipping.
 *
 * Why this exists: the account token lives in the renderer's `localStorage`, which is scoped
 * PER ORIGIN. codePush loads the renderer from either the bundled `app://` origin or the remote
 * `https://twd-desktop-renderer.pages.dev` origin depending on network reachability + version
 * gating — so a token saved on one origin is invisible on the other, and the user gets logged
 * out whenever the loaded origin flips. Keeping the token here (origin-independent) + hydrating
 * whichever renderer loads fixes the "keeps logging me out" problem.
 *
 * The JWT is a secret → never written in plaintext (only when safeStorage encryption is
 * available; otherwise the renderer simply re-forwards it on next login).
 */
export class AccountTokenStore {
  constructor(private readonly userDataDir: string) {}

  private file(): string {
    return join(this.userDataDir, 'account', 'token.bin');
  }

  get(): string | null {
    try {
      const p = this.file();
      if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(readFileSync(p));
    } catch {
      return null;
    }
  }

  set(token: string | null): void {
    try {
      if (!token) {
        rmSync(this.file(), { force: true });
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) return; // don't persist a JWT in plaintext
      mkdirSync(join(this.userDataDir, 'account'), { recursive: true });
      writeFileSync(this.file(), safeStorage.encryptString(token));
    } catch {
      /* best-effort; localStorage remains the primary store */
    }
  }
}
