import {
  ActionBudget,
  BLOCKING_COLLECT_JS,
  classifyBlocking,
  pickSafeButton,
  UI_ACTION_CAP,
  type BlockingInfo,
  type OverlayCandidate,
  classifySensitive,
  compactAxTree,
  dragSequence,
  isLarkHost,
  isTemplateableSave,
  keyInfo,
  parseBody,
  summarizeSave,
  WF_URL,
  type AXNodeLike,
  type AxRefMeta,
  type UiSave,
} from './larkUiCore';

/**
 * CDP DRIVER for the Lark web window — replaces the fragile parts of the hand-rolled
 * executeJavaScript driver (synthetic DOM events, same-origin-only snapshot):
 *
 *   • snapshot = `Accessibility.getFullAXTree` per frame — incl. OUT-OF-PROCESS / cross-origin
 *     iframes, reached through `Target.setAutoAttach({flatten:true})` child sessions — compacted to a
 *     Playwright-style aria tree with STABLE refs (keyed by session + backendDOMNodeId).
 *   • act = real input: `DOM.scrollIntoViewIfNeeded` → `DOM.getContentQuads` (+ OOPIF frame offsets)
 *     → hit-test (`DOM.getNodeForLocation`, refuse if something else covers the point) →
 *     `Input.dispatchMouseEvent` press/release; typing via `Input.insertText` (works with React);
 *     real drag (press → moves → release) for connecting workflow nodes.
 *   • wait = text / role+name (`Accessibility.queryAXTree`) / network-idle (Network domain events).
 *   • network truth = every Lark automation/workflow write request + its response body
 *     (`Network.getResponseBody`) → the run reports what Lark SAVED (ids, code), not "I clicked".
 *
 * Attaches through `webContents.debugger` ('1.3') — NEVER a remote-debugging port (an
 * unauthenticated local port would let any process on the machine drive the user's Lark session).
 *
 * Electron-free (only needs a webContents-like object) so tests drive it with a fake debugger.
 * SAFETY lives here, enforced on every call: Lark-host-only (root page AND the target frame),
 * per-run action cap, sensitive-click refusal (classifySensitive), user "Dừng" stop flag, and
 * fail-closed on anything we can't verify (unknown ref, unresolvable box, covered point).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export interface DebuggerLike {
  attach(protocolVersion?: string): void;
  isAttached(): boolean;
  detach(): void;
  sendCommand(method: string, params?: object, sessionId?: string): Promise<any>;
  on(event: 'message', cb: (e: unknown, method: string, params: any, sessionId?: string) => void): unknown;
  on(event: 'detach', cb: (e: unknown, reason: string) => void): unknown;
}
export interface WebContentsLike {
  debugger: DebuggerLike;
  getURL(): string;
  isDestroyed(): boolean;
}

interface Sess {
  /** '' = root page session. */
  id: string;
  targetId: string;
  url: string;
  parent: string | null;
}
interface RefInfo extends AxRefMeta {
  session: string;
}
interface PendingReq {
  session: string;
  url: string;
  method: string;
  postData?: string;
  hasPostData?: boolean;
}

export interface AiStatus {
  /** A run is in progress (opened and touched within the last 90s, not stopped). */
  active: boolean;
  stopped: boolean;
  step?: string;
  actions: number;
  cap: number;
  startedAt?: number;
  lastAt?: number;
  saves: UiSave[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LarkCdpDriver {
  private wc: WebContentsLike | null = null;
  private listening = new WeakSet<object>();
  private sessions = new Map<string, Sess>();
  private refs = new Map<number, RefInfo>();
  private refKey = new Map<string, number>();
  private nextRef = 1;
  private docReady = new Set<string>();
  private inflight = new Map<string, number>();
  private lastNetAt = 0;
  private pending = new Map<string, PendingReq>();
  /** Every WF write request seen (newest last, capped). */
  private allSaves: UiSave[] = [];
  /** The latest VALID full automation save body (for templates). */
  private lastValid: { endpoint: string; body: Record<string, unknown>; at: number } | null = null;

  readonly budget = new ActionBudget(UI_ACTION_CAP);
  private stopped = false;
  private stoppedAt = 0;
  private runStartedAt = 0;
  private lastAt = 0;
  private step = '';

  /** Bind to the current Lark webContents (a new window → a fresh binding). */
  bind(wc: WebContentsLike | null): void {
    if (this.wc === wc) return;
    this.wc = wc;
    this.resetDoc();
    this.sessions.clear();
    this.inflight.clear();
    this.pending.clear();
  }

  private resetDoc(): void {
    this.refs.clear();
    this.refKey.clear();
    this.docReady.clear();
  }

  /** Attach the debugger (idempotent). Returns false when it can't (→ caller uses the legacy path). */
  async ensure(): Promise<boolean> {
    const wc = this.wc;
    if (!wc || wc.isDestroyed()) return false;
    const dbg = wc.debugger;
    try {
      if (!dbg.isAttached()) {
        dbg.attach('1.3');
        this.sessions.clear();
        this.resetDoc();
      }
    } catch {
      return false; // e.g. DevTools already open on this webContents
    }
    if (!this.listening.has(dbg as object)) {
      this.listening.add(dbg as object);
      dbg.on('message', (_e, method, params, sessionId) => this.onEvent(method, params, sessionId || ''));
      dbg.on('detach', () => {
        this.sessions.clear();
        this.resetDoc();
      });
    }
    if (!this.sessions.has('')) {
      this.sessions.set('', { id: '', targetId: '', url: wc.getURL(), parent: null });
      await this.enableSession('');
    }
    return true;
  }

  get attached(): boolean {
    try {
      return !!this.wc && !this.wc.isDestroyed() && this.wc.debugger.isAttached();
    } catch {
      return false;
    }
  }

  private send(method: string, params?: object, session = ''): Promise<J> {
    const wc = this.wc;
    if (!wc || wc.isDestroyed()) return Promise.reject(new Error('no-window'));
    return session ? wc.debugger.sendCommand(method, params || {}, session) : wc.debugger.sendCommand(method, params || {});
  }

  private async enableSession(s: string): Promise<void> {
    const soft = (m: string, p?: object) => this.send(m, p, s).catch(() => undefined);
    await soft('Page.enable');
    await soft('Network.enable', { maxPostDataSize: 2_000_000 });
    await soft('DOM.enable');
    await soft('Accessibility.enable');
    await soft('Runtime.enable');
    await soft('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    if (s) await soft('Runtime.runIfWaitingForDebugger');
  }

  private onEvent(method: string, p: J, s: string): void {
    switch (method) {
      case 'Target.attachedToTarget': {
        const info = p?.targetInfo || {};
        const child = String(p?.sessionId || '');
        if (!child) return;
        if (info.type === 'iframe' || info.type === 'page') {
          this.sessions.set(child, { id: child, targetId: String(info.targetId || ''), url: String(info.url || ''), parent: s });
          void this.enableSession(child);
        } else {
          // workers etc.: just let them run.
          void this.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => undefined);
        }
        return;
      }
      case 'Target.detachedFromTarget': {
        const child = String(p?.sessionId || '');
        this.sessions.delete(child);
        for (const [ref, r] of this.refs) if (r.session === child) this.refs.delete(ref);
        return;
      }
      case 'Target.targetInfoChanged': {
        for (const ss of this.sessions.values()) if (ss.targetId && ss.targetId === p?.targetInfo?.targetId) ss.url = String(p.targetInfo.url || ss.url);
        return;
      }
      case 'Page.frameNavigated': {
        const f = p?.frame;
        if (f && !f.parentId) {
          const ss = this.sessions.get(s);
          if (ss) ss.url = String(f.url || ss.url);
          if (s === '') this.resetDoc(); // main document replaced → every ref is stale
          else for (const [ref, r] of this.refs) if (r.session === s) this.refs.delete(ref);
          this.docReady.delete(s);
        }
        return;
      }
      case 'DOM.documentUpdated':
        this.docReady.delete(s);
        return;
      case 'Network.requestWillBeSent': {
        const id = `${s}|${p?.requestId}`;
        const type = String(p?.type || '');
        if (type !== 'WebSocket' && type !== 'EventSource') this.inflight.set(id, Date.now());
        this.lastNetAt = Date.now();
        const url = String(p?.request?.url || '');
        if (WF_URL.test(url)) {
          this.pending.set(id, { session: s, url, method: String(p?.request?.method || 'GET'), postData: p?.request?.postData, hasPostData: !!p?.request?.hasPostData });
        }
        return;
      }
      case 'Network.loadingFinished': {
        const id = `${s}|${p?.requestId}`;
        this.inflight.delete(id);
        this.lastNetAt = Date.now();
        const pr = this.pending.get(id);
        if (pr) {
          this.pending.delete(id);
          void this.finishWf(String(p?.requestId), pr);
        }
        return;
      }
      case 'Network.loadingFailed': {
        const id = `${s}|${p?.requestId}`;
        this.inflight.delete(id);
        this.lastNetAt = Date.now();
        const pr = this.pending.get(id);
        if (pr) {
          this.pending.delete(id);
          if (pr.method.toUpperCase() !== 'GET') {
            const sv = summarizeSave(pr.url, pr.method, pr.postData, null);
            this.pushSave({ ...sv, ok: false, error: String(p?.errorText || 'failed') });
          }
        }
        return;
      }
    }
  }

  private pushSave(sv: UiSave): void {
    this.allSaves.push(sv);
    if (this.allSaves.length > 60) this.allSaves.shift();
  }

  private async finishWf(requestId: string, pr: PendingReq): Promise<void> {
    if (pr.method.toUpperCase() === 'GET') return; // reads are not "saves"
    let post = pr.postData;
    if (!post && pr.hasPostData) {
      try {
        post = (await this.send('Network.getRequestPostData', { requestId }, pr.session))?.postData;
      } catch {
        /* body gone */
      }
    }
    let resp: string | null = null;
    try {
      const r = await this.send('Network.getResponseBody', { requestId }, pr.session);
      resp = r?.base64Encoded ? Buffer.from(String(r.body || ''), 'base64').toString('utf8') : String(r?.body ?? '');
    } catch {
      resp = null;
    }
    const sv = summarizeSave(pr.url, pr.method, post, resp);
    this.pushSave(sv);
    const req = parseBody(post);
    if (isTemplateableSave(req, sv.code)) {
      let endpoint = pr.url;
      try {
        endpoint = new URL(pr.url).pathname;
      } catch {
        /* keep */
      }
      this.lastValid = { endpoint, body: req as Record<string, unknown>, at: Date.now() };
    }
  }

  /** Latest valid automation save (template source). */
  lastValidSave(): { endpoint: string; body: Record<string, unknown>; at: number } | null {
    return this.lastValid;
  }

  // ── run / stop bookkeeping ─────────────────────────────────────────────────────────────────

  /** Start a run (lark_ui_open). A user "Dừng" sticks until 20s of silence, so the SAME agent turn
   *  can't simply re-open and carry on. Returns false if still stopped. */
  startRun(): boolean {
    if (this.stopped) {
      if (Date.now() - Math.max(this.stoppedAt, this.lastAt) < 20_000) {
        this.lastAt = Date.now();
        return false;
      }
      this.stopped = false;
    }
    this.budget.reset();
    this.runStartedAt = Date.now();
    this.lastAt = Date.now();
    this.step = 'Mở Lark';
    return true;
  }

  stop(): void {
    this.stopped = true;
    this.stoppedAt = Date.now();
    this.step = 'Người dùng đã bấm Dừng';
  }

  resume(): void {
    this.stopped = false;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Mark a step for the live "AI đang thao tác" strip. */
  noteStep(s: string): void {
    this.step = s.slice(0, 160);
    this.lastAt = Date.now();
  }

  status(): AiStatus {
    const now = Date.now();
    return {
      active: !this.stopped && this.runStartedAt > 0 && now - this.lastAt < 90_000,
      stopped: this.stopped,
      step: this.step || undefined,
      actions: this.budget.count,
      cap: this.budget.cap,
      startedAt: this.runStartedAt || undefined,
      lastAt: this.lastAt || undefined,
      saves: this.savesSince(this.runStartedAt),
    };
  }

  savesSince(t: number): UiSave[] {
    return this.allSaves.filter((s) => s.at >= t).slice(-20);
  }

  private stoppedResult(): J {
    this.lastAt = Date.now();
    return { ok: false, error: 'stopped-by-user', blocked: 'user-stop', hint: 'Người dùng đã bấm DỪNG ở khung Lark. DỪNG NGAY, không thao tác tiếp, báo lại đã làm tới đâu.' };
  }

  private hostGuard(session = ''): J | null {
    const root = this.wc?.getURL() || '';
    if (!isLarkHost(root)) return { ok: false, error: 'not-on-lark', url: root.slice(0, 200), hint: 'Cửa sổ Lark chưa ở trang Lark — dùng lark_ui_open trước.' };
    if (session) {
      const ss = this.sessions.get(session);
      if (!ss || !isLarkHost(ss.url)) return { ok: false, error: 'not-lark-host', blocked: 'host-guard', hint: 'Phần tử nằm trong khung KHÔNG thuộc Lark — không thao tác.' };
    }
    return null;
  }

  // ── snapshot ───────────────────────────────────────────────────────────────────────────────

  private refFor(session: string, m: AxRefMeta): number {
    const k = `${session}|${m.backendId}`;
    let ref = this.refKey.get(k);
    if (!ref) {
      ref = this.nextRef++;
      this.refKey.set(k, ref);
    }
    this.refs.set(ref, { ...m, session });
    return ref;
  }

  /** Frame ids of the ROOT target (same-process frames; OOPIFs fail and are covered by sessions). */
  private async rootFrameIds(): Promise<string[]> {
    try {
      const t = await this.send('Page.getFrameTree');
      const out: string[] = [];
      const walk = (n: J) => {
        if (!n?.frame?.id) return;
        out.push(String(n.frame.id));
        for (const c of n.childFrames || []) walk(c);
      };
      walk(t?.frameTree);
      return out;
    } catch {
      return [];
    }
  }

  async snapshot(opts?: { max?: number }): Promise<J> {
    if (this.stopped) return this.stoppedResult();
    const g = this.hostGuard();
    if (g) return g;
    this.noteStep('Đọc giao diện (snapshot)');
    const maxLines = Math.min(Math.max(Number(opts?.max) || 220, 30), 500);
    const lines: string[] = [];
    const items: J[] = [];
    const frames: J[] = [];
    let truncated = false;
    const seenBackend = new Set<string>();
    const addFrame = (session: string, label: string, nodes: AXNodeLike[]) => {
      const fresh = nodes.filter((n) => !n.backendDOMNodeId || !seenBackend.has(`${session}|${n.backendDOMNodeId}`));
      for (const n of fresh) if (n.backendDOMNodeId) seenBackend.add(`${session}|${n.backendDOMNodeId}`);
      if (!fresh.length) return;
      const left = maxLines - lines.length;
      if (left <= 0) {
        truncated = true;
        return;
      }
      if (label) lines.push(`- frame "${label}"`);
      const r = compactAxTree(fresh, { maxLines: left, indent: label ? 1 : 0, refFor: (m) => this.refFor(session, m) });
      lines.push(...r.lines);
      for (const it of r.items) items.push({ ref: it.ref, role: it.role, name: it.name, state: it.state, value: it.value, frame: label || 'main' });
      if (r.truncated) truncated = true;
    };
    // Root target: every same-process frame.
    const fids = await this.rootFrameIds();
    for (let i = 0; i < Math.max(fids.length, 1); i++) {
      try {
        const res = await this.send('Accessibility.getFullAXTree', fids[i] ? { frameId: fids[i] } : {});
        addFrame('', i === 0 ? '' : `frame#${i}`, (res?.nodes || []) as AXNodeLike[]);
      } catch {
        /* OOPIF frame id in root → covered by its session below */
      }
    }
    // Out-of-process iframes (cross-origin embedded Bases, …).
    for (const ss of this.sessions.values()) {
      if (!ss.id) continue;
      if (!isLarkHost(ss.url)) {
        frames.push({ url: ss.url.slice(0, 160), skipped: 'non-lark-frame' });
        continue;
      }
      try {
        const res = await this.send('Accessibility.getFullAXTree', {}, ss.id);
        frames.push({ url: ss.url.slice(0, 160), oopif: true });
        addFrame(ss.id, `oopif:${hostPath(ss.url)}`, (res?.nodes || []) as AXNodeLike[]);
      } catch {
        frames.push({ url: ss.url.slice(0, 160), error: 'ax-failed' });
      }
    }
    const url = this.wc?.getURL() || '';
    let title = '';
    try {
      title = String((await this.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }))?.result?.value || '');
    } catch {
      /* best-effort */
    }
    return {
      ok: true,
      driver: 'cdp',
      url,
      title,
      count: items.length,
      truncated,
      frames,
      text: lines.join('\n'),
      hint: 'Chọn theo VAI TRÒ + TÊN. ref ổn định giữa các snapshot khi phần tử còn đó; trang đổi URL thì ref cũ hết hạn.',
      saves: this.savesSince(this.runStartedAt).slice(-5),
      ...(await this.blockingField()),
    };
  }

  // ── blocking UI: self-check + safe dismiss ──────────────────────────────────────────────────

  /** Lớp nổi đang chặn ở khung chính (hộp thoại, "bản ghi chưa gửi", toast lỗi…) — null nếu sạch. */
  async blocking(): Promise<(BlockingInfo & { raw: OverlayCandidate[] }) | null> {
    try {
      const r = await this.send('Runtime.evaluate', { expression: BLOCKING_COLLECT_JS, returnByValue: true });
      const raw = Array.isArray(r?.result?.value) ? (r.result.value as OverlayCandidate[]) : [];
      const b = classifyBlocking(raw);
      return b ? { ...b, raw } : null;
    } catch {
      return null;
    }
  }

  private async blockingField(): Promise<{ blocking?: BlockingInfo; blocking_hint?: string }> {
    const b = await this.blocking();
    if (!b) return {};
    const { raw: _raw, ...info } = b;
    return {
      blocking: info,
      blocking_hint:
        info.kind === 'error-toast'
          ? 'Lark vừa báo LỖI (toast) — đọc chữ, sửa nguyên nhân rồi làm lại.'
          : 'Có lớp nổi đang mở/chặn thao tác. Nếu là thứ bạn tự mở và không cần nữa: lark_ui_dismiss. Đừng thao tác tiếp phía sau nó.',
    };
  }

  /** Đọc tình trạng khung Lark: URL, có đang ở Lark không, lớp chặn, ngân sách thao tác. */
  async health(): Promise<J> {
    const url = this.wc?.getURL() || '';
    const b = await this.blocking();
    const { raw: _r, ...info } = b || ({} as J);
    return {
      ok: true,
      url,
      on_lark: isLarkHost(url),
      clean: !b,
      ...(b ? { blocking: info } : {}),
      actions_used: this.budget.count,
      actions_left: this.budget.left,
      stopped: this.stopped,
      hint: b ? 'Khung Lark đang có lớp nổi — dùng lark_ui_dismiss nếu là thứ bạn đã mở, hoặc báo người dùng nếu không chắc.' : 'Khung Lark sạch.',
    };
  }

  /**
   * Đóng lớp chặn một cách AN TOÀN: Escape trước; nếu vẫn còn thì bấm nút có tên an toàn
   * (Thoát/Huỷ/Đóng/Để sau…) — không bao giờ Xoá/Bật/Lưu/Gửi/Xác nhận. Không dùng ngân sách thao tác
   * của agent quá 2 lần cho một lần gọi.
   */
  async dismiss(): Promise<J> {
    if (this.stopped) return this.stoppedResult();
    const g = this.hostGuard();
    if (g) return g;
    const before = await this.blocking();
    if (!before) return { ok: true, dismissed: false, clean: true, note: 'Không có lớp nào đang chặn.' };
    this.noteStep('Đóng hộp thoại đang chặn');
    const steps: string[] = [];
    let now: (BlockingInfo & { raw: OverlayCandidate[] }) | null = before;
    let escaped = false;
    // Tối đa 3 vòng: một form đã gõ dở → Escape → hiện "bản ghi chưa gửi" → bấm Thoát.
    for (let round = 0; round < 3 && now; round++) {
      const btn = now.kind === 'unsaved-record' || escaped ? pickSafeButton(now.raw.flatMap((c) => c.buttons || [])) : null;
      if (btn) {
        if (!this.budget.take()) break;
        await this.mouse([
          { type: 'mouseMoved', x: btn.x, y: btn.y },
          { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', buttons: 1, clickCount: 1 },
          { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', buttons: 0, clickCount: 1 },
        ]);
        steps.push(`bấm «${btn.text}»`);
      } else if (!escaped || now.kind !== before.kind) {
        await this.key('Escape').catch(() => undefined);
        steps.push('Escape');
        escaped = true;
      } else break;
      await sleep(500);
      now = await this.blocking();
    }
    const strip = (b: (BlockingInfo & { raw?: unknown }) | null) => (b ? { kind: b.kind, text: b.text, buttons: b.buttons } : null);
    return {
      ok: !now,
      dismissed: !now,
      steps,
      before: strip(before),
      ...(now ? { still: strip(now), hint: 'Không đóng được bằng nút an toàn — DỪNG thao tác UI và báo người dùng đang kẹt ở hộp nào (chữ + các nút).' } : { clean: true }),
    };
  }


  // ── geometry ───────────────────────────────────────────────────────────────────────────────

  private async ensureDoc(session: string): Promise<void> {
    if (this.docReady.has(session)) return;
    await this.send('DOM.getDocument', { depth: 0 }, session).catch(() => undefined);
    this.docReady.add(session);
  }

  /** Center of a node in ROOT viewport coordinates (adds OOPIF frame offsets). */
  private async centerOf(session: string, backendNodeId: number): Promise<{ x: number; y: number; local: { x: number; y: number } } | null> {
    await this.ensureDoc(session);
    await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }, session).catch(() => undefined);
    let quad: number[] | null = null;
    try {
      const q = await this.send('DOM.getContentQuads', { backendNodeId }, session);
      quad = (q?.quads || []).find((qq: number[]) => Array.isArray(qq) && qq.length >= 8) || null;
    } catch {
      quad = null;
    }
    if (!quad) {
      try {
        const b = await this.send('DOM.getBoxModel', { backendNodeId }, session);
        quad = b?.model?.content || null;
      } catch {
        quad = null;
      }
    }
    if (!quad) return null;
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w < 1 || h < 1) return null;
    const local = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const off = await this.frameOffset(session);
    if (!off) return null;
    return { x: local.x + off.x, y: local.y + off.y, local };
  }

  /** Offset of an OOPIF session's viewport inside the root viewport (0,0 for the root). */
  private async frameOffset(session: string, depth = 0): Promise<{ x: number; y: number } | null> {
    if (!session) return { x: 0, y: 0 };
    if (depth > 8) return null;
    const ss = this.sessions.get(session);
    if (!ss || ss.parent == null) return null;
    try {
      await this.ensureDoc(ss.parent);
      const owner = await this.send('DOM.getFrameOwner', { frameId: ss.targetId }, ss.parent);
      const b = await this.send('DOM.getBoxModel', { backendNodeId: owner?.backendNodeId }, ss.parent);
      const c = b?.model?.content;
      if (!c) return null;
      const up = await this.frameOffset(ss.parent, depth + 1);
      if (!up) return null;
      return { x: up.x + Math.min(c[0], c[6]), y: up.y + Math.min(c[1], c[3]) };
    } catch {
      return null;
    }
  }

  /**
   * FAIL-CLOSED hit test: is the topmost element at the (frame-local, viewport) point the target or
   * inside/around it? Done in-page with `elementFromPoint` (viewport coords, descends open shadow
   * roots) — `DOM.getNodeForLocation` was measured to answer "No node found" for a visible sticky
   * header link on larksuite.com after a scroll, i.e. its coordinate space doesn't match quads.
   */
  private async hitsTarget(session: string, backendNodeId: number, local: { x: number; y: number }): Promise<{ ok: boolean; hit?: string }> {
    try {
      const a = await this.send('DOM.resolveNode', { backendNodeId }, session);
      const r = await this.send(
        'Runtime.callFunctionOn',
        {
          objectId: a?.object?.objectId,
          functionDeclaration:
            'function(x,y){ var t=this; if(t.nodeType===3) t=t.parentElement; if(!t) return {rel:false}; var h=document.elementFromPoint(x,y); for(var i=0;i<20&&h&&h.shadowRoot;i++){ var d=h.shadowRoot.elementFromPoint(x,y); if(!d||d===h) break; h=d; } if(!h) return {rel:false,name:""}; function inside(n,anc){ for(var k=0;k<60&&n;k++){ if(n===anc) return true; n=n.parentNode||(n.host||null); } return false; } var rel = inside(h,t) || inside(t,h); var n=(h.getAttribute&&(h.getAttribute("aria-label")||h.getAttribute("title")))||h.innerText||h.textContent||""; return {rel:rel, name:String(n).replace(/\\s+/g," ").trim().slice(0,80)}; }',
          arguments: [{ value: local.x }, { value: local.y }],
          returnByValue: true,
        },
        session,
      );
      const v = r?.result?.value || {};
      return { ok: !!v.rel, hit: v.name };
    } catch {
      return { ok: false };
    }
  }

  private async mouse(evts: { type: string; x: number; y: number; button?: string; buttons?: number; clickCount?: number; deltaX?: number; deltaY?: number }[]): Promise<void> {
    for (const e of evts) {
      await this.send('Input.dispatchMouseEvent', { button: 'none', buttons: 0, ...e, pointerType: 'mouse' });
    }
  }

  private async key(k: string): Promise<void> {
    const info = keyInfo(k);
    await this.send('Input.dispatchKeyEvent', { type: info.text ? 'keyDown' : 'rawKeyDown', ...info });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: info.key, code: info.code, windowsVirtualKeyCode: info.windowsVirtualKeyCode });
  }

  private async domSize(session: string): Promise<number> {
    try {
      const r = await this.send('Runtime.evaluate', { expression: "document.getElementsByTagName('*').length", returnByValue: true }, session);
      return Number(r?.result?.value) || 0;
    } catch {
      return -1;
    }
  }

  /** Shared pre-flight for act/drag: stop flag, budget, host, ref, sensitivity. */
  private preflight(ref: number, action: string, key?: string): { info: RefInfo } | { err: J } {
    if (this.stopped) return { err: this.stoppedResult() };
    const info = this.refs.get(ref);
    if (!info) return { err: { ok: false, error: 'stale-ref', ref, hint: 'Snapshot lại rồi tìm theo tên + vai trò.' } };
    const g = this.hostGuard(info.session);
    if (g) return { err: g };
    const v = classifySensitive({ name: info.name, role: info.role, context: info.context, action, key });
    if (v.blocked)
      return {
        err: {
          ok: false,
          error: 'requires-confirm',
          blocked: 'sensitive-action',
          reason: v.reason,
          target: { name: info.name, role: info.role },
          hint: 'BẬT / XUẤT BẢN / XOÁ / CHẠY THỬ / xác nhận hộp thoại xoá-bật không hoàn tác được — DỪNG, để người dùng tự bấm trong Lark.',
        },
      };
    if (!this.budget.take()) return { err: { ok: false, error: 'budget-exhausted', hint: 'Đã tới giới hạn thao tác phiên này — dừng và báo người dùng.' } };
    return { info };
  }

  // ── act ────────────────────────────────────────────────────────────────────────────────────

  async act(input: J): Promise<J> {
    const ref = Number(input?.ref);
    const action = String(input?.action || 'click');
    const key = input?.key != null ? String(input.key) : undefined;
    const pf = this.preflight(ref, action, action === 'press' ? key || 'Enter' : key);
    if ('err' in pf) return pf.err;
    const info = pf.info;
    const s = info.session;
    const target = { name: info.name, role: info.role };
    this.noteStep(`${verb(action)} ${info.role} "${info.name}"`);
    const t0 = Date.now();
    const urlBefore = this.wc?.getURL() || '';
    const sizeBefore = await this.domSize(s);
    try {
      await this.ensureDoc(s);
      if (action === 'scrollIntoView') {
        await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: info.backendId }, s);
      } else if (action === 'fill' || action === 'clear') {
        const val = action === 'clear' ? '' : String(input?.value ?? '');
        await this.send('DOM.focus', { backendNodeId: info.backendId }, s);
        const obj = await this.send('DOM.resolveNode', { backendNodeId: info.backendId }, s);
        const sel = await this.send(
          'Runtime.callFunctionOn',
          {
            objectId: obj?.object?.objectId,
            functionDeclaration:
              'function(){ var e=this; if(e.nodeType===3) e=e.parentElement; if(e.disabled||e.readOnly) return "disabled"; if(typeof e.select==="function"){ e.select(); return "input"; } if(e.isContentEditable){ var r=document.createRange(); r.selectNodeContents(e); var s=getSelection(); s.removeAllRanges(); s.addRange(r); return "ce"; } return "other"; }',
            returnByValue: true,
          },
          s,
        );
        if (sel?.result?.value === 'disabled') return { ok: false, error: 'disabled', target };
        await this.key('Backspace');
        if (val) await this.send('Input.insertText', { text: val });
        if (input?.submit) await this.key('Enter');
      } else if (action === 'press') {
        await this.send('DOM.focus', { backendNodeId: info.backendId }, s).catch(() => undefined);
        await this.key(key || 'Enter');
      } else if (action === 'select') {
        const d = await this.send('DOM.describeNode', { backendNodeId: info.backendId }, s);
        if (String(d?.node?.nodeName || '').toUpperCase() === 'SELECT') {
          const obj = await this.send('DOM.resolveNode', { backendNodeId: info.backendId }, s);
          const r = await this.send(
            'Runtime.callFunctionOn',
            {
              objectId: obj?.object?.objectId,
              functionDeclaration:
                'function(v){ for(var i=0;i<this.options.length;i++){ var o=this.options[i]; if((o.text||"").trim()===String(v).trim()||o.value===v){ this.value=o.value; this.dispatchEvent(new Event("input",{bubbles:true})); this.dispatchEvent(new Event("change",{bubbles:true})); return {ok:true}; } } return {ok:false, options:Array.prototype.map.call(this.options,function(o){return o.text;}).slice(0,30)}; }',
              arguments: [{ value: String(input?.value ?? '') }],
              returnByValue: true,
            },
            s,
          );
          const v = r?.result?.value || {};
          if (!v.ok) return { ok: false, error: 'option-not-found', options: v.options || [], target };
        } else {
          const c = await this.clickAt(s, info, 1);
          if (!c.ok) return c;
          return { ok: true, action, ref, target, note: 'combobox-opened', hint: 'Danh sách mở ở portal — snapshot lại rồi click đúng option.' };
        }
      } else if (action === 'hover') {
        const c = await this.centerOf(s, info.backendId);
        if (!c) return { ok: false, error: 'not-visible', ref, target };
        await this.mouse([{ type: 'mouseMoved', x: c.x, y: c.y }]);
      } else if (action === 'scrollBy') {
        const c = await this.centerOf(s, info.backendId);
        if (!c) return { ok: false, error: 'not-visible', ref, target };
        await this.mouse([{ type: 'mouseWheel', x: c.x, y: c.y, deltaX: Number(input?.dx) || 0, deltaY: Number(input?.dy) || 300 }]);
      } else if (action === 'click' || action === 'dblclick') {
        const c = await this.clickAt(s, info, action === 'dblclick' ? 2 : 1);
        if (!c.ok) return c;
      } else {
        return { ok: false, error: 'unknown-action', action };
      }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e).slice(0, 200), target };
    }
    await sleep(150);
    const urlAfter = this.wc?.getURL() || '';
    const sizeAfter = await this.domSize(s);
    return {
      ok: true,
      driver: 'cdp',
      action,
      ref,
      target,
      urlChanged: urlAfter !== urlBefore,
      domChanged: sizeBefore !== sizeAfter,
      url: urlAfter,
      actionsLeft: this.budget.left,
      saves: this.savesSince(t0),
      ...(await this.blockingField()),
    };
  }

  private async clickAt(s: string, info: RefInfo, count: number): Promise<J> {
    const c = await this.centerOf(s, info.backendId);
    if (!c) return { ok: false, error: 'not-visible', target: { name: info.name, role: info.role } };
    const hit = await this.hitsTarget(s, info.backendId, c.local);
    if (!hit.ok)
      return {
        ok: false,
        error: 'obscured',
        target: { name: info.name, role: info.role },
        coveredBy: hit.hit,
        hint: 'Có lớp khác (hộp thoại/menu) che phần tử — snapshot lại, đóng lớp che (Escape) hoặc chọn phần tử đang hiện.',
      };
    const evts: J[] = [{ type: 'mouseMoved', x: c.x, y: c.y }];
    for (let i = 1; i <= count; i++) {
      evts.push({ type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: i });
      evts.push({ type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: i });
    }
    await this.mouse(evts);
    return { ok: true };
  }

  // ── drag ───────────────────────────────────────────────────────────────────────────────────

  /** Real drag from a ref to another ref (or by an offset) — for connecting workflow nodes. */
  async drag(input: J): Promise<J> {
    const from = Number(input?.from_ref ?? input?.ref);
    const pf = this.preflight(from, 'drag');
    if ('err' in pf) return pf.err;
    const a = pf.info;
    const start = await this.centerOf(a.session, a.backendId);
    if (!start) return { ok: false, error: 'not-visible', ref: from, target: { name: a.name, role: a.role } };
    let end: { x: number; y: number } | null = null;
    let toTarget: J;
    if (input?.to_ref != null) {
      const b = this.refs.get(Number(input.to_ref));
      if (!b) return { ok: false, error: 'stale-ref', ref: Number(input.to_ref), hint: 'Snapshot lại rồi tìm theo tên + vai trò.' };
      const g = this.hostGuard(b.session);
      if (g) return g;
      const v = classifySensitive({ name: b.name, role: b.role, context: b.context, action: 'drag' });
      if (v.blocked) return { ok: false, error: 'requires-confirm', blocked: 'sensitive-action', reason: v.reason, target: { name: b.name, role: b.role } };
      const c = await this.centerOf(b.session, b.backendId);
      if (!c) return { ok: false, error: 'not-visible', ref: Number(input.to_ref) };
      end = { x: c.x, y: c.y };
      toTarget = { name: b.name, role: b.role };
    } else if (input?.dx != null || input?.dy != null) {
      end = { x: start.x + (Number(input.dx) || 0), y: start.y + (Number(input.dy) || 0) };
    }
    if (!end) return { ok: false, error: 'missing-target', hint: 'Truyền to_ref (phần tử đích) hoặc dx/dy.' };
    this.noteStep(`Kéo ${a.role} "${a.name}"${toTarget ? ` → ${toTarget.role} "${toTarget.name}"` : ''}`);
    const t0 = Date.now();
    const seq = dragSequence({ x: start.x, y: start.y }, end, { steps: Number(input?.steps) || 12 });
    try {
      for (const e of seq) {
        if (this.stopped && e.type !== 'mouseReleased') {
          // User hit Dừng mid-drag: return to the start and let go (≈ cancel), never leave it held.
          await this.mouse([
            { type: 'mouseMoved', x: start.x, y: start.y, button: 'left', buttons: 1 },
            { type: 'mouseReleased', x: start.x, y: start.y, button: 'left', buttons: 0, clickCount: 1 },
          ]);
          return this.stoppedResult();
        }
        await this.mouse([e]);
        if (e.type === 'mouseMoved') await sleep(16);
      }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e).slice(0, 200) };
    }
    await sleep(200);
    return { ok: true, driver: 'cdp', action: 'drag', from: { name: a.name, role: a.role }, to: toTarget || end, actionsLeft: this.budget.left, saves: this.savesSince(t0) };
  }

  // ── wait ───────────────────────────────────────────────────────────────────────────────────

  async wait(input: J): Promise<J> {
    if (this.stopped) return this.stoppedResult();
    const timeout = Math.min(Math.max(Number(input?.timeout_ms ?? input?.ms) || 8000, 0), 30_000);
    const text = input?.text ? String(input.text) : '';
    const role = input?.role ? String(input.role) : '';
    const name = input?.name ? String(input.name) : '';
    const idle = !!input?.network_idle;
    const idleMs = Math.min(Math.max(Number(input?.idle_ms) || 600, 200), 5000);
    if (!text && !role && !name && !idle) {
      // plain sleep (old behaviour), still interruptible.
      const ms = Math.min(Math.max(Number(input?.ms) || 800, 0), 20_000);
      this.noteStep(`Chờ ${ms}ms`);
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (this.stopped) return this.stoppedResult();
        await sleep(Math.min(150, end - Date.now()));
      }
      return { ok: true, resolved: true, reason: 'slept', waitedMs: ms };
    }
    this.noteStep(`Chờ ${text ? `"${text}"` : role || name ? `${role} "${name}"` : 'mạng yên'}`);
    const end = Date.now() + timeout;
    while (true) {
      if (this.stopped) return this.stoppedResult();
      let ok = true;
      if (ok && text) ok = await this.hasText(text);
      if (ok && (role || name)) ok = await this.hasRole(role, name);
      if (ok && idle) ok = this.networkIdleFor(idleMs);
      if (ok) return { ok: true, resolved: true, reason: 'found', inflight: this.inflightCount() };
      if (Date.now() > end) return { ok: true, resolved: false, reason: 'timeout', inflight: this.inflightCount() };
      await sleep(150);
    }
  }

  private inflightCount(): number {
    const now = Date.now();
    let n = 0;
    for (const t of this.inflight.values()) if (now - t < 10_000) n++; // long-polls don't block idle forever
    return n;
  }

  /** Network quiet for `ms`: no request started/finished in that window and ≤ 2 still open
   *  (Playwright's "networkidle2" — a beacon/long-poll must not make every wait time out; measured
   *  on larksuite.com, which keeps one request open indefinitely). */
  networkIdleFor(ms: number): boolean {
    return this.inflightCount() <= 2 && Date.now() - this.lastNetAt >= ms;
  }

  private larkSessions(): string[] {
    const out = [''];
    for (const ss of this.sessions.values()) if (ss.id && isLarkHost(ss.url)) out.push(ss.id);
    return out;
  }

  private async hasText(t: string): Promise<boolean> {
    for (const s of this.larkSessions()) {
      try {
        const r = await this.send('Runtime.evaluate', { expression: `((document.body&&document.body.innerText)||'').indexOf(${JSON.stringify(t)})>=0`, returnByValue: true }, s);
        if (r?.result?.value === true) return true;
      } catch {
        /* frame gone */
      }
    }
    return false;
  }

  private async hasRole(role: string, name: string): Promise<boolean> {
    for (const s of this.larkSessions()) {
      try {
        const doc = await this.send('DOM.getDocument', { depth: 0 }, s);
        this.docReady.add(s);
        const q = await this.send(
          'Accessibility.queryAXTree',
          { backendNodeId: doc?.root?.backendNodeId, ...(role ? { role } : {}), ...(name ? { accessibleName: name } : {}) },
          s,
        );
        if ((q?.nodes || []).some((n: J) => !n.ignored)) return true;
      } catch {
        /* unsupported / frame gone */
      }
    }
    return false;
  }
}

function verb(a: string): string {
  return (
    ({ click: 'Bấm', dblclick: 'Bấm đúp', fill: 'Điền', clear: 'Xoá chữ', select: 'Chọn', press: 'Nhấn phím', hover: 'Rê chuột', scrollIntoView: 'Cuộn tới', scrollBy: 'Cuộn' } as Record<string, string>)[a] ||
    a
  );
}

function hostPath(u: string): string {
  try {
    const x = new URL(u);
    return (x.host + x.pathname).slice(0, 60);
  } catch {
    return u.slice(0, 60);
  }
}
