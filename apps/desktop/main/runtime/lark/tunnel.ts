import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Cloudflared QUICK tunnel manager — gives the local Lark webhook listener a public HTTPS URL
 * (`https://<random>.trycloudflare.com`) that Lark's Event Subscription can POST to, WITHOUT the
 * user running cloudflared/ngrok by hand and pasting the URL.
 *
 * We shell out to a `cloudflared` binary already on PATH (bundling it would add ~30MB/platform).
 * If it's missing we surface a clear install hint instead of failing silently. The quick tunnel
 * prints its assigned URL to stderr; we parse it and keep the child alive until stop().
 */
const TRYCF = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const READY_TIMEOUT_MS = 30_000;

export class TunnelManager {
  private proc: ChildProcess | null = null;
  private url: string | null = null;
  private lastError: string | null = null;

  status(): { running: boolean; url?: string; error?: string } {
    return {
      running: !!this.proc && !this.proc.killed,
      url: this.url ?? undefined,
      error: this.lastError ?? undefined,
    };
  }

  /** Start a quick tunnel to 127.0.0.1:port; resolves with the public https URL (or throws). */
  async start(port: number): Promise<string> {
    if (this.proc && this.url) return this.url;
    await this.stop();
    this.lastError = null;
    const bin = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    return new Promise<string>((resolve, reject) => {
      let done = false;
      const fail = (msg: string) => {
        if (done) return;
        done = true;
        this.lastError = msg;
        void this.stop();
        reject(new Error(msg));
      };
      let child: ChildProcess;
      try {
        child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        return fail(String((e as Error)?.message || e));
      }
      this.proc = child;
      const onData = (buf: Buffer) => {
        const m = TRYCF.exec(buf.toString());
        if (m && !done) {
          done = true;
          this.url = m[0];
          resolve(m[0]);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', (e: NodeJS.ErrnoException) => {
        this.proc = null;
        fail(
          e.code === 'ENOENT'
            ? 'Không tìm thấy cloudflared. Cài: "brew install cloudflared" (mac) hoặc tải cloudflared.exe cho Windows, rồi bật lại.'
            : String(e.message || e),
        );
      });
      child.on('exit', (code) => {
        this.proc = null;
        this.url = null;
        fail(`cloudflared thoát sớm (mã ${code ?? '?'}). Kiểm tra cloudflared đã cài đúng chưa.`);
      });
      setTimeout(() => fail('Hết thời gian chờ cloudflared tạo URL (30s).'), READY_TIMEOUT_MS);
    });
  }

  async stop(): Promise<void> {
    const p = this.proc;
    this.proc = null;
    this.url = null;
    if (p && !p.killed) {
      try {
        p.kill();
      } catch {
        /* already gone */
      }
    }
  }
}
