'use client';

/**
 * "Nhớ lựa chọn → lần sau khỏi hỏi" cho màn Lark Agents.
 *
 * Khi agent XÁC NHẬN một thao tác ghi (gated) hoặc TỰ HỎI cách làm (ask_user), người dùng có thể
 * bảo "đặt làm mặc định cho HỘI THOẠI này hoặc SKILL này". Từ đó về sau, lượt tương tự tự chạy —
 * giao diện tự duyệt / tự trả lời, KHÔNG hiện hộp hỏi lại.
 *
 * Lưu ở localStorage của renderer (theo máy/trình duyệt này). Mọi truy cập bọc try/catch: chế độ
 * ẩn danh / site-data bị chặn thì coi như CHƯA nhớ gì (hỏi như bình thường), không bao giờ ném.
 */

export type RememberScope = 'conversation' | 'skill';

interface Bucket {
  /** Tên công cụ GHI được tự duyệt (vd "bitable_update_record"). */
  allow: string[];
  /** Câu hỏi ask_user đã có câu trả lời ghi nhớ (q đã chuẩn hoá → a nguyên văn). */
  answers: { q: string; a: string }[];
}
interface PrefsStore {
  conv: Record<string, Bucket>;
  skill: Record<string, Bucket>;
}

const KEY = 'tw_lark_agentprefs_v1';
const MAX_ANSWERS = 50; // chặn phình vô hạn cho một hội thoại/skill
const MAX_ALLOW = 60;

function empty(): PrefsStore {
  return { conv: {}, skill: {} };
}

function load(): PrefsStore {
  try {
    if (typeof window === 'undefined') return empty();
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<PrefsStore>;
    return { conv: p.conv ?? {}, skill: p.skill ?? {} };
  } catch {
    return empty();
  }
}

function save(s: PrefsStore): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* site-data bị chặn → bỏ qua, phiên này sẽ hỏi như bình thường */
  }
}

/** Chuẩn hoá câu hỏi để so khớp: bỏ khoảng trắng thừa, thường hoá, cắt ngắn. */
function norm(q: string): string {
  return String(q || '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 300);
}

function bucketFor(s: PrefsStore, scope: RememberScope, ids: { convId?: string | null; skillId?: string | null }): Bucket | null {
  const id = scope === 'skill' ? ids.skillId : ids.convId;
  if (!id) return null;
  const map = scope === 'skill' ? s.skill : s.conv;
  if (!map[id]) map[id] = { allow: [], answers: [] };
  return map[id];
}

/** Công cụ ghi này đã được tự duyệt cho hội thoại hoặc skill hiện tại chưa? */
export function isToolAllowed(convId: string | null | undefined, skillId: string | null | undefined, tool: string): boolean {
  const s = load();
  if (convId && s.conv[convId]?.allow.includes(tool)) return true;
  if (skillId && s.skill[skillId]?.allow.includes(tool)) return true;
  return false;
}

/** Ghi nhớ: tự duyệt công cụ GHI này cho `scope`. */
export function rememberTool(scope: RememberScope, ids: { convId?: string | null; skillId?: string | null }, tool: string): void {
  if (!tool) return;
  const s = load();
  const b = bucketFor(s, scope, ids);
  if (!b) return;
  if (!b.allow.includes(tool)) {
    b.allow.push(tool);
    if (b.allow.length > MAX_ALLOW) b.allow = b.allow.slice(-MAX_ALLOW);
  }
  save(s);
}

/** Có câu trả lời ghi nhớ cho CÂU HỎI này (trong hội thoại/skill hiện tại) không? */
export function findAnswer(convId: string | null | undefined, skillId: string | null | undefined, question: string): string | null {
  const s = load();
  const n = norm(question);
  const hit = (b?: Bucket) => b?.answers.find((x) => x.q === n)?.a;
  return hit(convId ? s.conv[convId] : undefined) ?? hit(skillId ? s.skill[skillId] : undefined) ?? null;
}

/** Ghi nhớ câu trả lời cho một câu hỏi ask_user, cho `scope`. */
export function rememberAnswer(
  scope: RememberScope,
  ids: { convId?: string | null; skillId?: string | null },
  question: string,
  answer: string,
): void {
  const n = norm(question);
  if (!n) return;
  const s = load();
  const b = bucketFor(s, scope, ids);
  if (!b) return;
  b.answers = b.answers.filter((x) => x.q !== n);
  b.answers.push({ q: n, a: answer });
  if (b.answers.length > MAX_ANSWERS) b.answers = b.answers.slice(-MAX_ANSWERS);
  save(s);
}
