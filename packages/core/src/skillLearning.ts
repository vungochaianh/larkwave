/**
 * Kỹ năng TỰ HỌC + kỹ năng dựng sẵn — các luật THUẦN (không I/O), dùng chung cho tiến trình chính (tool
 * `skill_save`, nạp kỹ năng vào prompt) và giao diện (xem khác biệt giữa hai phiên bản).
 *
 *  - `matchTriggers`: câu lệnh có khớp từ khoá gọi của kỹ năng không (bỏ dấu, không phân biệt hoa thường).
 *  - `detectLearnIntent`: người dùng vừa DẠY một quy tắc lâu dài ("từ giờ…", "lần sau…", "nhớ cách này",
 *    "luôn luôn…", "from now on…") hoặc SỬA agent ("không phải thế, phải là…").
 *  - `sanitizeLearnedSkill`: kỹ năng chỉ là CHỮ HƯỚNG DẪN — gỡ bí mật (khoá, mật khẩu, token, cookie) và gỡ
 *    mọi câu cố CẤP QUYỀN (tự duyệt ghi đè / xoá / gửi, bỏ qua xác nhận). Kỹ năng không bao giờ mở được
 *    thứ mà luật duyệt của ứng dụng đang chặn.
 *  - `findOverlap`: kỹ năng mới trùng ý với kỹ năng đã có → CẬP NHẬT thay vì đẻ bản sao.
 *  - `lineDiff`: khác biệt theo dòng giữa hai phiên bản (màn lịch sử phiên bản).
 */

/** Bỏ dấu tiếng Việt, đ→d, chữ thường, gộp khoảng trắng. */
export function foldText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Câu lệnh có chứa MỘT trong các cụm từ khoá không (so sau khi bỏ dấu; cụm < 3 ký tự bị bỏ qua). */
export function matchTriggers(prompt: string, triggers: readonly string[] | null | undefined): boolean {
  const p = ` ${foldText(prompt).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  for (const t of triggers ?? []) {
    const f = foldText(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (f.length < 3) continue;
    if (p.includes(` ${f} `) || (f.includes(' ') && p.includes(f))) return true;
  }
  return false;
}

export type LearnIntentKind = 'explicit' | 'correction';

/** Cụm báo hiệu người dùng đặt một QUY TẮC LÂU DÀI (so trên chữ đã bỏ dấu). */
const EXPLICIT_RE: RegExp[] = [
  /\btu (gio|nay|lan sau|bay gio)( tro di)?\b/,
  /\blan sau\b/,
  /\bnhung lan sau\b/,
  /\bcac lan sau\b/,
  /\bnho (cach nay|cach lam nay|lay|giup|la|rang|nhe|nha)\b/,
  /\bghi nho\b/,
  /\bluon luon\b/,
  /\b(hay|nho|phai) luon\b/,
  /\bmoi (lan|khi) .{0,40}\b(thi|hay|nho|phai)\b/,
  /\blam (nhu|giong) (vay|the|lan nay) (lan sau|ve sau|tu gio)\b/,
  /\bve sau\b/,
  /\bfrom now on\b/,
  /\bnext time\b/,
  /\bgoing forward\b/,
  /\bremember (this|that|to)\b/,
  /\balways (use|add|do|include|put|export|write|keep|make)\b/,
  /\bin the future\b/,
];
/** Cụm báo hiệu người dùng SỬA cách agent vừa làm. */
const CORRECTION_RE: RegExp[] = [
  /\bkhong phai (the|vay|nhu the|nhu vay)\b.{0,60}\b(phai|ma la|la)\b/,
  /\bsai roi\b.{0,60}\b(phai|dung ra|ma la)\b/,
  /\bkhong dung\b.{0,40}\b(phai la|dung ra la|ma la)\b/,
  /\bdung ra (phai|la)\b/,
  /\bthat'?s (wrong|not right)\b/,
  /\bno,? (it|you) should\b/,
  /\bnot like that\b/,
  /\bshould (have|be)\b.{0,40}\binstead\b/,
];

/** Người dùng vừa DẠY (explicit) hay vừa SỬA (correction) — hoặc không phải cả hai (null). */
export function detectLearnIntent(text: string): { kind: LearnIntentKind; phrase: string } | null {
  const f = foldText(text);
  if (!f || f.length < 6) return null;
  for (const re of CORRECTION_RE) {
    const m = re.exec(f);
    if (m) return { kind: 'correction', phrase: m[0] };
  }
  for (const re of EXPLICIT_RE) {
    const m = re.exec(f);
    if (m) return { kind: 'explicit', phrase: m[0] };
  }
  return null;
}

/** Mẫu bí mật — thay bằng `[đã gỡ bí mật]`. Trả loại đã gỡ để báo người dùng (không trả giá trị). */
const SECRET_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'khoá riêng', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'Bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { kind: 'khoá API', re: /\b(sk|pk|rk)-(ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'token GitHub/GitLab', re: /\b(ghp|gho|ghs|ghu|github_pat|glpat)[-_][A-Za-z0-9_-]{16,}\b/g },
  { kind: 'khoá AWS', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'token Lark', re: /\b(t|u)-g[A-Za-z0-9]{20,}\b/g },
  { kind: 'App Secret / mật khẩu', re: /\b(app[_ ]?secret|client[_ ]?secret|secret|password|passwd|pwd|mat khau|mật khẩu|pass|token|api[_ ]?key|access[_ ]?key|cookie|csrf[_ ]?token)\s*[:=]\s*["'`]?[^\s"'`,;]{4,}["'`]?/gi },
  { kind: 'cookie', re: /\b(session|sid|_csrf_token|lark_oapi|passport_web_did)=[A-Za-z0-9%._-]{8,}/gi },
  { kind: 'chuỗi bí mật dài', re: /\b(?=[A-Za-z0-9+/_-]*[0-9])(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}/g },
];

export function stripSecretsFromText(text: string): { text: string; removed: string[] } {
  let out = String(text ?? '');
  const removed: string[] = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    out = out.replace(re, () => {
      if (!removed.includes(kind)) removed.push(kind);
      return '[đã gỡ bí mật]';
    });
  }
  return { text: out, removed };
}

/**
 * Câu cố CẤP QUYỀN — kỹ năng chỉ là chữ hướng dẫn, không được mở thứ luật duyệt đang chặn. So trên chữ
 * đã bỏ dấu, theo TỪNG câu/dòng; câu khớp bị bỏ cả câu.
 */
const GRANT_RE: RegExp[] = [
  /\b(khong can|khoi|bo qua) (xac nhan|duyet|cho phep)\b/,
  /\b(khong can|khoi|dung|khong) hoi (lai )?(truoc khi|khi|ma) (ghi|xoa|gui|ghi de|sua|thay|dinh thay)\b/,
  /\b(tu dong|tu) (duyet|cho phep|xac nhan)\b/,
  /\btu (xoa|ghi de|gui tin|gui vao nhom|thay tep)\b.{0,30}\b(khong hoi|luon|ngay)\b/,
  /\b(luon|cu) (xoa|ghi de|thay the|thay tep|gui tin|gui vao nhom)\b/,
  /\breplace\s*:\s*true\b.{0,30}\b(luon|always|mac dinh|default)\b/,
  /\b(tu dong|hay|cu|luon) (bat|enable|kich hoat) (workflow|automation|tu dong hoa)\b/,
  /\bauto[- ]?approv/,
  /\b(skip|bypass) (the )?(confirm|confirmation|approval)\b/,
  /\bwithout (asking|confirmation|approval)\b/,
  /\bno need to (ask|confirm)\b.{0,30}\b(delete|overwrite|replace|send|write)\b/,
  /\balways (delete|overwrite|replace|send)\b/,
];

export function stripPermissionGrants(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const lines = String(text ?? '').split(/\n/);
  const kept = lines.map((line) => {
    // Tách câu trong dòng (giữ dấu câu), bỏ câu khớp.
    const parts = line.split(/(?<=[.!?;])\s+/);
    const keepParts = parts.filter((p) => {
      const f = foldText(p);
      const hit = GRANT_RE.some((re) => re.test(f));
      if (hit) removed.push(p.trim().slice(0, 160));
      return !hit;
    });
    return keepParts.join(' ');
  });
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
}

/** Dòng cố định thêm vào mọi kỹ năng tự học — nhắc rằng kỹ năng không cấp quyền gì. */
export const LEARNED_SKILL_GUARD =
  'Lưu ý: đây là kỹ năng hướng dẫn cách làm — KHÔNG cấp quyền gì. Ghi đè / xoá / gửi tin / thay tệp vẫn theo luật duyệt của ứng dụng (hỏi người dùng, hoặc quyền đã cấp cho quy tắc tự động hoá).';

export interface SanitizedSkill {
  ok: boolean;
  name: string;
  instructions: string;
  triggers: string[];
  removedSecrets: string[];
  removedGrants: string[];
  error?: string;
}

/** Làm sạch một kỹ năng TỰ HỌC trước khi lưu. */
export function sanitizeLearnedSkill(input: { name?: string; instructions?: string; triggers?: unknown }): SanitizedSkill {
  const name0 = stripSecretsFromText(String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80));
  const sec = stripSecretsFromText(String(input.instructions ?? ''));
  const grants = stripPermissionGrants(sec.text);
  const trig0 = (Array.isArray(input.triggers) ? input.triggers : typeof input.triggers === 'string' ? String(input.triggers).split(/[|,\n]/) : [])
    .map((x) => stripSecretsFromText(String(x ?? '')).text.replace(/\s+/g, ' ').trim().slice(0, 60))
    .filter((x) => x && !x.includes('[đã gỡ bí mật]'));
  const triggers = [...new Set(trig0)].slice(0, 12);
  const removedSecrets = [...new Set([...name0.removed, ...sec.removed])];
  const body = grants.text.replace(/(\[đã gỡ bí mật\][\s,;]*){2,}/g, '[đã gỡ bí mật] ').trim();
  const meaningful = body.replace(/\[đã gỡ bí mật\]/g, '').replace(/[\s\p{P}]+/gu, '');
  if (!name0.text) return { ok: false, name: '', instructions: '', triggers, removedSecrets, removedGrants: grants.removed, error: 'Thiếu tên kỹ năng.' };
  if (meaningful.length < 12) {
    return {
      ok: false,
      name: name0.text,
      instructions: '',
      triggers,
      removedSecrets,
      removedGrants: grants.removed,
      error: removedSecrets.length || grants.removed.length
        ? 'Kỹ năng chỉ còn bí mật / câu cấp quyền — không lưu (kỹ năng là chữ hướng dẫn, không phải nơi cất mật khẩu hay cấp quyền).'
        : 'Nội dung kỹ năng quá ngắn.',
    };
  }
  return { ok: true, name: name0.text, instructions: body, triggers, removedSecrets, removedGrants: grants.removed };
}

const STOP = new Set(
  'va voi cua cho cac nhung mot khi thi la de vao ra tu tren duoi trong ngoai nay do khi nao hay bang the vay nhe nha luon tu gio lan sau nho moi file tep the and or the a an to of for in on with when then always from now next time use'.split(' '),
);
function tokens(s: string): Set<string> {
  return new Set(
    foldText(s)
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** Độ trùng ý giữa hai kỹ năng (0..1) — Jaccard trên từ (bỏ dấu, bỏ từ đệm) của tên + từ khoá + mô tả. */
export function skillSimilarity(a: { name: string; triggers?: string[]; description?: string }, b: { name: string; triggers?: string[]; description?: string }): number {
  const A = tokens([a.name, ...(a.triggers ?? []), a.description ?? ''].join(' '));
  const Bt = tokens([b.name, ...(b.triggers ?? []), b.description ?? ''].join(' '));
  if (!A.size || !Bt.size) return 0;
  let inter = 0;
  for (const w of A) if (Bt.has(w)) inter++;
  const nameSame = foldText(a.name) === foldText(b.name);
  return nameSame ? 1 : inter / (A.size + Bt.size - inter);
}

/** Kỹ năng đã có trùng ý nhất (≥ ngưỡng), hoặc null. */
export function findOverlap<T extends { id: string; name: string; triggers?: string[]; description?: string }>(
  cand: { name: string; triggers?: string[]; description?: string },
  skills: readonly T[],
  threshold = 0.5,
): { skill: T; score: number } | null {
  let best: { skill: T; score: number } | null = null;
  for (const s of skills) {
    const score = skillSimilarity(cand, s);
    if (score >= threshold && (!best || score > best.score)) best = { skill: s, score };
  }
  return best;
}

/** Khác biệt theo DÒNG giữa hai văn bản (LCS) — ' ' giữ, '-' bỏ, '+' thêm. */
export function lineDiff(a: string, b: string): { op: ' ' | '-' | '+'; line: string }[] {
  const A = String(a ?? '').split('\n');
  const Bl = String(b ?? '').split('\n');
  const n = A.length;
  const m = Bl.length;
  if (n * m > 4_000_000) return [...A.map((line) => ({ op: '-' as const, line })), ...Bl.map((line) => ({ op: '+' as const, line }))];
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === Bl[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { op: ' ' | '-' | '+'; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === Bl[j]) {
      out.push({ op: ' ', line: A[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', line: A[i++] });
    else out.push({ op: '+', line: Bl[j++] });
  }
  while (i < n) out.push({ op: '-', line: A[i++] });
  while (j < m) out.push({ op: '+', line: Bl[j++] });
  return out;
}
