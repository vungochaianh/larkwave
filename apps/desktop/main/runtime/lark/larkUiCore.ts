/**
 * PURE core of the Lark UI-automation driver — no Electron import, so the main-process test
 * harness (electron mocked) can exercise every safety rule directly.
 *
 * What lives here (and is tested in apps/desktop/test/larkUiDriver.cjs):
 *   • classifySensitive — the "never enable / publish / delete / confirm-a-destructive-dialog /
 *     test-run" click guard (VI / EN / ZH labels). Fail-closed.
 *   • isLarkHost        — strict host allow-list (a substring test let `larksuite.com.evil.io` in).
 *   • ActionBudget      — per-run action cap.
 *   • compactAxTree     — CDP `Accessibility.getFullAXTree` → small Playwright-style aria snapshot
 *                         with stable refs (backendDOMNodeId-keyed by the caller).
 *   • dragSequence      — the real press → many moves → release sequence for drag-to-connect.
 *   • keyInfo           — key name → Input.dispatchKeyEvent params.
 *   • summarizeSave     — Lark automation/workflow request → "what Lark actually saved".
 */

// ── Sensitive-action guard ────────────────────────────────────────────────────────────────────

/**
 * Labels whose CLICK makes something LIVE, DESTROYS something, or RUNS it for real. An agent must
 * never do these on the user's live Lark account — the human does them in Lark. Building a
 * DISABLED draft never needs any of them.
 *   VI: bật, kích hoạt, xuất bản, phát hành, xoá/xóa, gỡ, chạy thử, chạy ngay
 *   EN: enable, turn on, activate, publish, release, delete, remove, test run, run now
 *   ZH: 启用 开启 激活 发布 删除 移除 测试运行 试运行 立即运行
 */
export const SENSITIVE_UI =
  /(\bbật\b|kích hoạt|xuất bản|phát hành|\bxoá|\bxóa|\bgỡ|chạy thử|chạy ngay|\benable|\bturn on\b|\bactivate|\bpublish|\brelease\b|\bdelete|\bremove\b|\btest run\b|\brun now\b|\brun once\b|启用|开启|激活|发布|删除|移除|测试运行|试运行|立即运行|运行一次)/i;

/** Plain "confirm" buttons. Harmless in a field picker; NOT when the dialog asks to delete/enable. */
const CONFIRM_WORDS = /^(xác nhận|đồng ý|có|ok|okay|yes|confirm|continue|tiếp tục|确认|确定|是|好的|继续)$/i;
/** Dialog text that turns a plain confirm into a destructive / go-live confirm. */
const DESTRUCTIVE_CONTEXT =
  /(xoá|xóa|bật|kích hoạt|xuất bản|không (thể )?hoàn tác|vĩnh viễn|delete|remove|enable|activate|publish|cannot be undone|permanently|irreversible|删除|启用|发布|无法恢复|不可恢复|永久)/i;

export interface SensitiveInput {
  name: string;
  role?: string;
  /** Text of the enclosing dialog/alertdialog (if any) — decides whether "OK" is destructive. */
  context?: string;
  action: string;
  key?: string;
}
export interface SensitiveVerdict {
  blocked: boolean;
  reason?: 'sensitive-name' | 'destructive-confirm' | 'toggle' | 'unnamed-in-dialog';
}

/** Actions that ACTIVATE the target (a click, or Enter/Space on it). Typing/hover/scroll don't. */
function activates(action: string, key?: string): boolean {
  if (action === 'click' || action === 'dblclick' || action === 'select' || action === 'drag') return true;
  if (action === 'press') return /^(enter|return| |space|spacebar)$/i.test(String(key ?? 'Enter'));
  return false;
}

/** Normalise Vietnamese (NFC) + collapse whitespace so "Xóa" / "Xoá" / "XOÁ  " all match. */
export function normLabel(s: string): string {
  return String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * Decide whether an action on a control must be refused (→ `requires-confirm`, a human does it).
 * FAIL-CLOSED: a switch/toggle is always refused (the automation's on/off switch often has NO
 * accessible name), and an unnamed button inside a destructive dialog is refused too.
 */
export function classifySensitive(i: SensitiveInput): SensitiveVerdict {
  if (!activates(i.action, i.key)) return { blocked: false };
  const name = normLabel(i.name).toLowerCase();
  const role = String(i.role || '').toLowerCase();
  const ctx = normLabel(i.context || '');
  if (role === 'switch') return { blocked: true, reason: 'toggle' };
  if (name && SENSITIVE_UI.test(name)) return { blocked: true, reason: 'sensitive-name' };
  const destructiveDialog = !!ctx && DESTRUCTIVE_CONTEXT.test(ctx);
  if (destructiveDialog && name && CONFIRM_WORDS.test(name)) return { blocked: true, reason: 'destructive-confirm' };
  if (destructiveDialog && !name && (role === 'button' || role === 'link' || role === 'menuitem' || role === 'text' || role === 'generic'))
    return { blocked: true, reason: 'unnamed-in-dialog' };
  return { blocked: false };
}

// ── Host guard ────────────────────────────────────────────────────────────────────────────────

const LARK_DOMAINS = ['larksuite.com', 'larkoffice.com', 'feishu.cn', 'feishu.com', 'larksuite-boe.com'];

/** True only for https? URLs whose HOST is a Lark/Feishu domain or a subdomain of one. */
export function isLarkHost(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  return LARK_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

// ── Per-run action cap ────────────────────────────────────────────────────────────────────────

export class ActionBudget {
  private used = 0;
  constructor(readonly cap = 80) {}
  /** Consume one action; false when the run is out of budget (nothing consumed). */
  take(): boolean {
    if (this.used >= this.cap) return false;
    this.used++;
    return true;
  }
  reset(): void {
    this.used = 0;
  }
  get count(): number {
    return this.used;
  }
  get left(): number {
    return Math.max(0, this.cap - this.used);
  }
}

// ── AX-tree compaction ────────────────────────────────────────────────────────────────────────

/** Minimal shape of a CDP Accessibility.AXNode we rely on. */
export interface AXNodeLike {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: unknown };
  name?: { value?: unknown };
  value?: { value?: unknown };
  properties?: { name: string; value?: { value?: unknown } }[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

export interface AxRefMeta {
  backendId: number;
  role: string;
  name: string;
  /** Enclosing dialog text (for the destructive-confirm guard). */
  context: string;
}

export interface AxCompactResult {
  lines: string[];
  /** Interactive / clickable-text entries that received a ref. */
  items: (AxRefMeta & { ref: number; state: string[]; value?: string })[];
  truncated: boolean;
}

/** Roles that get a #ref (the agent can act on them). */
const INTERACTIVE = new Set([
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab', 'checkbox', 'radio',
  'switch', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'slider', 'treeitem', 'gridcell', 'columnheader',
  'rowheader', 'textfield', 'popupbutton', 'togglebutton', 'listitem-clickable',
]);
/** Containers worth printing as a heading line (no ref) — they give the agent its bearings. */
const STRUCT = new Set(['dialog', 'alertdialog', 'menu', 'menubar', 'listbox', 'tablist', 'tree', 'grid', 'table', 'toolbar', 'heading', 'tabpanel', 'region', 'group', 'form', 'navigation', 'complementary']);
/** Named-only structural roles (an unnamed group/region is noise). */
const STRUCT_NEEDS_NAME = new Set(['region', 'group', 'form', 'navigation', 'complementary', 'tabpanel']);
const TEXT_ROLES = new Set(['StaticText', 'statictext', 'text']);
const DROP = new Set(['InlineTextBox', 'LineBreak', 'none', 'presentation', 'ignored']);

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const sval = (v: unknown) => (v == null ? '' : String(v));

function prop(n: AXNodeLike, key: string): unknown {
  const p = (n.properties || []).find((x) => x.name === key);
  return p?.value?.value;
}

/**
 * Turn a flat CDP AX tree into a compact, indented aria snapshot:
 *   - dialog "Thêm hành động"
 *     - button "Gửi tin nhắn" [ref=12]
 *     - text "Khi bản ghi được thêm" [ref=13]
 * Rules: ignored / generic / presentational nodes collapse (children promoted); interactive roles
 * get a ref; visible TEXT leaves get a ref too (a real mouse click on text hits whatever clickable
 * div wraps it — that's how non-semantic Lark canvas nodes become reachable); text already
 * contained in the nearest printed ancestor's name is skipped; output capped at `maxLines`.
 * `refFor(meta)` lets the caller assign STABLE refs (keyed by session + backendDOMNodeId).
 */
export function compactAxTree(
  nodes: AXNodeLike[],
  opts: { maxLines?: number; refFor: (m: AxRefMeta) => number; indent?: number; nameMax?: number },
): AxCompactResult {
  const maxLines = opts.maxLines ?? 250;
  const nameMax = opts.nameMax ?? 80;
  const byId = new Map<string, AXNodeLike>();
  for (const n of nodes) if (n && n.nodeId != null) byId.set(String(n.nodeId), n);
  const roots = nodes.filter((n) => !n.parentId || !byId.has(String(n.parentId)));

  // Text of every dialog subtree (for the destructive-confirm guard).
  const subtreeText = (n: AXNodeLike, acc: string[], depth = 0): void => {
    if (depth > 60 || acc.join(' ').length > 400) return;
    const r = sval(n.role?.value);
    if (TEXT_ROLES.has(r)) acc.push(sval(n.name?.value));
    else if (n.name?.value && (r === 'heading' || r === 'button')) acc.push(sval(n.name.value));
    for (const c of n.childIds || []) {
      const cn = byId.get(String(c));
      if (cn) subtreeText(cn, acc, depth + 1);
    }
  };

  const lines: string[] = [];
  const items: AxCompactResult['items'] = [];
  let truncated = false;
  const seen = new Set<string>();

  const visit = (n: AXNodeLike, depth: number, ancestorName: string, ctx: string, guard: number): void => {
    if (guard > 200) return;
    if (seen.has(n.nodeId)) return;
    seen.add(n.nodeId);
    const role = sval(n.role?.value);
    let name = normLabel(sval(n.name?.value));
    const kids = () => {
      for (const c of n.childIds || []) {
        const cn = byId.get(String(c));
        if (cn) visit(cn, nextDepth, nextAncestor, nextCtx, guard + 1);
      }
    };
    let nextDepth = depth;
    let nextAncestor = ancestorName;
    let nextCtx = ctx;

    if (n.ignored || DROP.has(role)) return kids();

    if (TEXT_ROLES.has(role)) {
      if (!name) return;
      const low = name.toLowerCase();
      if (ancestorName && ancestorName.toLowerCase().includes(low)) return; // already shown by parent
      if (lines.length >= maxLines) {
        truncated = true;
        return;
      }
      const prev = lines[lines.length - 1];
      const line = `${'  '.repeat(depth)}- text "${clip(name, nameMax)}"`;
      if (prev && prev.startsWith(line)) return; // dedupe consecutive identical text
      if (n.backendDOMNodeId) {
        const meta = { backendId: n.backendDOMNodeId, role: 'text', name: clip(name, nameMax), context: ctx };
        const ref = opts.refFor(meta);
        items.push({ ...meta, ref, state: [] });
        lines.push(`${line} [ref=${ref}]`);
      } else lines.push(line);
      return;
    }

    const focusable = prop(n, 'focusable') === true;
    const isInteractive = INTERACTIVE.has(role) || ((role === 'generic' || role === 'GenericContainer' || role === 'div') && focusable && !!name);
    if (role === 'dialog' || role === 'alertdialog') {
      const acc: string[] = [];
      subtreeText(n, acc);
      nextCtx = normLabel([name, ...acc].join(' ')).slice(0, 400);
    }

    if (isInteractive) {
      if (!name) {
        // Name from descendant text (e.g. a div[role=button] wrapping spans).
        const acc: string[] = [];
        subtreeText(n, acc);
        name = normLabel(acc.join(' '));
      }
      if (lines.length >= maxLines) {
        truncated = true;
        return;
      }
      const state: string[] = [];
      if (prop(n, 'disabled') === true) state.push('disabled');
      const checked = prop(n, 'checked');
      if (checked === true || checked === 'true') state.push('checked');
      else if (checked === 'mixed') state.push('mixed');
      const expanded = prop(n, 'expanded');
      if (expanded !== undefined) state.push(`expanded=${expanded}`);
      if (prop(n, 'selected') === true) state.push('selected');
      if (prop(n, 'focused') === true) state.push('focused');
      if (prop(n, 'readonly') === true) state.push('readonly');
      const value = n.value?.value != null ? clip(normLabel(sval(n.value.value)), 60) : undefined;
      const r = role === 'GenericContainer' || role === 'div' ? 'generic' : role;
      let line = `${'  '.repeat(depth)}- ${r} "${clip(name, nameMax)}"`;
      if (value) line += ` value="${value}"`;
      if (state.length) line += ` [${state.join(',')}]`;
      if (n.backendDOMNodeId) {
        const meta = { backendId: n.backendDOMNodeId, role: r, name: clip(name, nameMax), context: nextCtx };
        const ref = opts.refFor(meta);
        items.push({ ...meta, ref, state, value });
        line += ` [ref=${ref}]`;
      }
      lines.push(line);
      nextDepth = depth + 1;
      nextAncestor = name;
      return kids();
    }

    if (STRUCT.has(role) && (!STRUCT_NEEDS_NAME.has(role) || name)) {
      if (lines.length >= maxLines) {
        truncated = true;
        return;
      }
      lines.push(`${'  '.repeat(depth)}- ${role}${name ? ` "${clip(name, nameMax)}"` : ''}`);
      nextDepth = depth + 1;
      nextAncestor = name || ancestorName;
      return kids();
    }

    // generic / unknown container → collapse.
    return kids();
  };

  const base = opts.indent ?? 0;
  for (const r of roots) visit(r, base, '', '', 0);
  return { lines, items, truncated };
}

// ── Real drag ─────────────────────────────────────────────────────────────────────────────────

export interface MouseEvt {
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased';
  x: number;
  y: number;
  button: 'none' | 'left';
  buttons: number;
  clickCount?: number;
}

/**
 * Press at `from` → nudge past the drag threshold → `steps` linear moves → land on `to` → release.
 * Node-editor libraries (React Flow & co.) only start a connection after the pointer moved a few px
 * with the button held, and only accept the drop after at least one move OVER the target handle —
 * a teleport press/release never connects. Coordinates are rounded to 0.5px.
 */
export function dragSequence(from: { x: number; y: number }, to: { x: number; y: number }, opts?: { steps?: number }): MouseEvt[] {
  const steps = Math.min(Math.max(Math.round(opts?.steps ?? 12), 2), 60);
  const r = (v: number) => Math.round(v * 2) / 2;
  const out: MouseEvt[] = [
    { type: 'mouseMoved', x: r(from.x), y: r(from.y), button: 'none', buttons: 0 },
    { type: 'mousePressed', x: r(from.x), y: r(from.y), button: 'left', buttons: 1, clickCount: 1 },
    { type: 'mouseMoved', x: r(from.x + 4), y: r(from.y + 4), button: 'left', buttons: 1 },
  ];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push({ type: 'mouseMoved', x: r(from.x + (to.x - from.x) * t), y: r(from.y + (to.y - from.y) * t), button: 'left', buttons: 1 });
  }
  out.push({ type: 'mouseMoved', x: r(to.x), y: r(to.y), button: 'left', buttons: 1 }); // settle on target
  out.push({ type: 'mouseReleased', x: r(to.x), y: r(to.y), button: 'left', buttons: 0, clickCount: 1 });
  return out;
}

// ── Keys ──────────────────────────────────────────────────────────────────────────────────────

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Escape: { code: 'Escape', vk: 27 },
  Tab: { code: 'Tab', vk: 9 },
  Backspace: { code: 'Backspace', vk: 8 },
  Delete: { code: 'Delete', vk: 46 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
  PageDown: { code: 'PageDown', vk: 34 },
  PageUp: { code: 'PageUp', vk: 33 },
  ' ': { code: 'Space', vk: 32, text: ' ' },
};

/** Key name → CDP Input.dispatchKeyEvent fields (keyDown carries `text` for printable keys). */
export function keyInfo(key: string): { key: string; code: string; windowsVirtualKeyCode: number; text?: string } {
  const k = key === 'Space' ? ' ' : key === 'Esc' ? 'Escape' : key === 'Return' ? 'Enter' : key;
  const m = KEYS[k];
  if (m) return { key: k, code: m.code, windowsVirtualKeyCode: m.vk, ...(m.text ? { text: m.text } : {}) };
  if (k.length === 1) {
    const up = k.toUpperCase();
    const code = /[A-Z]/.test(up) ? 'Key' + up : /[0-9]/.test(k) ? 'Digit' + k : '';
    return { key: k, code, windowsVirtualKeyCode: up.charCodeAt(0), text: k };
  }
  return { key: k, code: k, windowsVirtualKeyCode: 0 };
}

// ── Network truth ─────────────────────────────────────────────────────────────────────────────

/** Lark internal automation/workflow endpoints (bitable/base service prefixes, any resource name). */
export const WF_URL = /\/(?:space\/api\/bitable|space\/api\/base|base\/api)\/(?:[^?#]*\/)?(?:workflow|workflows|automation|flow|node_?flow|block_?workflow|advance_?workflow)\b/i;

export interface UiSave {
  at: number;
  path: string;
  method: string;
  op: string;
  ok: boolean;
  code?: number;
  msg?: string;
  workflowID?: string;
  status?: number;
  baseId?: string;
  error?: string;
}

/** Parse a request body: JSON first, then form-encoded (draft=…&extra=…). */
export function parseBody(body: string | null | undefined): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const j = JSON.parse(body);
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
  } catch {
    /* not JSON */
  }
  if (body.includes('=')) {
    try {
      const o: Record<string, unknown> = {};
      new URLSearchParams(body).forEach((v, k) => (o[k] = v));
      return Object.keys(o).length ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

function pickId(o: unknown): string | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const r = o as Record<string, unknown>;
  for (const k of ['workflowID', 'workflowId', 'workflow_id', 'id']) {
    const v = r[k];
    if ((typeof v === 'string' && v) || typeof v === 'number') return String(v);
  }
  for (const k of ['workflow', 'data']) {
    const id = pickId(r[k]);
    if (id) return id;
  }
  return undefined;
}

/** Summarise one captured Lark automation/workflow request into what Lark ACTUALLY did. */
export function summarizeSave(url: string, method: string, reqBody: string | null | undefined, respText: string | null | undefined): UiSave {
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    /* relative */
  }
  const op = (/(create|update|save|publish|enable|disable|delete|remove|copy|duplicate)/i.exec(path.split('?')[0])?.[1] || method).toLowerCase();
  const req = parseBody(reqBody);
  let resp: Record<string, unknown> | null = null;
  try {
    resp = respText ? (JSON.parse(respText) as Record<string, unknown>) : null;
  } catch {
    resp = null;
  }
  const code = typeof resp?.code === 'number' ? (resp.code as number) : undefined;
  const status = req && req.status != null && !Number.isNaN(Number(req.status)) ? Number(req.status) : undefined;
  const baseFromPath = /\/space\/api\/bitable\/([^/?]+)\//i.exec(path)?.[1];
  const baseId = (req && typeof req.token === 'string' ? req.token : undefined) || (baseFromPath && !/^(automation|workflow)$/i.test(baseFromPath) ? baseFromPath : undefined);
  return {
    at: Date.now(),
    path: path.slice(0, 300),
    method: String(method || 'GET').toUpperCase(),
    op,
    ok: code === 0,
    code,
    msg: resp && resp.msg != null ? String(resp.msg).slice(0, 160) : undefined,
    workflowID: pickId(resp?.data) || pickId(req),
    status,
    baseId,
  };
}

/** A request body that is a COMPLETE, valid automation save (what a template is built from). */
export function isTemplateableSave(req: Record<string, unknown> | null, code: number | undefined): boolean {
  return !!req && typeof req.draft === 'string' && (req.draft as string).length > 40 && (code === 0 || code === undefined);
}

// ── Blocking UI (hộp thoại / lớp che / thông báo lỗi) ────────────────────────────────────────

/** Số thao tác tối đa của một lượt lái giao diện (đủ để dựng vài automation; vẫn có trần). */
export const UI_ACTION_CAP = 200;

/** Một phần tử nổi (hộp thoại, popover, toast) thu thập trong trang bằng BLOCKING_COLLECT_JS. */
export interface OverlayCandidate {
  role: string;
  cls: string;
  text: string;
  buttons: { text: string; x: number; y: number }[];
  w: number;
  h: number;
}
export interface BlockingInfo {
  kind: 'unsaved-record' | 'confirm-dialog' | 'record-form' | 'dialog' | 'error-toast' | 'panel';
  text: string;
  buttons: string[];
  /** Có bao nhiêu lớp nổi khác đang mở. */
  others?: number;
}

/**
 * Đoạn JS chạy trong trang: liệt kê các lớp nổi ĐANG HIỆN (dialog/alertdialog/modal/drawer/popover/
 * toast) cùng nút bấm của chúng (toạ độ khung nhìn). Chỉ đọc; trả dữ liệu thô — phân loại ở
 * classifyBlocking (thuần, có test).
 */
export const BLOCKING_COLLECT_JS = `(() => {
  function vis(el) { try { var r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return false; if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false; var cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; } catch (e) { return false; } }
  var sel = '[role=dialog],[role=alertdialog],[aria-modal=true],[class*="modal-content"],[class*="ud__modal"],[class*="ud__dialog"],[class*="drawer-content"],[class*="ud__drawer"],[class*="popconfirm"],[class*="ud__popover"],[class*="toast"],[class*="ud__message"],[class*="message-notice"],[role=alert]';
  var els = Array.prototype.slice.call(document.querySelectorAll(sel)).filter(vis);
  var top = els.filter(function (e) { return !els.some(function (o) { return o !== e && o.contains(e); }); });
  return top.slice(0, 10).map(function (el) {
    var r = el.getBoundingClientRect();
    var btns = Array.prototype.slice.call(el.querySelectorAll('button,[role=button]')).filter(vis).slice(0, 10).map(function (b) { var q = b.getBoundingClientRect(); return { text: String(b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 40), x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    return { role: el.getAttribute('role') || '', cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').slice(0, 200), text: String(el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300), buttons: btns, w: r.width, h: r.height };
  });
})()`;

const UNSAVED_RE = /(haven'?t submitted|not be saved|won'?t be saved|chưa (gửi|lưu)|sẽ không được lưu|未提交|不会被保存|不会保存|尚未保存)/i;
const ERROR_RE = /(fail|error|lỗi|thất bại|không thành công|không có quyền|no permission|denied|失败|错误|无权限|出错)/i;
const TOAST_CLS = /(toast|ud__message|message-notice)/i;
const MODAL_CLS = /(modal|dialog|drawer|popconfirm|popover)/i;

/**
 * Từ các lớp nổi đang hiện → lớp đang CHẶN thao tác (nếu có), ưu tiên: hộp "bản ghi chưa gửi" →
 * hộp xác nhận → hộp thoại → toast lỗi. Toast thường (đã lưu, đã sao chép…) không tính là chặn.
 * Trả null khi giao diện sạch.
 */
export function classifyBlocking(cands: OverlayCandidate[] | null | undefined): BlockingInfo | null {
  const list = (Array.isArray(cands) ? cands : []).filter((c) => c && (c.text || c.buttons?.length));
  const scored: { b: BlockingInfo; p: number }[] = [];
  for (const c of list) {
    const text = normLabel(c.text).slice(0, 240);
    const buttons = (c.buttons || []).map((b) => normLabel(b.text)).filter(Boolean);
    if (UNSAVED_RE.test(text)) scored.push({ b: { kind: 'unsaved-record', text, buttons }, p: 5 });
    else if (c.role === 'alertdialog' || /popconfirm/i.test(c.cls)) scored.push({ b: { kind: 'confirm-dialog', text, buttons }, p: 4 });
    else if (/drawer/i.test(c.cls) && buttons.some((b) => /^(submit|gửi|提交)$/i.test(b))) scored.push({ b: { kind: 'record-form', text, buttons }, p: 3 });
    else if (TOAST_CLS.test(c.cls) || c.role === 'alert') {
      if (ERROR_RE.test(text)) scored.push({ b: { kind: 'error-toast', text, buttons }, p: 2 });
    } else if (c.role === 'dialog' || MODAL_CLS.test(c.cls)) scored.push({ b: { kind: c.w > 240 && c.h > 120 && buttons.length ? 'dialog' : 'panel', text, buttons }, p: c.w > 240 && c.h > 120 && buttons.length ? 3 : 1 });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.p - a.p);
  const top = scored[0].b;
  return scored.length > 1 ? { ...top, others: scored.length - 1 } : top;
}

/** Nút AN TOÀN để đóng một lớp chặn: thoát / huỷ / đóng / để sau. KHÔNG BAO GIỜ xoá/bật/lưu/gửi/xác nhận. */
const SAFE_BUTTON = /^(exit|cancel|close|dismiss|not now|later|got it|no|đóng|huỷ|hủy|huỷ bỏ|hủy bỏ|thoát|bỏ qua|để sau|đã hiểu|không|取消|关闭|退出|知道了|稍后|暂不)$/i;
const NEVER_BUTTON = /(delete|remove|enable|activate|publish|submit|confirm|save|apply|send|xoá|xóa|gỡ|bật|kích hoạt|xuất bản|gửi|xác nhận|lưu|áp dụng|删除|移除|启用|发布|提交|确认|确定|保存|发送)/i;

/** Chọn nút an toàn trong một lớp chặn (theo tên) — null nếu không có nút nào an toàn. */
export function pickSafeButton<T extends { text: string }>(buttons: T[] | null | undefined): T | null {
  for (const b of Array.isArray(buttons) ? buttons : []) {
    const n = normLabel(b?.text || '');
    if (n && SAFE_BUTTON.test(n) && !NEVER_BUTTON.test(n)) return b;
  }
  return null;
}
