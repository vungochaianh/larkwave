import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { APIA_BASE } from '@larkwave/core';
import type { AgentClientStatus, LarkChatEvent, LarkChatInput } from '@larkwave/core';
import type {
  AgentCommand,
  AgentTokenResponse,
  AgentWebhookTokenInfo,
  LarkChatRelayInput,
  PostRemoteTaskEvent,
  RemoteTask,
  RemoteTaskEventItem,
  TelegramBindingInfo,
  TelegramLinkResponse,
  TokenTestResult,
  UpdateTokenNotifyInput,
} from '@larkwave/shared';
import type { LocalRuntimeAdapter } from './localAdapter';
import { getLarkWebSession } from './lark/larkWebSession';

/**
 * Remote control ("Điều khiển từ xa") — the DESKTOP side of the phone → server →
 * desktop relay. When enabled, this client holds a long-lived SSE command stream
 * open to the server (`/agent/stream`); each pushed RemoteTask runs as ONE Trợ lý AI turn
 * on the local CLI runner (larkChat scope 'general', read-only 'ask' mode — nobody is
 * there to confirm a write) and its progress is POSTed back to `/agent/tasks/:id/events`,
 * which fan out to the user's phone thread (and the webhook/Telegram notify target).
 * The same SSE stream also carries the Lark relay commands (re-login, CMS sync, chat, RPC).
 *
 * OFF by default; needs the app open + the Larkwave account JWT (supplied by the
 * renderer on every status/setEnabled call). The JWT is held in memory only.
 */

interface PersistedSettings {
  enabled: boolean;
  deviceName: string;
}

export class AgentClient {
  private settings: PersistedSettings;
  private token: string | null = null;
  private webhookToken: string | null = null;
  private webhookTokens: AgentWebhookTokenInfo[] = [];
  private telegramBindings: TelegramBindingInfo[] = [];
  private connected = false;
  private error: string | undefined;
  private recent: AgentClientStatus['recent'] = [];
  private abort: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = 1000;
  /** True only when WE abort the stream (user toggled off) → don't auto-reconnect. */
  private intentionalClose = false;
  /** Idle watchdog: the server pings every 15s; if no bytes for >45s the socket is
   *  half-open (sleep/NAT drop) → force a reconnect instead of looking "connected". */
  private idleTimer: NodeJS.Timeout | null = null;
  private lastRecv = 0;
  private readonly platform = process.platform;
  /** The one in-flight relay chat turn (phone/web → this desktop's CLI). Confirm/answer/cancel
   *  from the phone target it; a new run cancels the prior. */
  private activeChatReq: { requestId: string; gen: AsyncIterator<unknown> } | null = null;

  constructor(
    private readonly runtime: LocalRuntimeAdapter,
    private readonly userDataDir: string,
    private readonly onStatus: (s: AgentClientStatus) => void,
  ) {
    this.settings = this.load();
  }

  // ── persistence ────────────────────────────────────────────────────────────
  private file(): string {
    const d = join(this.userDataDir, 'agent');
    mkdirSync(d, { recursive: true });
    return join(d, 'settings.json');
  }
  private load(): PersistedSettings {
    try {
      const p = this.file();
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, 'utf8')) as Partial<PersistedSettings>;
        return { enabled: !!j.enabled, deviceName: j.deviceName || hostname() };
      }
    } catch {
      /* fall through to defaults */
    }
    return { enabled: false, deviceName: hostname() };
  }
  private save(): void {
    try {
      writeFileSync(this.file(), JSON.stringify(this.settings, null, 2));
    } catch {
      /* best effort */
    }
  }

  // The account JWT is a SECRET → persist it encrypted (OS keychain via safeStorage)
  // so remote control survives an app restart without the user re-opening Settings.
  // safeStorage needs app 'ready', so token I/O happens via bootstrap()/setToken(),
  // never in the constructor.
  private tokenFile(): string {
    return join(this.userDataDir, 'agent', 'token.bin');
  }
  private persistToken(token: string): void {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        mkdirSync(join(this.userDataDir, 'agent'), { recursive: true });
        writeFileSync(this.tokenFile(), safeStorage.encryptString(token));
      }
    } catch {
      /* no keychain → don't persist a JWT in plaintext; renderer re-forwards it */
    }
  }
  private loadPersistedToken(): string | null {
    try {
      const p = this.tokenFile();
      if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(readFileSync(p));
    } catch {
      return null;
    }
  }
  private clearPersistedToken(): void {
    try {
      rmSync(this.tokenFile(), { force: true });
    } catch {
      /* ignore */
    }
  }
  /** Update the in-memory JWT + persist it when it actually changed. */
  private setToken(token?: string): void {
    if (!token || token === this.token) return;
    this.token = token;
    this.persistToken(token);
  }

  /** Called ONCE after app 'ready' (from background.ts): restore the persisted
   *  token and reconnect if remote control was left enabled. This is what makes
   *  an idle, just-launched machine start receiving commands on its own. */
  bootstrap(): void {
    if (!this.token) {
      const t = this.loadPersistedToken();
      if (t) this.token = t;
    }
    if (this.settings.enabled && this.token && !this.connected && !this.abort) void this.connect();
  }

  // ── public status surface ────────────────────────────────────────────────────
  private snapshot(): AgentClientStatus {
    return {
      enabled: this.settings.enabled,
      connected: this.connected,
      signedIn: !!this.token,
      deviceName: this.settings.deviceName,
      webhookToken: this.webhookToken,
      webhookTokens: this.webhookTokens,
      telegramBindings: this.telegramBindings,
      recent: this.recent.slice(0, 10),
      error: this.error,
    };
  }
  private emit(): void {
    try {
      this.onStatus(this.snapshot());
    } catch {
      /* the window may be gone */
    }
  }

  /** Renderer status poll — optionally (re)stores the account JWT it forwards. */
  status(token?: string): AgentClientStatus {
    this.setToken(token);
    // If we're enabled + signed in but not connected (e.g. the token just arrived), connect.
    if (this.settings.enabled && this.token && !this.connected && !this.abort) void this.connect();
    return this.snapshot();
  }

  /** Turn remote control on/off. On → connect (needs a token); off → disconnect. */
  async setEnabled(on: boolean, token?: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.settings.enabled = on;
    this.save();
    if (on && this.token) await this.connect();
    else if (!on) this.disconnect();
    return this.snapshot();
  }

  /** (Re)generate the personal webhook token (shown once). */
  async regenerateToken(token: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.error = undefined;
    try {
      const res = await fetch(`${APIA_BASE}/agent/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AgentTokenResponse;
      this.webhookToken = data.token;
    } catch (e) {
      this.error = `Không tạo được token webhook: ${(e as Error).message}`;
    }
    this.emit();
    return this.snapshot();
  }

  /** Create a NAMED webhook token (per project). Raw token shown once in `webhookToken`. */
  async createToken(name: string, token: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.error = undefined;
    try {
      const res = await fetch(`${APIA_BASE}/agent/tokens`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AgentTokenResponse;
      this.webhookToken = data.token;
      await this.fetchTokens();
    } catch (e) {
      this.error = `Không tạo được token: ${(e as Error).message}`;
    }
    this.emit();
    return this.snapshot();
  }

  /** Refresh the named-token list (and Telegram bindings) from the server. */
  async listTokens(token?: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.webhookToken = null; // don't keep showing a stale one-time raw token on a plain refresh
    await Promise.all([this.fetchTokens(), this.fetchTelegramBindings()]);
    this.emit();
    return this.snapshot();
  }

  /** Revoke one named token. */
  async deleteToken(id: string, token?: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.error = undefined;
    try {
      const res = await fetch(`${APIA_BASE}/agent/tokens/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.fetchTokens();
    } catch (e) {
      this.error = `Không xoá được token: ${(e as Error).message}`;
    }
    this.emit();
    return this.snapshot();
  }

  private async fetchTokens(): Promise<void> {
    if (!this.token) {
      this.webhookTokens = [];
      return;
    }
    try {
      const res = await fetch(`${APIA_BASE}/agent/tokens`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.ok) this.webhookTokens = (await res.json()) as AgentWebhookTokenInfo[];
    } catch {
      /* keep the previous list on a transient error */
    }
  }

  /** Test a token (no task is run): token valid for the user + a device online now. */
  async testToken(id: string, token?: string): Promise<TokenTestResult> {
    this.setToken(token);
    if (!this.token) return { tokenValid: false, deviceOnline: false };
    try {
      const res = await fetch(`${APIA_BASE}/agent/tokens/${encodeURIComponent(id)}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as TokenTestResult;
    } catch {
      return { tokenValid: false, deviceOnline: false };
    }
  }

  /** Set/clear a token's outbound notify target; refreshes the token list. */
  async updateTokenNotify(
    id: string,
    input: UpdateTokenNotifyInput,
    token?: string,
  ): Promise<AgentClientStatus> {
    this.setToken(token);
    this.error = undefined;
    try {
      const res = await fetch(`${APIA_BASE}/agent/tokens/${encodeURIComponent(id)}/notify`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.fetchTokens();
    } catch (e) {
      this.error = `Không lưu được cấu hình báo: ${(e as Error).message}`;
    }
    this.emit();
    return this.snapshot();
  }

  /** Mint a one-time Telegram bind code + deep link (not stored in status). */
  async telegramLink(token?: string): Promise<TelegramLinkResponse> {
    this.setToken(token);
    const res = await fetch(`${APIA_BASE}/agent/telegram/link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as TelegramLinkResponse;
  }

  /** Refresh the list of bound Telegram chats. */
  async listTelegramBindings(token?: string): Promise<AgentClientStatus> {
    this.setToken(token);
    await this.fetchTelegramBindings();
    this.emit();
    return this.snapshot();
  }

  /** Unbind a Telegram chat. */
  async deleteTelegramBinding(id: string, token?: string): Promise<AgentClientStatus> {
    this.setToken(token);
    this.error = undefined;
    try {
      const res = await fetch(`${APIA_BASE}/agent/telegram/bindings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.fetchTelegramBindings();
    } catch (e) {
      this.error = `Không huỷ được liên kết Telegram: ${(e as Error).message}`;
    }
    this.emit();
    return this.snapshot();
  }

  private async fetchTelegramBindings(): Promise<void> {
    if (!this.token) {
      this.telegramBindings = [];
      return;
    }
    try {
      const res = await fetch(`${APIA_BASE}/agent/telegram/bindings`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.ok) this.telegramBindings = (await res.json()) as TelegramBindingInfo[];
    } catch {
      /* keep the previous list on a transient error */
    }
  }

  // ── command stream ───────────────────────────────────────────────────────────
  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearIdleWatch();
    if (this.abort) {
      this.intentionalClose = true;
      this.abort.abort();
      this.abort = null;
    }
    this.connected = false;
    this.emit();
  }

  private startIdleWatch(controller: AbortController): void {
    this.clearIdleWatch();
    this.lastRecv = Date.now();
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastRecv > 45000 && !controller.signal.aborted) controller.abort();
    }, 20000);
  }
  private clearIdleWatch(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.settings.enabled || !this.token) return;
    if (this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** Open the long-lived SSE command stream + dispatch incoming AgentCommands. */
  private async connect(): Promise<void> {
    if (!this.settings.enabled || !this.token) return;
    if (this.abort) return; // already connected/connecting
    this.error = undefined;
    this.intentionalClose = false;
    const controller = new AbortController();
    this.abort = controller;
    const url =
      `${APIA_BASE}/agent/stream` +
      `?name=${encodeURIComponent(this.settings.deviceName)}` +
      `&platform=${encodeURIComponent(this.platform)}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      // Auth failure ≠ a transient blip: the JWT expired. Drop it (don't loop
      // forever on backoff) and wait for the renderer to forward a fresh one.
      if (res.status === 401 || res.status === 403) {
        this.connected = false;
        this.abort = null;
        this.token = null;
        this.clearPersistedToken();
        this.error = 'Phiên đăng nhập đã hết hạn — mở app và đăng nhập lại để bật điều khiển từ xa.';
        this.emit();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      this.connected = true;
      this.backoff = 1000; // reset on a clean connect
      this.startIdleWatch(controller);
      this.emit();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // Read SSE frames (separated by a blank line); parse `data:` lines as AgentCommand JSON.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.lastRecv = Date.now(); // any byte (incl. ': ping') keeps the watchdog happy
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          this.handleFrame(frame);
        }
      }
      // Stream ended cleanly (server closed) — reconnect while still enabled.
      this.clearIdleWatch();
      this.connected = false;
      this.abort = null;
      this.emit();
      this.scheduleReconnect();
    } catch (e) {
      this.clearIdleWatch();
      this.connected = false;
      this.abort = null;
      if (controller.signal.aborted && this.intentionalClose) {
        // User toggled remote control off — stay disconnected.
        this.emit();
        return;
      }
      // Network drop OR an idle-watchdog abort (half-open socket) — reconnect.
      this.error = `Mất kết nối điều khiển từ xa: ${(e as Error).message}`;
      this.emit();
      this.scheduleReconnect();
    }
  }

  private handleFrame(frame: string): void {
    for (const line of frame.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const json = s.slice(5).trim();
      if (!json) continue;
      let cmd: AgentCommand;
      try {
        cmd = JSON.parse(json) as AgentCommand;
      } catch {
        continue;
      }
      if (cmd.type === 'task') void this.enqueue(cmd.task);
      else if (cmd.type === 'larkLogin') void this.handleLarkLogin(cmd.requestId);
      else if (cmd.type === 'cmsSyncRun') void this.handleCmsSyncRun(cmd.requestId, cmd.jobIds);
      else if (cmd.type === 'larkChatRun') void this.handleLarkChatRun(cmd.requestId, cmd.input);
      else if (cmd.type === 'larkChatConfirm') void this.runtime.larkConfirmTool?.(cmd.callId, cmd.decision).catch(() => undefined);
      else if (cmd.type === 'larkChatAnswer') void this.runtime.larkAnswerAsk?.(cmd.callId, cmd.answer).catch(() => undefined);
      else if (cmd.type === 'larkChatCancel') this.cancelLarkChat(cmd.requestId);
      else if (cmd.type === 'larkRpc') void this.handleLarkRpc(cmd.requestId, cmd.method, cmd.args);
      // 'cancel' / 'ping' acknowledged implicitly; tasks run sequentially below.
    }
  }

  /** Phone asked us to re-login Lark: open the login window, stream the QR up, and on success
   *  refresh the CMS connector sessions so the jobs come back alive. */
  private async handleLarkLogin(requestId: string): Promise<void> {
    const post = (body: Record<string, unknown>) =>
      fetch(`${APIA_BASE}/agent/lark-login/qr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, ...body }),
      }).catch(() => undefined);
    try {
      const result = await getLarkWebSession().phoneLogin((image) => void post({ status: 'qr', image }));
      if (result === 'success') {
        await post({ status: 'success', message: 'Đã đăng nhập Lark — đang làm mới phiên đồng bộ.' });
        await this.runtime.cmsSyncRefreshAll?.().catch(() => undefined);
      } else {
        await post({
          status: result,
          message: result === 'timeout' ? 'Hết thời gian chờ quét QR.' : 'Không đăng nhập được.',
        });
      }
    } catch (e) {
      await post({ status: 'failed', message: (e as Error).message });
    }
  }

  /** Phone/web asked this desktop to run ONE chat turn (Trợ lý AI or Lark) through its local CLI.
   *  Drive larkService.chat and stream every event up; a gated write / ask_user surfaces as a
   *  tool_call / ask_user event the phone answers via larkChatConfirm / larkChatAnswer. */
  private async handleLarkChatRun(requestId: string, input: LarkChatRelayInput): Promise<void> {
    if (!this.runtime.larkChat) return;
    const post = (event: Record<string, unknown>) =>
      fetch(`${APIA_BASE}/agent/lark-chat/event`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, event }),
      }).catch(() => undefined);
    this.cancelLarkChat(); // one relay chat at a time on this device
    const chatInput: LarkChatInput = {
      prompt: input.prompt,
      mode: input.mode,
      scope: input.scope,
      activeBases: input.activeBases as LarkChatInput['activeBases'],
      runner: input.runner,
      model: input.model,
      sessionId: input.sessionId,
      resume: input.resume,
      source: 'relay', // a relay turn drives THIS desktop → show "đang chạy từ xa" + block concurrent
    };
    try {
      const gen = this.runtime.larkChat(chatInput)[Symbol.asyncIterator]() as AsyncIterator<unknown>;
      this.activeChatReq = { requestId, gen };
      for (;;) {
        const { value, done } = await gen.next();
        if (done) break;
        await post(value as Record<string, unknown>); // larkService already emits a final {type:'done'}
      }
    } catch (e) {
      await post({ type: 'error', message: (e as Error)?.message || 'Lỗi khi chạy chat.' });
    } finally {
      if (this.activeChatReq?.requestId === requestId) this.activeChatReq = null;
    }
  }

  /** Stop the running relay chat (phone "Dừng", or superseded by a new run). */
  private cancelLarkChat(requestId?: string): void {
    const a = this.activeChatReq;
    if (!a || (requestId && a.requestId !== requestId)) return;
    try { void a.gen.return?.(undefined); } catch { /* ignore */ }
    this.activeChatReq = null;
  }

  /** Lark runtime methods the WEB may invoke over the relay (read/config for the shared LarkChat
   *  screen). ALLOW-LIST — never dispatch an arbitrary method name to the runtime; write actions on
   *  Bases still go through the confirmed larkChat turn, not RPC. */
  private static readonly LARK_RPC_METHODS = new Set<string>([
    'larkStatus', 'larkCheckConnection', 'larkListBases', 'larkListTables', 'larkAddBase',
    'larkBaseSnapshot', 'larkSessions', 'larkNewSession', 'larkSwitchSession', 'larkSaveSession',
    'larkDeleteSession', 'larkShareSession', 'larkUnshareSession', 'larkHandoffSession',
    'larkSetAgentPrefs', 'larkSetAutoApprove', 'larkSaveNotes', 'larkSummarize', 'larkBackupSync',
  ]);

  /** Web asked the desktop to run ONE allow-listed Lark runtime method + return its result, so the
   *  shared LarkChat screen (base picker, sessions, prefs…) works over the relay. */
  private async handleLarkRpc(requestId: string, method: string, args: unknown[]): Promise<void> {
    const post = (body: Record<string, unknown>) =>
      fetch(`${APIA_BASE}/agent/lark-rpc/result`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, ...body }),
      }).catch(() => undefined);
    if (!AgentClient.LARK_RPC_METHODS.has(method)) {
      await post({ ok: false, error: `Phương thức không được phép: ${method}` });
      return;
    }
    try {
      const fn = (this.runtime as unknown as Record<string, ((...a: unknown[]) => unknown) | undefined>)[method];
      if (typeof fn !== 'function') {
        await post({ ok: false, error: `Máy tính chưa hỗ trợ "${method}" — hãy cập nhật app.` });
        return;
      }
      const result = await fn.apply(this.runtime, Array.isArray(args) ? args : []);
      await post({ ok: true, result: result ?? null });
    } catch (e) {
      await post({ ok: false, error: (e as Error)?.message || 'Lỗi khi chạy Lark RPC.' });
    }
  }

  /** Phone/web asked us to RUN the CMS Bitable sync for some jobs with our LIVE Lark session
   *  (Approach B). Run SEQUENTIALLY (one shared hidden Lark window) + stream progress up. */
  private async handleCmsSyncRun(requestId: string, jobIds: string[]): Promise<void> {
    const post = (body: Record<string, unknown>) =>
      fetch(`${APIA_BASE}/agent/cms-sync/result`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, ...body }),
      }).catch(() => undefined);
    const ids = Array.isArray(jobIds) ? jobIds.filter(Boolean) : [];
    if (!ids.length) {
      await post({ kind: 'done', total: 0, ok: 0, failed: 0, lines: ['Không có job nào để chạy.'] });
      return;
    }
    // Names for nicer progress (best-effort).
    const names: Record<string, string> = {};
    try {
      const jobs = (await this.runtime.cmsSyncListJobs?.()) ?? [];
      for (const j of jobs) names[String(j._id || j.id)] = j.name || String(j._id || j.id);
    } catch {
      /* names are optional */
    }
    let ok = 0;
    let failed = 0;
    const lines: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = names[id] || id;
      await post({ kind: 'progress', done: i, total: ids.length, name });
      try {
        const r = await this.runtime.cmsSyncExecute?.(id);
        if (r?.ok) {
          ok++;
          lines.push(`✔ ${name} — ${typeof r.total === 'number' ? `${r.synced ?? r.total}/${r.total} bảng` : 'OK'}`);
        } else {
          failed++;
          lines.push(`✘ ${name} — ${r?.failed?.length ? r.failed.join('; ') : r?.error || 'lỗi'}`);
        }
      } catch (e) {
        failed++;
        lines.push(`✘ ${name} — ${(e as Error)?.message || 'lỗi'}`);
      }
    }
    await post({ kind: 'done', total: ids.length, ok, failed, lines });
  }

  // ── task queue (sequential) ──────────────────────────────────────────────────
  private queue: RemoteTask[] = [];
  private draining = false;
  /** Task ids already accepted this session. The server can deliver the same task
   *  twice (a direct push + the on-connect queued-flush race), so dedupe by id —
   *  each task id is unique + runs exactly once (a retry is a new id). */
  private seen = new Set<string>();
  private enqueue(task: RemoteTask): void {
    if (this.seen.has(task.id)) return;
    // Bound the dedupe set (insertion-ordered) — evict the oldest id past the cap.
    if (this.seen.size >= 1000) {
      const oldest = this.seen.values().next().value;
      if (oldest) this.seen.delete(oldest);
    }
    this.seen.add(task.id);
    this.queue.push(task);
    if (!this.draining) void this.drain();
  }
  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.length) {
        const task = this.queue.shift()!;
        await this.runTask(task);
      }
    } finally {
      this.draining = false;
    }
  }

  private async postEvent(taskId: string, body: PostRemoteTaskEvent): Promise<void> {
    try {
      await fetch(`${APIA_BASE}/agent/tasks/${taskId}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* a dropped event isn't fatal — the run continues */
    }
  }

  /** Run one remote task end-to-end as a Trợ lý AI turn, streaming progress back to the server. */
  private async runTask(task: RemoteTask): Promise<void> {
    this.recent = [
      { id: task.id, prompt: task.prompt, status: 'running', createdAt: new Date().toISOString() },
      ...this.recent.filter((r) => r.id !== task.id),
    ].slice(0, 10);
    this.emit();

    let finalStatus = 'done';
    let answer = '';
    let failure = '';
    await this.postEvent(task.id, { kind: 'status', payload: { type: 'status', status: 'running' } });
    try {
      if (!this.runtime.larkChat) throw new Error('Bản desktop này chưa có Trợ lý AI.');
      const stream: AsyncIterable<LarkChatEvent> = this.runtime.larkChat({
        prompt: task.prompt,
        // Unattended run: read-only. A write would need a human confirmation nobody can give.
        mode: 'ask',
        scope: 'general',
        runner: task.runner,
        model: task.model ?? undefined,
        source: 'relay',
      });
      for await (const ev of stream) {
        if (ev.type === 'text') {
          answer += ev.delta;
        } else if (ev.type === 'tool_call') {
          await this.postEvent(task.id, {
            kind: 'log',
            payload: { type: 'log', level: 'info', message: `Dùng công cụ: ${ev.name}` },
          });
          // No one can approve a gated write on an unattended task → deny it so the turn goes on.
          if (ev.gated) await this.runtime.larkConfirmTool?.(ev.callId, 'deny').catch(() => undefined);
        } else if (ev.type === 'ask_user') {
          await this.runtime
            .larkAnswerAsk?.(ev.callId, 'Không có người trả lời (tác vụ chạy từ xa) — hãy tự chọn phương án hợp lý nhất và nói rõ giả định.')
            .catch(() => undefined);
        } else if (ev.type === 'error') {
          failure = ev.message || failure || 'Lỗi khi chạy.';
        }
      }
    } catch (e) {
      failure = (e as Error).message || 'Lỗi khi chạy.';
    }
    if (failure && !answer.trim()) {
      finalStatus = 'error';
      await this.postEvent(task.id, { kind: 'error', payload: { message: failure } });
    } else {
      await this.postEvent(task.id, { kind: 'result', payload: { type: 'result', result: answer.trim() || 'Hoàn tất.' } });
      await this.postEvent(task.id, { kind: 'status', payload: { type: 'status', status: 'succeeded' } });
    }

    this.recent = this.recent.map((r) => (r.id === task.id ? { ...r, status: finalStatus } : r));
    this.emit();
  }
}
