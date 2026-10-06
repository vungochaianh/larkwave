import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { createHash, createDecipheriv, timingSafeEqual } from 'node:crypto';

/**
 * Local Lark Event Subscription listener. The desktop binds it to 127.0.0.1; the
 * user exposes it via a tunnel (cloudflared/ngrok) and sets that public URL as the
 * Lark app's Event Subscription Request URL. Handles the url_verification
 * challenge, AES-256-CBC decryption (Encrypt Key), X-Lark-Signature verification,
 * and dispatches `im.message.receive_v1` text events to `onMessage`.
 *
 * Lark requires a <3s ack, so we respond 200 immediately and process async.
 */

export interface WebhookConfig {
  port: number;
  encryptKey?: string;
  verificationToken?: string;
}

export interface BotMessage {
  chatId: string;
  text: string;
  senderId?: string;
  eventId?: string;
}

/** Counters surfaced to the UI so the bot's health is visible (it's a write-only
 * listener otherwise — a silent decrypt/signature failure looks identical to "no traffic"). */
export interface WebhookStats {
  received: number;
  processed: number;
  deduped: number;
  failed: number;
  lastMessageAt?: number;
  lastError?: string;
}

export class LarkWebhook {
  private server: Server | null = null;
  private seen = new Set<string>();
  private statsData: WebhookStats = { received: 0, processed: 0, deduped: 0, failed: 0 };

  constructor(private readonly onMessage: (m: BotMessage) => void) {}

  isRunning(): boolean {
    return !!this.server;
  }

  stats(): WebhookStats {
    return { ...this.statsData };
  }

  /** Record + log a processing failure so the cause is debuggable (the bot is behind a
   * tunnel, so a 401/decrypt error is otherwise invisible to the user). */
  private fail(stage: string, err?: unknown): void {
    this.statsData.failed++;
    this.statsData.lastError = err ? `${stage}: ${(err as Error)?.message || String(err)}` : stage;
    console.warn(`[lark] webhook ${stage} failed:`, err ?? '');
  }

  start(cfg: WebhookConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stopSync();
      const server = createServer((req, res) => {
        this.handle(req, res, cfg).catch(() => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
      });
      server.once('error', reject);
      server.listen(cfg.port, '127.0.0.1', () => {
        this.server = server;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  private stopSync(): void {
    try {
      this.server?.close();
    } catch {
      /* ignore */
    }
    this.server = null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse, cfg: WebhookConfig): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    this.statsData.received++;
    const raw = await readBody(req);

    // Verify X-Lark-Signature when an Encrypt Key is configured. The signature is
    // REQUIRED (not just checked-when-present): a missing signature on a public webhook
    // is a forged/unsigned event and must be rejected — otherwise anyone who finds the
    // tunnel URL could POST a crafted event (e.g. a `/run` command).
    if (cfg.encryptKey) {
      const ts = header(req, 'x-lark-request-timestamp');
      const nonce = header(req, 'x-lark-request-nonce');
      const sig = header(req, 'x-lark-signature');
      if (!ts || !nonce || !sig) {
        this.fail('missing signature headers (Encrypt Key bật nhưng không có chữ ký)');
        res.writeHead(401).end();
        return;
      }
      const expected = createHash('sha256').update(`${ts}${nonce}${cfg.encryptKey}${raw}`).digest('hex');
      if (!safeEqualHex(expected, sig)) {
        this.fail('signature mismatch (kiểm tra Encrypt Key)');
        res.writeHead(401).end();
        return;
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      this.fail('json parse', e);
      res.writeHead(400).end();
      return;
    }
    if (cfg.encryptKey) {
      // With an Encrypt Key set, Lark encrypts every event body. A plaintext payload is
      // therefore forged (or a console/app misconfig) — reject it rather than process it.
      if (!payload.encrypt) {
        this.fail('expected encrypted payload (Encrypt Key bật)');
        res.writeHead(400).end();
        return;
      }
      try {
        payload = JSON.parse(decryptAes(payload.encrypt, cfg.encryptKey));
      } catch (e) {
        this.fail('decrypt (kiểm tra Encrypt Key)', e);
        res.writeHead(400).end();
        return;
      }
    }

    // URL verification handshake.
    if (payload.type === 'url_verification') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ challenge: payload.challenge }));
      return;
    }

    const token = payload.header?.token ?? payload.token;
    if (cfg.verificationToken && token && token !== cfg.verificationToken) {
      res.writeHead(401).end();
      return;
    }

    // Ack now; process the event asynchronously.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');

    const eventId: string | undefined = payload.header?.event_id;
    if (eventId) {
      if (this.seen.has(eventId)) {
        this.statsData.deduped++; // dedupe Lark retries
        return;
      }
      this.seen.add(eventId);
      if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-200));
    }

    if (payload.header?.event_type === 'im.message.receive_v1') {
      const msg = payload.event?.message;
      if (msg?.message_type === 'text' && msg.chat_id) {
        let text = '';
        try {
          text = JSON.parse(msg.content)?.text ?? '';
        } catch {
          /* ignore */
        }
        if (text.trim()) {
          this.statsData.processed++;
          this.statsData.lastMessageAt = Date.now();
          this.onMessage({
            chatId: msg.chat_id,
            text: text.trim(),
            senderId: payload.event?.sender?.sender_id?.open_id,
            eventId,
          });
        }
      }
    }
  }
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Lark AES: key = sha256(encryptKey); payload = base64( iv(16) || ciphertext ), PKCS#7. */
function decryptAes(encryptB64: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey).digest();
  const data = Buffer.from(encryptB64, 'base64');
  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c.toString('utf8')));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}
