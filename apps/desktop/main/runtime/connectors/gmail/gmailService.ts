/**
 * Kết nối Gmail của Larkwave — bằng MẬT KHẨU ỨNG DỤNG (giống Social Wave `main/channels/gmail`):
 * GỬI qua SMTP (nodemailer), ĐỌC qua IMAP (imapflow). Không dùng Gmail API vì nó bắt người dùng tự dựng
 * project Google Cloud + màn hình đồng ý OAuth — việc của lập trình viên, không phải người dùng.
 *
 * Cái giá (nói rõ trong giao diện): tài khoản phải bật xác thực 2 bước mới tạo được mật khẩu ứng dụng;
 * Gmail giới hạn ~500 thư/ngày (Workspace ~2.000).
 *
 * Luật:
 *  - Mật khẩu ứng dụng MÃ HOÁ khi lưu (safeStorage = Keychain/DPAPI), không bao giờ lên renderer.
 *  - ĐỌC mở hộp thư `readOnly` — đọc không đánh dấu "đã đọc", không đổi gì trong hộp thư.
 *  - GỬI tuần tự, sàn 5 giây, trần 40 thư/giờ. Gửi hàng loạt là việc của chiến dịch Social Wave.
 *  - Câu lỗi đi qua hideSecret(): lỗi SMTP/IMAP hay chép lại lệnh AUTH.
 * Agent chỉ chạm tới đây qua công cụ `gmail_*`, và chỉ trong lượt có kỹ năng Gmail (connectorGate).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

export const GMAIL_SEND_FLOOR_MS = 5_000;
export const GMAIL_SENDS_PER_HOUR = 40;
const BODY_MAX = 60_000;

interface StoredGmail {
  email: string;
  /** Mật khẩu ứng dụng: base64 của bản mã hoá safeStorage, hoặc `PLAIN:` khi máy không có kho khoá. */
  pass: string;
  name?: string;
  addedAt: string;
}

export interface GmailAccountView {
  email: string;
  name?: string;
  addedAt: string;
  encrypted: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Mật khẩu ứng dụng Google: 16 chữ cái, hay được dán kèm dấu cách theo nhóm 4. */
export function normalizeAppPassword(raw: string): string {
  return String(raw || '').replace(/\s+/g, '');
}

export function isGmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/** Xoá mật khẩu (kể cả dạng có dấu cách) và chuỗi AUTH base64 khỏi câu lỗi. */
export function hideSecret(message: string, secrets: string[]): string {
  let m = String(message || '');
  for (const s of secrets.filter(Boolean)) {
    m = m.split(s).join('•••');
    const spaced = s.replace(/(.{4})(?=.)/g, '$1 ');
    m = m.split(spaced).join('•••');
  }
  return m.replace(/AUTH (PLAIN|LOGIN)\s+\S+/gi, 'AUTH $1 •••');
}

/** Câu lỗi người dùng hiểu được cho lỗi đăng nhập SMTP/IMAP của Google. */
export function friendlyGmailError(err: unknown, secrets: string[] = []): string {
  const raw = hideSecret((err as { response?: string; message?: string })?.response || (err as Error)?.message || String(err), secrets);
  if (/535|534|Invalid credentials|Username and Password not accepted|AUTHENTICATIONFAILED|authentication failed/i.test(raw)) {
    return 'Gmail từ chối đăng nhập: cần MẬT KHẨU ỨNG DỤNG (16 ký tự, tạo ở myaccount.google.com/apppasswords — tài khoản phải bật xác thực 2 bước), không phải mật khẩu Gmail thường.';
  }
  if (/IMAP access is disabled|\[ALERT\].*IMAP|Web login required/i.test(raw)) {
    return 'Gmail chưa cho truy cập IMAP với tài khoản này. Vào Gmail → Cài đặt → Chuyển tiếp và POP/IMAP → bật IMAP, rồi thử lại.';
  }
  if (/550|5\.4\.5|Daily user sending limit exceeded|quota/i.test(raw)) return 'Gmail báo đã chạm giới hạn gửi trong ngày. Đợi 24 giờ hoặc dùng tài khoản khác.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|network/i.test(raw)) return `Không kết nối được tới Gmail (mạng). Chi tiết: ${raw.slice(0, 200)}`;
  return `Gmail báo lỗi: ${raw.slice(0, 300)}`;
}

/** Chữ thuần từ HTML (thư chỉ có bản HTML). */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Phần chữ (text/plain trước, rồi text/html) và danh sách tệp đính kèm từ bodyStructure của IMAP. */
export function pickParts(node: any): { textPart?: string; htmlPart?: string; attachments: { name: string; size: number; type: string }[] } {
  const out: { textPart?: string; htmlPart?: string; attachments: { name: string; size: number; type: string }[] } = { attachments: [] };
  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n.childNodes) && n.childNodes.length) return n.childNodes.forEach(walk);
    const type = String(n.type || '').toLowerCase();
    const name = n.dispositionParameters?.filename || n.parameters?.name;
    const isAttach = String(n.disposition || '').toLowerCase() === 'attachment' || (!!name && !type.startsWith('text/'));
    if (isAttach) out.attachments.push({ name: String(name || 'tệp'), size: Number(n.size) || 0, type });
    else if (type === 'text/plain' && !out.textPart) out.textPart = n.part || '1';
    else if (type === 'text/html' && !out.htmlPart) out.htmlPart = n.part || '1';
  };
  walk(node);
  return out;
}

class GmailService {
  private lastSendAt = 0;
  private readonly sent = new Map<string, number[]>();
  private chain: Promise<unknown> = Promise.resolve();

  private file(): string {
    const dir = join(app.getPath('userData'), 'connectors');
    mkdirSync(dir, { recursive: true });
    return join(dir, 'gmail-accounts.json');
  }
  private load(): StoredGmail[] {
    try {
      const f = this.file();
      return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as StoredGmail[]) : [];
    } catch {
      return [];
    }
  }
  private save(list: StoredGmail[]): void {
    writeFileSync(this.file(), JSON.stringify(list, null, 2), { mode: 0o600 });
  }
  private seal(pass: string): string {
    try {
      if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(pass).toString('base64');
    } catch {
      /* rơi xuống dạng thường */
    }
    console.warn('[gmail] Hệ điều hành không có kho khoá an toàn — mật khẩu ứng dụng lưu dạng thường');
    return `PLAIN:${pass}`;
  }
  private open(sealed: string): string {
    if (sealed.startsWith('PLAIN:')) return sealed.slice(6);
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'));
  }

  list(): GmailAccountView[] {
    return this.load().map((a) => ({ email: a.email, name: a.name, addedAt: a.addedAt, encrypted: !a.pass.startsWith('PLAIN:') }));
  }

  /** Thêm (hoặc thay) một tài khoản — kiểm THẬT cả SMTP lẫn IMAP trước khi lưu. */
  async add(input: { email: string; appPassword: string; name?: string }): Promise<GmailAccountView[]> {
    const email = String(input.email || '').trim().toLowerCase();
    const pass = normalizeAppPassword(input.appPassword);
    if (!isGmailAddress(email)) throw new Error('Địa chỉ Gmail không hợp lệ.');
    if (pass.length < 12) throw new Error('Mật khẩu ứng dụng Google có 16 ký tự (tạo ở myaccount.google.com/apppasswords).');
    await this.verify(email, pass);
    const list = this.load().filter((a) => a.email !== email);
    list.push({ email, pass: this.seal(pass), name: input.name?.trim() || undefined, addedAt: new Date().toISOString() });
    this.save(list);
    return this.list();
  }

  remove(email: string): GmailAccountView[] {
    this.save(this.load().filter((a) => a.email !== String(email || '').trim().toLowerCase()));
    return this.list();
  }

  /** Kiểm SONG SONG gửi (SMTP) và đọc (IMAP): kỹ năng cần cả hai, và báo một lần cho người dùng. */
  async verify(email: string, pass: string): Promise<void> {
    const smtp = (async () => {
      const nodemailer = await import('nodemailer');
      const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: email, pass } });
      try {
        await t.verify();
      } catch (e) {
        throw new Error(friendlyGmailError(e, [pass]));
      } finally {
        t.close();
      }
    })();
    const imap = (async () => {
      const c = await this.imap(email, pass);
      await c.logout().catch(() => undefined);
    })();
    // Cả hai cùng lỗi thì báo CẢ HAI câu (khác nhau) — báo một câu là che mất lỗi kia (vd đọc hỏng vì IMAP tắt).
    const errs = (await Promise.allSettled([smtp, imap]))
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String((r.reason as Error)?.message || r.reason));
    if (errs.length) throw new Error([...new Set(errs)].join(' · '));
  }

  private account(email?: string): { email: string; pass: string; name?: string } {
    const list = this.load();
    if (!list.length) throw new Error('Chưa kết nối Gmail. Người dùng bấm nút «Kết nối Gmail» (hiện dưới câu trả lời / nút khiên «Kiểm tra» trên thanh đầu), nhập địa chỉ và mật khẩu ứng dụng.');
    const a = email ? list.find((x) => x.email === String(email).trim().toLowerCase()) : list[0];
    if (!a) throw new Error(`Không thấy Gmail "${email}". Đang có: ${list.map((x) => x.email).join(', ')}.`);
    return { email: a.email, pass: this.open(a.pass), name: a.name };
  }

  private async imap(email: string, pass: string) {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: email, pass }, logger: false, emitLogs: false });
    try {
      await client.connect();
    } catch (e) {
      throw new Error(friendlyGmailError(e, [pass]));
    }
    return client;
  }

  /** Mở hộp thư CHỈ ĐỌC: 'inbox' hoặc 'all' (Tất cả thư, theo cờ \All). */
  private async openBox(client: any, box: 'inbox' | 'all' = 'inbox'): Promise<string> {
    let path = 'INBOX';
    if (box === 'all') {
      const list = await client.list();
      path = list.find((m: any) => m.specialUse === '\\All')?.path || 'INBOX';
    }
    await client.mailboxOpen(path, { readOnly: true });
    return path;
  }

  /** Tìm thư. `query` theo cú pháp ô tìm của Gmail (from:, subject:, has:attachment, newer_than:7d…). */
  async search(opts: { account?: string; query?: string; limit?: number; unreadOnly?: boolean; mailbox?: 'inbox' | 'all' }) {
    const acc = this.account(opts.account);
    const client = await this.imap(acc.email, acc.pass);
    try {
      const path = await this.openBox(client, opts.mailbox);
      const gm = [opts.query?.trim(), opts.unreadOnly ? 'is:unread' : ''].filter(Boolean).join(' ');
      const uids = ((await client.search(gm ? { gmraw: gm } : { all: true }, { uid: true })) || []) as number[];
      const pick = uids.sort((a, b) => b - a).slice(0, Math.max(1, Math.min(opts.limit ?? 20, 50)));
      const items: unknown[] = [];
      if (pick.length) {
        for await (const m of client.fetch(pick.join(','), { uid: true, envelope: true, flags: true, internalDate: true, size: true }, { uid: true })) {
          const env = m.envelope || {};
          items.push({
            id: m.uid,
            from: (env.from || []).map((x: any) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(', '),
            to: (env.to || []).map((x: any) => x.address).join(', '),
            subject: env.subject || '(không tiêu đề)',
            date: (() => {
              const d = m.internalDate || env.date;
              return d ? new Date(d).toISOString() : null;
            })(),
            unread: !(m.flags && m.flags.has && m.flags.has('\\Seen')),
            size: m.size,
          });
        }
      }
      items.sort((a: any, b: any) => b.id - a.id);
      return { account: acc.email, mailbox: path, query: gm || '(tất cả)', total: uids.length, messages: items };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  /** Đọc một thư theo `id` (UID trả về từ gmail_search, cùng hộp thư). Không đánh dấu đã đọc. */
  async read(opts: { account?: string; id: number; mailbox?: 'inbox' | 'all' }) {
    const acc = this.account(opts.account);
    const client = await this.imap(acc.email, acc.pass);
    try {
      await this.openBox(client, opts.mailbox);
      const m: any = await client.fetchOne(String(opts.id), { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true });
      if (!m) throw new Error(`Không thấy thư id ${opts.id} trong hộp thư này (id lấy từ gmail_search, cùng "mailbox").`);
      const parts = pickParts(m.bodyStructure);
      let text = '';
      const part = parts.textPart || parts.htmlPart;
      if (part) {
        const dl = await client.download(String(opts.id), part, { uid: true });
        const chunks: Buffer[] = [];
        let n = 0;
        for await (const c of dl.content as AsyncIterable<Buffer>) {
          chunks.push(c);
          n += c.length;
          if (n > BODY_MAX * 2) break;
        }
        text = Buffer.concat(chunks).toString('utf8');
        if (!parts.textPart) text = htmlToText(text);
      }
      const env = m.envelope || {};
      return {
        account: acc.email,
        id: m.uid,
        from: (env.from || []).map((x: any) => (x.name ? `${x.name} <${x.address}>` : x.address)).join(', '),
        to: (env.to || []).map((x: any) => x.address).join(', '),
        cc: (env.cc || []).map((x: any) => x.address).join(', '),
        subject: env.subject || '(không tiêu đề)',
        date: m.internalDate ? new Date(m.internalDate).toISOString() : null,
        text: text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}\n…(đã cắt, thư dài ${text.length} ký tự)` : text,
        attachments: parts.attachments,
      };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  /** Gửi một thư chữ. Tuần tự, sàn 5 giây, trần 40 thư/giờ/tài khoản. */
  send(opts: { account?: string; to: string; cc?: string; subject: string; text: string }) {
    const job = this.chain.then(() => this.sendNow(opts));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async sendNow(opts: { account?: string; to: string; cc?: string; subject: string; text: string }) {
    const acc = this.account(opts.account);
    const to = String(opts.to || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const cc = String(opts.cc || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (!to.length || ![...to, ...cc].every(isGmailAddress)) throw new Error('Địa chỉ người nhận không hợp lệ.');
    if (to.length + cc.length > 10) throw new Error('Tối đa 10 người nhận mỗi thư. Gửi nhiều hơn thì dùng chiến dịch của Social Wave.');
    if (!String(opts.subject || '').trim()) throw new Error('Thiếu tiêu đề thư.');
    if (!String(opts.text || '').trim()) throw new Error('Thư trống.');
    const now = Date.now();
    const log = (this.sent.get(acc.email) ?? []).filter((t) => now - t < 3_600_000);
    if (log.length >= GMAIL_SENDS_PER_HOUR) throw new Error(`Đã gửi ${log.length} thư trong 1 giờ qua — dừng để Google không khoá gửi.`);
    const wait = this.lastSendAt + GMAIL_SEND_FLOOR_MS - now;
    if (wait > 0) await sleep(wait);
    const nodemailer = await import('nodemailer');
    const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: acc.email, pass: acc.pass } });
    try {
      const info = await t.sendMail({
        from: acc.name ? { name: acc.name, address: acc.email } : acc.email,
        to,
        ...(cc.length ? { cc } : {}),
        subject: String(opts.subject).trim(),
        text: String(opts.text),
      });
      this.lastSendAt = Date.now();
      log.push(this.lastSendAt);
      this.sent.set(acc.email, log);
      return { ok: true, account: acc.email, to, cc, subject: String(opts.subject).trim(), messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
    } catch (e) {
      throw new Error(friendlyGmailError(e, [acc.pass]));
    } finally {
      t.close();
    }
  }
}

export const gmailService = new GmailService();
