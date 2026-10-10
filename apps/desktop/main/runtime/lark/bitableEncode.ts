/**
 * Mã hoá giá trị NGƯỜI DÙNG/AGENT đưa vào → giá trị ô NỘI BỘ của Bitable (đúng thứ trang Lark tự ghi),
 * và chiều ngược lại để đọc lại / xuất tệp. THUẦN (không electron) — kiểm bằng fixture.
 *
 * Khuôn nội bộ ĐO THẬT trên Base Test ngày 10/10/2026 (ghi bằng `tableOperate.setRecords` rồi đọc lại
 * từ máy chủ bằng `/space/api/v2/bitable/records/`), khớp `basicValueToCellValue` của chính trang:
 *
 *   1  Văn bản        [{type:'text', text}]
 *   1  Email (ui)     [{type:'url', text, link:'mailto:…'}]
 *   2  Số/Tiền tệ/%   số (phần trăm lưu dạng phân số: 25% = 0.25)
 *   3  Chọn một       "opt…" (id lựa chọn)
 *   4  Chọn nhiều     ["opt…", …]
 *   5  Ngày giờ       mili giây (giờ treo tường theo múi giờ của Base, vd Asia/Saigon)
 *   7  Hộp kiểm       true/false
 *   11 Người          {users:[{userId, name, enName, notify:false}]}
 *   13 SĐT            {fullPhoneNum}
 *   15 URL            [{type:'url', text, link}]
 *   17 Tệp đính kèm   [{id, attachmentToken, name, text, size, mimeType, timeStamp}] — ghi bằng công cụ đính tệp
 *   18/21 Liên kết    ["rec…", …]
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export interface EncField {
  id: string;
  name: string;
  type: number;
  uiType?: string;
  isPrimary?: boolean;
  options?: { id: string; name: string }[];
  linkTable?: string;
  /** Định dạng số (vd "0.00%"). */
  formatter?: string;
  /** Cột Người / Liên kết cho nhiều giá trị. */
  multiple?: boolean;
}

export interface DirectoryUser {
  id: string;
  name: string;
  enName?: string;
  email?: string;
}

export interface EncodeCtx {
  /** Múi giờ của Base (clientvars `base.timezone`) — cho ngày/giờ không ghi múi. */
  timezone?: string;
  /** Người tra được: thành viên Base, người đã có trong bảng, chính người đăng nhập. */
  users?: DirectoryUser[];
  me?: DirectoryUser | null;
  /** Bản ghi của bảng được liên kết: id + chữ ở cột chính (để nhận cả TÊN lẫn id). */
  linkRecords?: Record<string, { id: string; primary: string }[]>;
}

export type EncodeResult =
  | { ok: true; cell: { type: number; value: unknown }; note?: string }
  | { ok: false; error: string; missingOptions?: string[] };

/** Loại cột KHÔNG ghi được (tự tính / hệ thống). */
export const READ_ONLY_TYPES: Record<number, string> = {
  19: 'Tra cứu (Lookup)',
  20: 'Công thức',
  22: 'Vị trí',
  23: 'Nhóm chat',
  1001: 'Thời gian tạo',
  1002: 'Thời gian sửa',
  1003: 'Người tạo',
  1004: 'Người sửa',
  1005: 'Số tự tăng',
  3001: 'Nút bấm',
};

export const fold = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Tìm cột theo id hoặc TÊN (đúng trước, rồi không phân biệt hoa/dấu nếu duy nhất). */
export function resolveField<T extends { id: string; name: string }>(fields: T[], key: string): T | null {
  const k = String(key ?? '').trim();
  if (!k) return null;
  const byId = fields.find((f) => f.id === k);
  if (byId) return byId;
  const exact = fields.filter((f) => f.name === k);
  if (exact.length === 1) return exact[0];
  const loose = fields.filter((f) => fold(f.name) === fold(k));
  return loose.length === 1 ? loose[0] : null;
}

// ── ngày giờ theo múi giờ của Base ──────────────────────────────────────────────────────────────

/** Độ lệch (phút) của múi `tz` tại thời điểm UTC `ms`. */
export function tzOffsetMinutes(ms: number, tz: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p: Record<string, number> = {};
    for (const x of dtf.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  } catch {
    return 0;
  }
}

/** Giờ treo tường (y-m-d h:mi:s ở múi `tz`) → mili giây UTC. */
export function zonedToUtcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, tz = 'UTC'): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = tzOffsetMinutes(guess, tz);
  let ms = guess - off * 60000;
  const off2 = tzOffsetMinutes(ms, tz); // qua mốc đổi giờ mùa hè
  if (off2 !== off) {
    off = off2;
    ms = guess - off * 60000;
  }
  return ms;
}

/**
 * Nhận ngày/giờ ở mọi dạng hay gặp: mili giây, giây Unix, ISO có/không múi, "YYYY-MM-DD[ HH:mm[:ss]]",
 * "YYYY/MM/DD", và kiểu Việt "DD/MM/YYYY[ HH:mm]". Không ghi múi ⇒ hiểu theo múi của Base.
 */
export function parseDateInput(v: unknown, tz = 'UTC'): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) return parseDateInput(Number(s), tz);
  // ISO có múi (Z hoặc ±hh:mm)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return zonedToUtcMs(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return zonedToUtcMs(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  return null;
}

/** mili giây → "YYYY-MM-DD" hoặc "YYYY-MM-DD HH:mm" theo múi giờ của Base. */
export function formatDateInTz(ms: number, tz = 'UTC', withTime = false): string {
  const off = tzOffsetMinutes(ms, tz);
  const d = new Date(ms + off * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}

// ── số ─────────────────────────────────────────────────────────────────────────────────────────

/** "1.234.567,5" / "1,234,567.5" / "25%" / "1 500 000 đ" → số. */
export function parseNumberInput(v: unknown, percent = false): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v ?? '').trim();
  if (!s) return null;
  const isPct = /%\s*$/.test(s);
  s = s.replace(/[%\s₫đ]|vnd|vnđ|usd|\$/gi, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Dấu nào đứng SAU là dấu thập phân.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,5" (thập phân) vs "1,234,567" (nhóm nghìn)
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234.567"
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // "25%" luôn là 0.25. Số trần ở cột phần trăm giữ nguyên (đã là phân số) — trừ khi rõ ràng là
  // phần trăm viết tay (>1 và ≤100 có ký hiệu thì đã xử lý ở trên).
  void percent;
  return isPct ? n / 100 : n;
}

// ── mã hoá từng loại ───────────────────────────────────────────────────────────────────────────

const toList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : typeof v === 'string' && /[,;\n]/.test(v) ? v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) : [v]);

function textOf(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as J;
    if (Array.isArray(o)) return o.map(textOf).join('');
    return String(o.text ?? o.name ?? o.value ?? o.link ?? JSON.stringify(o));
  }
  return String(v);
}

function matchOption(field: EncField, name: unknown): { id: string } | { missing: string } {
  const n = String(textOf(name)).trim();
  const opts = field.options || [];
  const byId = opts.find((o) => o.id === n);
  if (byId) return { id: byId.id };
  const exact = opts.filter((o) => o.name === n);
  if (exact.length === 1) return { id: exact[0].id };
  const loose = opts.filter((o) => fold(o.name) === fold(n));
  if (loose.length === 1) return { id: loose[0].id };
  return { missing: n };
}

function matchUser(v: unknown, ctx: EncodeCtx): DirectoryUser | { error: string } {
  const raw = typeof v === 'object' && v ? ((v as J).id ?? (v as J).userId ?? (v as J).user_id ?? (v as J).name) : v;
  const s = String(raw ?? '').trim();
  if (!s) return { error: 'trống' };
  if (/^(me|tôi|toi|mình|minh|bản thân)$/i.test(s)) return ctx.me ? ctx.me : { error: 'chưa biết người đang đăng nhập Lark' };
  const dir = [...(ctx.me ? [ctx.me] : []), ...(ctx.users || [])];
  const byId = dir.find((u) => u.id === s);
  if (byId) return byId;
  if (/^\d{15,22}$/.test(s)) return { id: s, name: '' }; // id người dùng nội bộ Lark
  const byEmail = dir.find((u) => u.email && u.email.toLowerCase() === s.toLowerCase());
  if (byEmail) return byEmail;
  const exact = dir.filter((u) => u.name === s || u.enName === s);
  const uniq = (xs: DirectoryUser[]) => [...new Map(xs.map((u) => [u.id, u])).values()];
  if (uniq(exact).length === 1) return uniq(exact)[0];
  const loose = uniq(dir.filter((u) => fold(u.name) === fold(s) || (u.enName && fold(u.enName) === fold(s))));
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) return { error: `«${s}» trùng ${loose.length} người — dùng id/email` };
  return { error: `không tìm thấy người «${s}» trong thành viên Base` };
}

/** Một giá trị → ô nội bộ đúng kiểu cột. Lỗi thì nói rõ vì sao và cách sửa. */
export function encodeCell(field: EncField, value: unknown, ctx: EncodeCtx = {}): EncodeResult {
  const t = field.type;
  const label = `Cột «${field.name}»`;
  if (READ_ONLY_TYPES[t]) return { ok: false, error: `${label} là ${READ_ONLY_TYPES[t]} — tự tính, không ghi được.` };
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
  if (empty) return { ok: true, cell: { type: t, value: null } };
  const ui = (field.uiType || '').toLowerCase();
  switch (t) {
    case 1: {
      const s = textOf(value);
      if (ui === 'email') {
        const e = s.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: `${label}: «${e}» không phải email hợp lệ.` };
        return { ok: true, cell: { type: 1, value: [{ type: 'url', text: e, link: `mailto:${e}` }] } };
      }
      return { ok: true, cell: { type: 1, value: [{ type: 'text', text: s }] } };
    }
    case 2: {
      const pct = /%/.test(field.formatter || '');
      const n = parseNumberInput(value, pct);
      if (n === null) return { ok: false, error: `${label}: «${textOf(value)}» không phải số.` };
      return { ok: true, cell: { type: 2, value: n } };
    }
    case 3: {
      const r = matchOption(field, Array.isArray(value) ? value[0] : value);
      if ('missing' in r) return { ok: false, error: `${label}: chưa có lựa chọn «${r.missing}». Có: ${(field.options || []).map((o) => o.name).join(' | ') || '(trống)'}.`, missingOptions: [r.missing] };
      return { ok: true, cell: { type: 3, value: r.id } };
    }
    case 4: {
      const ids: string[] = [];
      const missing: string[] = [];
      for (const x of toList(value)) {
        const r = matchOption(field, x);
        if ('missing' in r) missing.push(r.missing);
        else if (!ids.includes(r.id)) ids.push(r.id);
      }
      if (missing.length) return { ok: false, error: `${label}: chưa có lựa chọn ${missing.map((m) => `«${m}»`).join(', ')}. Có: ${(field.options || []).map((o) => o.name).join(' | ') || '(trống)'}.`, missingOptions: missing };
      return { ok: true, cell: { type: 4, value: ids } };
    }
    case 5: {
      const ms = parseDateInput(value, ctx.timezone || 'UTC');
      if (ms === null) return { ok: false, error: `${label}: «${textOf(value)}» không đọc được thành ngày (dùng YYYY-MM-DD, YYYY-MM-DD HH:mm hoặc DD/MM/YYYY).` };
      return { ok: true, cell: { type: 5, value: ms } };
    }
    case 7: {
      if (typeof value === 'boolean') return { ok: true, cell: { type: 7, value } };
      const s = fold(textOf(value));
      if (['true', '1', 'x', 'co', 'yes', 'y', 'dung', 'roi', 'da', '✓', 'checked'].includes(s)) return { ok: true, cell: { type: 7, value: true } };
      if (['false', '0', 'khong', 'no', 'n', 'chua', 'sai', ''].includes(s)) return { ok: true, cell: { type: 7, value: false } };
      return { ok: false, error: `${label}: «${textOf(value)}» không phải đúng/sai.` };
    }
    case 11: {
      const users: J[] = [];
      for (const x of toList(value)) {
        const u = matchUser(x, ctx);
        if ('error' in u) return { ok: false, error: `${label}: ${u.error}.` };
        if (!users.some((y) => y.userId === u.id)) users.push({ notify: false, userId: u.id, name: u.name || '', enName: u.enName || u.name || '' });
      }
      if (field.multiple === false && users.length > 1) return { ok: false, error: `${label} chỉ nhận MỘT người (đang có ${users.length}).` };
      return { ok: true, cell: { type: 11, value: { users } } };
    }
    case 13: {
      const s = textOf(value).replace(/[\s().-]/g, '');
      if (!/^\+?\d{3,20}$/.test(s)) return { ok: false, error: `${label}: «${textOf(value)}» không phải số điện thoại.` };
      return { ok: true, cell: { type: 13, value: { fullPhoneNum: s } } };
    }
    case 15: {
      const o = typeof value === 'object' && value && !Array.isArray(value) ? (value as J) : null;
      const link = String(o ? (o.link ?? o.url ?? '') : textOf(value)).trim();
      const text = String(o ? (o.text ?? link) : link).trim();
      if (!/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: `${label}: «${link}» không phải liên kết http(s).` };
      return { ok: true, cell: { type: 15, value: [{ type: 'url', text: text || link, link }] } };
    }
    case 17:
      return { ok: false, error: `${label} là cột Tệp đính kèm — dùng lark_web_attach_file để đính tệp (ghi thêm, không ghi đè).` };
    case 18:
    case 21: {
      const recs = ctx.linkRecords?.[field.linkTable || ''] || [];
      const ids: string[] = [];
      for (const x of toList(value)) {
        const s = textOf(x).trim();
        if (/^rec[A-Za-z0-9]{6,}$/.test(s)) {
          if (!ids.includes(s)) ids.push(s);
          continue;
        }
        const hit = recs.filter((r) => r.primary === s);
        const loose = hit.length ? hit : recs.filter((r) => fold(r.primary) === fold(s));
        if (loose.length !== 1) return { ok: false, error: `${label}: ${loose.length ? `«${s}» trùng ${loose.length} bản ghi` : `không thấy bản ghi «${s}»`} ở bảng liên kết — dùng record_id.` };
        if (!ids.includes(loose[0].id)) ids.push(loose[0].id);
      }
      if (field.multiple === false && ids.length > 1) return { ok: false, error: `${label} chỉ nhận MỘT bản ghi liên kết.` };
      return { ok: true, cell: { type: t, value: ids } };
    }
    default:
      return { ok: false, error: `${label}: loại cột ${t}${field.uiType ? ` (${field.uiType})` : ''} chưa hỗ trợ ghi qua phiên web.` };
  }
}

// ── so khớp khi đọc lại ─────────────────────────────────────────────────────────────────────────

const sameSet = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Ô đọc lại từ máy chủ có đúng là ô vừa ghi không (so theo NGHĨA, không theo thứ tự khoá JSON). */
export function cellMatches(field: EncField, expected: unknown, actual: unknown): boolean {
  const isEmpty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v && Array.isArray((v as J).users) && !(v as J).users.length);
  if (isEmpty(expected)) return isEmpty(actual) || (field.type === 7 && actual === false);
  if (actual === null || actual === undefined) return false;
  switch (field.type) {
    case 1:
    case 15:
      return textOf((expected as J[]).map((x) => x.link && field.type === 15 ? x.link : x.text)) === textOf((actual as J[]).map((x: J) => (x.link && field.type === 15 ? x.link : x.text)));
    case 2:
      return typeof actual === 'number' && Math.abs((actual as number) - (expected as number)) < 1e-9;
    case 3:
    case 5:
    case 7:
      return actual === expected;
    case 4:
    case 18:
    case 21:
      return Array.isArray(actual) && sameSet(expected as unknown[], actual as unknown[]);
    case 11:
      return sameSet(((expected as J).users || []).map((u: J) => u.userId), (((actual as J).users || []) as J[]).map((u) => u.userId));
    case 13:
      return String((actual as J).fullPhoneNum) === String((expected as J).fullPhoneNum);
    case 17:
      return sameSet(((expected as J[]) || []).map((x) => x.attachmentToken), ((actual as J[]) || []).map((x) => x.attachmentToken));
    default:
      return JSON.stringify(actual) === JSON.stringify(expected);
  }
}

// ── ô nội bộ → giá trị đơn giản (đọc dữ liệu / xuất tệp) ─────────────────────────────────────────

/**
 * Ô nội bộ → giá trị đọc được: chữ, số (giữ nguyên số — không làm tròn), tên lựa chọn, ngày theo múi
 * giờ Base, tên người, id bản ghi liên kết, tên tệp. Mã có số 0 đầu là CHỮ nên giữ nguyên.
 */
export function simpleValue(field: EncField, v: unknown, ctx: { timezone?: string; users?: Record<string, string> } = {}): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  const t = field.type;
  if (t === 2 || t === 1005) return typeof v === 'number' ? v : Number(textOf(v)) || textOf(v);
  if (t === 7) return !!v;
  if (t === 3) {
    const id = String(v);
    return field.options?.find((o) => o.id === id)?.name ?? id;
  }
  if (t === 4) return (Array.isArray(v) ? v : [v]).map((id) => field.options?.find((o) => o.id === id)?.name ?? String(id)).join(', ');
  if (t === 5 || t === 1001 || t === 1002) {
    const ms = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Number(v);
    if (!Number.isFinite(ms)) return textOf(v);
    const local = new Date(ms + tzOffsetMinutes(ms, ctx.timezone || 'UTC') * 60000);
    const withTime = local.getUTCHours() !== 0 || local.getUTCMinutes() !== 0;
    return formatDateInTz(ms, ctx.timezone || 'UTC', withTime);
  }
  if (t === 11 || t === 1003 || t === 1004) {
    const us: J[] = Array.isArray((v as J)?.users) ? (v as J).users : Array.isArray(v) ? (v as J[]) : [];
    return us.map((u) => u.name || u.enName || ctx.users?.[u.userId] || u.userId || u.id).filter(Boolean).join(', ');
  }
  if (t === 13) return String((v as J).fullPhoneNum ?? textOf(v));
  if (t === 17) return (Array.isArray(v) ? v : []).map((a: J) => a.name || a.text || a.attachmentToken).join(', ');
  if (t === 18 || t === 21) return (Array.isArray(v) ? v : []).map(String).join(', ');
  if (t === 15) return (Array.isArray(v) ? v : [v]).map((x: J) => x?.link || x?.text || '').filter(Boolean).join(', ');
  if (Array.isArray(v)) return v.map((x: J) => (typeof x === 'object' && x ? (x.type === 'mention' ? x.text || x.name : x.text ?? x.name ?? x.link ?? '') : String(x))).join('');
  return textOf(v);
}
