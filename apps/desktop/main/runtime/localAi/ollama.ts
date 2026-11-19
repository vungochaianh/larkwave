/**
 * AI MIỄN PHÍ TRÊN MÁY (0.1.24) — Ollama do chính app tải về và chạy, người dùng không phải mở terminal.
 *
 *   • Cài: tải bản phát hành chính thức của Ollama (GitHub ollama/ollama, giấy phép MIT) vào
 *     `<userData>/ai/ollama`, giải nén bằng `tar` có sẵn của hệ điều hành. Không cần quyền admin, không đụng
 *     /Applications, gỡ app là gỡ luôn.
 *   • Chạy: `ollama serve` ở CỔNG RIÊNG 11435 (không giẫm lên Ollama người dùng tự cài ở 11434), mô hình lưu
 *     ở `<userData>/ai/models`. Đã có Ollama của người dùng đang chạy ở 11434 → dùng luôn bản đó.
 *   • Mô hình: tải qua `POST /api/pull` (NDJSON có tiến độ). Lark × Agents gọi `/v1/chat/completions` kiểu
 *     OpenAI (apiRunner, provider 'ollama') với bộ công cụ phiên web.
 *
 * Mọi việc dài (tải Ollama, tải mô hình) chạy NỀN; giao diện hỏi `status().busy` để vẽ tiến độ.
 */
import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { totalmem } from 'node:os';
import type { LocalAiModel, LocalAiStatus } from '@larkwave/core';

export const OWN_PORT = 11435;
const OWN_BASE = `http://127.0.0.1:${OWN_PORT}`;
const EXT_BASE = 'http://127.0.0.1:11434';

/** Mô hình gợi ý — đều có gọi công cụ, đọc/viết tiếng Việt được. Kích thước đo từ kho Ollama (19/11/2026). */
export const RECOMMENDED: LocalAiModel[] = [
  { id: 'qwen3:4b', label: 'Qwen3 4B — nhẹ, máy 8 GB RAM', sizeGb: 2.5, minRamGb: 8 },
  { id: 'qwen3:8b', label: 'Qwen3 8B — cân bằng, máy 16 GB RAM', sizeGb: 5.2, minRamGb: 16 },
  { id: 'gpt-oss:20b', label: 'gpt-oss 20B — mạnh nhất, máy từ 24 GB RAM', sizeGb: 13.8, minRamGb: 24 },
];

export function ramGb(): number {
  return Math.round(totalmem() / 1024 ** 3);
}

/** Mô hình mặc định theo RAM máy. */
export function defaultModelFor(ram: number): string {
  return ram >= 16 ? 'qwen3:8b' : 'qwen3:4b';
}

/** Link tải bản phát hành mới nhất của Ollama cho hệ điều hành này (null = chưa hỗ trợ cài tự động). */
export function downloadUrl(platform: NodeJS.Platform = process.platform): string | null {
  if (platform === 'darwin') return 'https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz';
  if (platform === 'win32') return 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip';
  return null;
}

/** Tìm tệp chạy `ollama` trong thư mục đã giải nén (cấu trúc gói đổi theo bản — tìm thay vì đoán). */
export function findOllamaBin(dir: string, depth = 3): string | null {
  const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  if (!existsSync(dir) || depth < 0) return null;
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return null; }
  for (const e of entries) {
    const p = join(dir, e);
    try { if (e === name && statSync(p).isFile()) return p; } catch { /* bỏ qua */ }
  }
  for (const e of entries) {
    const p = join(dir, e);
    try { if (statSync(p).isDirectory()) { const f = findOllamaBin(p, depth - 1); if (f) return f; } } catch { /* bỏ qua */ }
  }
  return null;
}

async function getJson<T>(url: string, ms = 1500): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

class OllamaManager {
  private proc: ChildProcess | null = null;
  private base: string | null = null;
  private external = false;
  private busy: LocalAiStatus['busy'];
  private error: string | undefined;
  private quitHooked = false;

  root(): string { return join(app.getPath('userData'), 'ai'); }
  binDir(): string { return join(this.root(), 'ollama'); }
  modelsDir(): string { return join(this.root(), 'models'); }
  ownBin(): string | null { return findOllamaBin(this.binDir()); }

  private async version(base: string): Promise<string | null> {
    const v = await getJson<{ version?: string }>(`${base}/api/version`);
    return v ? v.version || '?' : null;
  }

  /** Địa chỉ máy chủ Ollama đang trả lời (bật bản của app nếu cần). null = chưa cài. */
  async ensureRunning(): Promise<{ base: string; external: boolean; version: string } | null> {
    if (this.base) {
      const v = await this.version(this.base);
      if (v) return { base: this.base, external: this.external, version: v };
    }
    const ext = await this.version(EXT_BASE);
    if (ext) { this.base = EXT_BASE; this.external = true; return { base: EXT_BASE, external: true, version: ext }; }
    const own = await this.version(OWN_BASE);
    if (own) { this.base = OWN_BASE; this.external = false; return { base: OWN_BASE, external: false, version: own }; }
    const bin = this.ownBin();
    if (!bin) return null;
    await this.start(bin);
    const v = await this.version(OWN_BASE);
    if (!v) return null;
    this.base = OWN_BASE; this.external = false;
    return { base: OWN_BASE, external: false, version: v };
  }

  private async start(bin: string): Promise<void> {
    if (this.proc && this.proc.exitCode === null) return;
    mkdirSync(this.modelsDir(), { recursive: true });
    try { if (process.platform !== 'win32') chmodSync(bin, 0o755); } catch { /* đã có quyền */ }
    this.proc = spawn(bin, ['serve'], {
      env: {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${OWN_PORT}`,
        OLLAMA_MODELS: this.modelsDir(),
        // Lời nhắc hệ thống + bộ công cụ Lark dài: ngữ cảnh mặc định (4–8k) sẽ cắt mất luật → để 32k.
        OLLAMA_CONTEXT_LENGTH: '32768',
        OLLAMA_KEEP_ALIVE: '30m',
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    this.proc.on('exit', () => { this.proc = null; });
    if (!this.quitHooked) {
      this.quitHooked = true;
      // Tắt bình thường (Cmd+Q) có will-quit; bị tắt bằng tín hiệu (pkill, cập nhật, crash) thì KHÔNG —
      // khi đó `ollama serve` mồ côi cứ chạy mãi. Bám thêm before-quit, exit và các tín hiệu.
      app.on('will-quit', () => this.stop());
      app.on('before-quit', () => this.stop());
      process.on('exit', () => this.stop());
      for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
        process.once(sig, () => { this.stop(); app.quit(); });
      }
    }
    for (let i = 0; i < 40; i++) {
      if (await this.version(OWN_BASE)) return;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  stop(): void {
    try { this.proc?.kill(); } catch { /* đã tắt */ }
    this.proc = null;
  }

  async models(): Promise<LocalAiModel[]> {
    if (!this.base) return [];
    const t = await getJson<{ models?: { name: string; size?: number }[] }>(`${this.base}/api/tags`, 3000);
    return (t?.models ?? []).map((m) => {
      const rec = RECOMMENDED.find((r) => r.id === m.name || `${r.id}:latest` === m.name);
      return { id: m.name, label: rec?.label ?? m.name, sizeGb: Math.round(((m.size ?? 0) / 1e9) * 10) / 10 };
    });
  }

  async status(activeModel?: string): Promise<LocalAiStatus> {
    const url = downloadUrl();
    const run = this.busy?.kind === 'install' ? null : await this.ensureRunning();
    const ram = ramGb();
    return {
      supported: !!url || !!run,
      installed: !!run || !!this.ownBin(),
      running: !!run,
      external: run?.external,
      version: run?.version,
      models: run ? await this.models() : [],
      activeModel,
      recommended: RECOMMENDED.map((r) => ({ ...r })),
      ramGb: ram,
      busy: this.busy,
      error: this.error,
    };
  }

  /** Tải + giải nén Ollama (nền). Gọi lại khi đang chạy thì bỏ qua. */
  install(): void {
    if (this.busy) return;
    const url = downloadUrl();
    if (!url) { this.error = 'Chưa hỗ trợ cài tự động trên hệ điều hành này — tải Ollama ở ollama.com rồi mở lại app.'; return; }
    this.error = undefined;
    this.busy = { kind: 'install', pct: 0, text: 'Đang tải Ollama…' };
    void (async () => {
      const dir = this.binDir();
      const file = join(this.root(), url.endsWith('.zip') ? 'ollama.zip' : 'ollama.tgz');
      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`Tải Ollama lỗi HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length')) || 0;
        let got = 0;
        await new Promise<void>((resolve, reject) => {
          const out = createWriteStream(file);
          out.on('error', reject);
          out.on('finish', () => resolve());
          void (async () => {
            try {
              for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
                got += chunk.length;
                if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
                if (total) this.busy = { kind: 'install', pct: Math.min(99, Math.round((got / total) * 100)), text: `Đang tải Ollama… ${Math.round(got / 1048576)}/${Math.round(total / 1048576)} MB` };
              }
              out.end();
            } catch (e) { out.destroy(); reject(e); }
          })();
        });
        this.busy = { kind: 'install', pct: 99, text: 'Đang giải nén…' };
        await new Promise<void>((resolve, reject) => {
          const args = url.endsWith('.zip') ? ['-xf', file, '-C', dir] : ['-xzf', file, '-C', dir];
          const p = spawn('tar', args, { stdio: 'ignore', windowsHide: true });
          p.on('error', reject);
          p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`Giải nén lỗi (mã ${c})`))));
        });
        rmSync(file, { force: true });
        const bin = this.ownBin();
        if (!bin) throw new Error('Không thấy tệp chạy Ollama sau khi giải nén.');
        this.busy = { kind: 'install', pct: 100, text: 'Đang khởi động AI trên máy…' };
        await this.start(bin);
        this.base = null; // để ensureRunning dò lại
      } catch (e) {
        this.error = (e as Error).message || 'Cài Ollama lỗi.';
      } finally {
        this.busy = undefined;
      }
    })();
  }

  /** Tải một mô hình (nền). */
  pull(model: string): void {
    if (this.busy) return;
    this.error = undefined;
    this.busy = { kind: 'pull', pct: 0, text: `Chuẩn bị tải ${model}…`, model };
    void (async () => {
      try {
        const run = await this.ensureRunning();
        if (!run) throw new Error('Chưa cài AI trên máy.');
        const res = await fetch(`${run.base}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: true }) });
        if (!res.ok || !res.body) throw new Error(`Tải mô hình lỗi HTTP ${res.status}`);
        const dec = new TextDecoder();
        let buf = '';
        const layers = new Map<string, { total: number; completed: number }>();
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buf += dec.decode(chunk, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const ln of lines) {
            if (!ln.trim()) continue;
            let ev: { status?: string; digest?: string; total?: number; completed?: number; error?: string };
            try { ev = JSON.parse(ln); } catch { continue; }
            if (ev.error) throw new Error(ev.error);
            if (ev.digest && ev.total) layers.set(ev.digest, { total: ev.total, completed: ev.completed ?? 0 });
            const tot = [...layers.values()].reduce((a, l) => a + l.total, 0);
            const done = [...layers.values()].reduce((a, l) => a + l.completed, 0);
            const pct = tot ? Math.min(99, Math.round((done / tot) * 100)) : 0;
            const gb = (x: number) => (x / 1e9).toFixed(1);
            this.busy = { kind: 'pull', pct, model, text: tot ? `Đang tải ${model}… ${gb(done)}/${gb(tot)} GB` : ev.status || `Đang tải ${model}…` };
          }
        }
      } catch (e) {
        this.error = (e as Error).message || 'Tải mô hình lỗi.';
      } finally {
        this.busy = undefined;
      }
    })();
  }
}

export const ollama = new OllamaManager();
