/**
 * MỘT mô hình hội thoại cho cả "Lark × Agents" lẫn "Tạo workflow" — hàm THUẦN (kiểm bằng node).
 *
 * Trước 10/2026 hai màn có hai danh sách: hội thoại "Tạo workflow" mang `kind: 'workflow'` và MỘT Base
 * (chọn ở ô Base của màn đó), hội thoại thường mang `bases[]` (Base đã đăng ký qua custom app). Nay:
 *   - một danh sách duy nhất (không hội thoại nào bị lọc mất — kể cả kind cũ);
 *   - một hội thoại có MỘT hay NHIỀU Base, chọn từ TẤT CẢ Base: Base thấy qua phiên Lark web (62 Base
 *     của tenant thật) gộp với Base đã đăng ký qua custom app;
 *   - "Hỏi nhanh của tôi" gộp hai danh sách cũ về một.
 */

export interface ConvMeta {
  id: string;
  title?: string;
  kind?: string;
  bases?: { appToken: string; name?: string }[];
  updatedAt?: string;
  active?: boolean;
  runner?: string;
}

export interface BaseOption {
  appToken: string;
  name: string;
  url?: string;
  isWiki?: boolean;
  /** 'web' = thấy qua phiên Lark web; 'app' = đã đăng ký qua custom app; 'both'. */
  source: 'web' | 'app' | 'both';
}

/**
 * Danh sách hội thoại hợp nhất: GIỮ MỌI hội thoại (kể cả kind 'workflow' cũ), mới nhất lên đầu, khử
 * trùng theo id (bản có updatedAt mới hơn thắng), kèm `origin` để biết hội thoại sinh ra ở màn nào.
 */
export function unifySessions<T extends ConvMeta>(list: T[] | null | undefined): (T & { origin: 'chat' | 'workflow' })[] {
  const by = new Map<string, T>();
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || typeof s.id !== 'string' || !s.id) continue;
    const prev = by.get(s.id);
    if (!prev || String(s.updatedAt || '') > String(prev.updatedAt || '')) by.set(s.id, s);
  }
  return [...by.values()]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((s) => ({ ...s, origin: s.kind === 'workflow' ? ('workflow' as const) : ('chat' as const) }));
}

/** Gộp Base của phiên web với Base đã đăng ký (custom app) thành lựa chọn cho bộ chọn Base. */
export function mergeBaseOptions(
  web: { token: string; name: string; url?: string; isWiki?: boolean }[] | null | undefined,
  registered: { appToken: string; name?: string }[] | null | undefined,
): BaseOption[] {
  const out = new Map<string, BaseOption>();
  for (const b of web || []) {
    if (!b?.token) continue;
    out.set(b.token, { appToken: b.token, name: b.name || b.token, url: b.url, isWiki: b.isWiki, source: 'web' });
  }
  for (const b of registered || []) {
    if (!b?.appToken) continue;
    const ex = out.get(b.appToken);
    if (ex) ex.source = 'both';
    else out.set(b.appToken, { appToken: b.appToken, name: b.name || b.appToken, source: 'app' });
  }
  return [...out.values()];
}

/** Bật/tắt một Base trong hội thoại (giữ thứ tự: Base đầu = Base chính của hội thoại). */
export function toggleBase<B extends { appToken: string }>(cur: B[], b: B): B[] {
  return cur.some((x) => x.appToken === b.appToken) ? cur.filter((x) => x.appToken !== b.appToken) : [...cur, b];
}

/** Lọc lựa chọn Base theo chữ gõ (không phân biệt dấu/hoa thường), Base đang chọn luôn lên đầu. */
export function filterBaseOptions(opts: BaseOption[], q: string, selected: string[]): BaseOption[] {
  const f = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  const n = f(q.trim());
  const hit = n ? opts.filter((o) => f(o.name).includes(n)) : opts;
  const sel = new Set(selected);
  return [...hit.filter((o) => sel.has(o.appToken)), ...hit.filter((o) => !sel.has(o.appToken))];
}

/**
 * "Hỏi nhanh của tôi": hai danh sách cũ (hội thoại thường / Tạo workflow) → MỘT danh sách. Khử trùng
 * theo nhãn (danh sách thường giữ trước). Trả `null` khi không có gì cần gộp (đã gộp rồi).
 */
export function migrateCustomAsks(chatRaw: string | null | undefined, wfRaw: string | null | undefined): string | null {
  if (!wfRaw) return null;
  const read = (raw: string | null | undefined): { label: string; prompt: string }[] => {
    try {
      const v = JSON.parse(raw || '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.label === 'string' && typeof x.prompt === 'string' && x.label.trim() && x.prompt.trim()) : [];
    } catch {
      return [];
    }
  };
  const chat = read(chatRaw);
  const wf = read(wfRaw);
  const seen = new Set(chat.map((x) => x.label.trim()));
  const merged = [...chat];
  for (const x of wf) if (!seen.has(x.label.trim())) {
    seen.add(x.label.trim());
    merged.push({ label: x.label.trim(), prompt: x.prompt.trim() });
  }
  return JSON.stringify(merged);
}
