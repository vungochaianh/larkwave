/**
 * Hợp đồng dữ liệu của skill — nền cho việc "5-7 skill kiểm chéo nhau liên tục".
 *
 * Vấn đề có thật: một bước như "mô tả và phân tích hàng hoá" gồm 5-7 skill, nhưng chúng KHÔNG
 * chạy theo 1→7. Có lượt AI chạy 3→1→2→4… và không có gì bảo đảm bước 3 đã đủ dữ liệu để chạy,
 * cũng không có gì phát hiện kết quả bước 3 mâu thuẫn với bước 1 chạy sau nó.
 *
 * Cách chữa: **bỏ hẳn khái niệm thứ tự do người đánh số.** Mỗi skill khai báo nó CẦN gì
 * (`needs`) và RA gì (`produces`); thứ tự là HỆ QUẢ của dữ liệu, không phải do ai xếp. Skill nào
 * đủ `needs` thì chạy được — nên 3→1→2 và 1→2→3 đều đúng nếu dữ liệu cho phép, và cái sai thật
 * (chạy khi chưa đủ dữ liệu) bị chặn thay vì trôi qua.
 *
 * `checks` là phần "kiểm chéo": một ràng buộc tham chiếu tới khoá của NHIỀU skill. Mỗi lần có
 * khoá mới, mọi check đủ dữ liệu được chạy LẠI — nên mâu thuẫn lộ ngay tại bước gây ra nó, chứ
 * không phải ở cuối khi đã muộn.
 *
 * VÌ SAO LÀ MÃ CHỨ KHÔNG PHẢI PROMPT: dự án này đã dính nhiều lần chuyện đặt một ràng buộc kiến
 * trúc vào prompt rồi mô hình lặng lẽ bỏ qua (xem bộ site suite: prompt cấm sinh backend, mô hình
 * vẫn sinh, và 4 cơ sở dữ liệu ra đời). Một câu "hãy kiểm tra chéo" trong system prompt hỏng theo
 * đúng kiểu đó — trông như có, thật ra không. Nên `evalCheck` tính THẬT ở đây.
 *
 * Module THUẦN: không fs, không mạng, không electron — để bài kiểm gọi đúng luật này chứ không
 * phải một bản chép.
 */

/** Hợp đồng đọc ra từ frontmatter của một SKILL.md. */
export interface SkillContract {
  id: string;
  name: string;
  /** Khoá skill này cần có TRƯỚC khi chạy được. Rỗng = chạy được ngay từ đầu. */
  needs: string[];
  /** Khoá skill này sinh ra khi chạy xong. Rỗng = skill không góp dữ liệu (chỉ làm việc phụ). */
  produces: string[];
  /** Ràng buộc kiểm chéo. Xem `parseCheck`. */
  checks: SkillCheck[];
  /** Đích ghi, nếu kỹ năng này là loại trích-xuất-rồi-ghi-bảng. */
  target?: SkillTarget;
}

/**
 * Hợp đồng ở dạng NGƯỜI DÙNG NHẬP — trước khi phân tích.
 *
 * Khác `SkillContract` ở hai chỗ, và cả hai đều cố ý:
 *   • `checks` là chuỗi nguyên văn, chưa tách thành `expr`/`prose`. Form phải hiện lại đúng câu
 *     người ta gõ; hiện bản đã biến đổi là bắt họ học một ngôn ngữ thứ hai.
 *   • Mọi trường đều không bắt buộc. Một kỹ năng không khai gì cả vẫn hợp lệ — đó là đa số kỹ năng.
 *
 * Đây là kiểu đi qua form, qua IPC, và xuống `buildFrontmatter`. `parseSkillContract` mới là chiều
 * ngược lại: đọc file → `SkillContract`.
 */
export interface SkillContractFields {
  needs?: string[];
  produces?: string[];
  /** Nguyên văn, mỗi phần tử một ràng buộc. */
  checks?: string[];
  target?: SkillTarget;
}

/**
 * Một ràng buộc. Hai loại, và sự khác nhau là quan trọng:
 *   • `expr` — máy tự tính, đúng/sai dứt khoát, không cãi được. Ưu tiên loại này.
 *   • `prose` — cần hiểu ngữ nghĩa ("mô tả phải khớp danh mục"), phải nhờ mô hình phán.
 *     Kết quả loại này KHÔNG bao giờ được coi là bằng chứng chắc như `expr`.
 */
export interface SkillCheck {
  /** Skill khai ràng buộc này — để câu báo lỗi nói được "skill nào chỏi skill nào". */
  owner: string;
  kind: 'expr' | 'prose';
  /** Nguyên văn người dùng viết — luôn hiện lại cho họ, đừng hiện bản đã biến đổi. */
  raw: string;
  /** Các khoá ràng buộc này tham chiếu tới. Quyết định KHI NÀO nó chạy được. */
  refs: string[];
  /** Chỉ với kind==='expr': vế trái, toán tử, vế phải. */
  left?: string;
  op?: CompareOp;
  right?: string;
}

/**
 * Đích GHI của một kỹ năng trích xuất: đọc tệp → lấy các khoá đã khai → ghi thành bản ghi.
 *
 * Khai trong SKILL.md, không chọn lúc chạy, vì đây là "format chốt từ đầu": cùng một loại chứng
 * từ thì lần nào cũng phải ra đúng bấy nhiêu cột. Chọn lại mỗi lần chạy là mời sai khác len vào
 * giữa hai lần nhập cùng một loại tài liệu.
 */
export interface SkillTarget {
  /** Tên Base. Bỏ trống = Base đang hoạt động trong hội thoại. */
  base?: string;
  /** Tên bảng (hoặc table_id). BẮT BUỘC — không đoán. */
  table: string;
  /** khoá trong `produces` → TÊN CỘT trong bảng. Khoá không có trong map thì không ghi. */
  map: Record<string, string>;
}

export type CompareOp = '>=' | '<=' | '==' | '!=' | '>' | '<';

/** Bảng dữ liệu tích luỹ trong một lượt chạy bộ skill. */
export type FactSheet = Record<string, string | number | boolean | null>;

/** Kết quả chạy một ràng buộc. `unknown` = chưa đủ dữ liệu, KHÁC HẲN `fail`. */
export type CheckVerdict = 'pass' | 'fail' | 'unknown';

export interface CheckResult {
  check: SkillCheck;
  verdict: CheckVerdict;
  /** Vì sao — hiện cho người dùng đọc, nên viết bằng tiếng người. */
  reason: string;
}

// ── Đọc hợp đồng từ frontmatter ────────────────────────────────────────────────────────────

/** Tên khoá hợp lệ: chữ/số/gạch dưới, không dấu cách. Giữ hẹp để `expr` phân tích được. */
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Đọc một trường dạng danh sách: `needs: [a, b]` hoặc xuống dòng có gạch đầu dòng. */
function readList(front: string, field: string): string[] {
  const inline = front.match(new RegExp(`^${field}:\\s*\\[(.*?)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const block = front.match(new RegExp(`^${field}:\\s*\\n((?:\\s*-\\s*.+\\n?)+)`, 'm'));
  if (!block) return [];
  return block[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Phân tích một ràng buộc.
 *
 * Dạng `expr` phải là ĐÚNG "<khoá> <toán tử> <khoá|số>". Cố tình hẹp: một bộ phân tích biểu thức
 * đầy đủ ở đây sẽ đẻ ra những ràng buộc trông như chạy được mà thật ra im lặng trả `unknown`.
 * Không khớp ⇒ coi là `prose` và giao cho mô hình, chứ KHÔNG vứt đi — vứt đi là người dùng viết
 * một ràng buộc rồi nó biến mất không báo gì.
 */
export function parseCheck(owner: string, raw: string, knownKeys: ReadonlySet<string>): SkillCheck {
  const text = raw.trim().replace(/\s*#.*$/, '').trim(); // bỏ chú thích cuối dòng
  const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|==|!=|>|<)\s*(.+?)$/);
  if (m) {
    const left = m[1];
    const op = m[2] as CompareOp;
    const right = m[3].trim().replace(/^["']|["']$/g, '');
    const refs = [left];
    if (KEY_RE.test(right)) refs.push(right);
    return { owner, kind: 'expr', raw: raw.trim(), refs, left, op, right };
  }
  // Ràng buộc bằng lời: khoá nào được NHẮC TÊN trong câu thì là khoá nó phụ thuộc. Nhờ vậy một
  // câu như "mô tả phải khớp danh_muc" cũng biết chờ `danh_muc` mới chạy được.
  const refs = [...knownKeys].filter((k) => new RegExp(`\\b${k}\\b`).test(text));
  return { owner, kind: 'prose', raw: raw.trim(), refs };
}

/**
 * Đọc khối `target:` (YAML lồng hai mức).
 *
 * Bộ đọc frontmatter ở đây là loại thủ công chứ không phải YAML đầy đủ — cố ý, vì kéo cả một thư
 * viện YAML vào `packages/core` sẽ theo chân vào bundle VM. Đổi lại phải chấp nhận đúng một dạng
 * thụt lề, và khai sai thì `target` là `undefined` chứ không ném: một kỹ năng khai sai đích vẫn
 * phải chạy được phần trích xuất, chỉ là không ghi.
 */
function readTarget(front: string): SkillTarget | undefined {
  const m = front.match(/^target:\s*\n((?:[ \t]+.*\n?)+)/m);
  if (!m) return undefined;
  const block = m[1];
  const one = (field: string): string => {
    const r = block.match(new RegExp(`^[ \\t]+${field}:[ \\t]*(.+)$`, 'm'));
    return r ? r[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const table = one('table');
  if (!table) return undefined; // không có bảng thì không có đích — đừng đoán
  const map: Record<string, string> = {};
  const mapBlock = block.match(/^[ \t]+map:\s*\n((?:[ \t]{2,}.*\n?)+)/m);
  if (mapBlock) {
    for (const line of mapBlock[1].split('\n')) {
      const kv = line.match(/^[ \t]+([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.+)$/);
      if (kv) map[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  const base = one('base');
  return { table, map, ...(base ? { base } : {}) };
}

/**
 * Đọc hợp đồng từ nội dung SKILL.md. Không có trường nào ⇒ hợp đồng rỗng, và skill đó chạy như
 * cũ — tính năng này KHÔNG được làm hỏng các skill đã có.
 */
export function parseSkillContract(
  id: string,
  name: string,
  skillMd: string,
  knownKeys?: ReadonlySet<string>,
): SkillContract {
  const m = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  const front = m ? m[1] : '';
  const needs = readList(front, 'needs').filter((k) => KEY_RE.test(k));
  const produces = readList(front, 'produces').filter((k) => KEY_RE.test(k));
  const keys = knownKeys ?? new Set([...needs, ...produces]);
  const checks = readList(front, 'checks').map((raw) => parseCheck(id, raw, keys));
  const target = readTarget(front);
  return { id, name, needs, produces, checks, ...(target ? { target } : {}) };
}

// ── Thứ tự là HỆ QUẢ, không phải do ai xếp ────────────────────────────────────────────────

/** Skill nào chạy được NGAY BÂY GIỜ: đủ `needs`, và chưa chạy. */
export function readySkills(
  contracts: readonly SkillContract[],
  facts: FactSheet,
  done: ReadonlySet<string>,
): SkillContract[] {
  const have = new Set(Object.keys(facts));
  return contracts.filter((c) => !done.has(c.id) && c.needs.every((n) => have.has(n)));
}

/**
 * Vì sao bế tắc: những skill chưa chạy được và KHOÁ nào còn thiếu.
 *
 * Trả về thay vì ném, để người dùng đọc được "thiếu `gia_von`, không skill nào sinh ra nó" —
 * câu đó sửa được. Treo im hoặc báo "không chạy được" thì không sửa được.
 */
export function blockedReport(
  contracts: readonly SkillContract[],
  facts: FactSheet,
  done: ReadonlySet<string>,
): { id: string; name: string; missing: string[]; nobodyProduces: string[] }[] {
  const have = new Set(Object.keys(facts));
  const producible = new Set(contracts.flatMap((c) => (done.has(c.id) ? [] : c.produces)));
  return contracts
    .filter((c) => !done.has(c.id))
    .map((c) => {
      const missing = c.needs.filter((n) => !have.has(n));
      return {
        id: c.id,
        name: c.name,
        missing,
        // Khoá thiếu mà KHÔNG skill nào còn lại sinh ra ⇒ bế tắc thật, không phải chờ.
        nobodyProduces: missing.filter((n) => !producible.has(n)),
      };
    })
    .filter((r) => r.missing.length > 0);
}

/**
 * Hai skill cùng khai sinh một khoá — xung đột hợp đồng, phát hiện được TRƯỚC khi chạy.
 * Không chặn thì khoá đó phụ thuộc vào skill nào chạy sau, tức là kết quả đổi theo thứ tự — đúng
 * thứ tính năng này sinh ra để loại bỏ.
 */
export function duplicateProducers(contracts: readonly SkillContract[]): { key: string; owners: string[] }[] {
  const by = new Map<string, string[]>();
  for (const c of contracts) for (const p of c.produces) by.set(p, [...(by.get(p) ?? []), c.name]);
  return [...by.entries()].filter(([, owners]) => owners.length > 1).map(([key, owners]) => ({ key, owners }));
}

/**
 * Bộ skill chứa `startId`: mọi skill nối với nó qua quan hệ dữ liệu, lan truyền cả hai chiều.
 *
 * Cố ý KHÔNG thêm cú pháp `set:` để người dùng tự gom nhóm. Nhóm mà khai bằng tay thì sẽ lệch với
 * quan hệ dữ liệu thật ngay lần sửa skill đầu tiên, và lúc đó thứ chạy sai lại là thứ không ai
 * nhìn. Ở đây "cùng một bộ" CÓ NGHĨA LÀ "dính nhau về dữ liệu" — đúng thứ khiến chúng cần kiểm
 * chéo nhau. Hai skill không liên quan gì thì không bị kéo vào, dù người dùng có gắn cùng thẻ.
 *
 * Ràng buộc cũng là dây nối: một `check` nhắc tới khoá của skill khác thì hai skill đó cùng bộ,
 * kể cả khi chúng không trao dữ liệu trực tiếp cho nhau.
 */
export function relatedSet(contracts: readonly SkillContract[], startId: string): SkillContract[] {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  if (!byId.has(startId)) return [];
  const keysOf = (c: SkillContract) =>
    new Set([...c.needs, ...c.produces, ...c.checks.flatMap((k) => k.refs)]);
  const chosen = new Set([startId]);
  let grew = true;
  while (grew) {
    grew = false;
    const pool = new Set([...chosen].flatMap((id) => [...keysOf(byId.get(id)!)]));
    for (const c of contracts) {
      if (chosen.has(c.id)) continue;
      if ([...keysOf(c)].some((k) => pool.has(k))) {
        chosen.add(c.id);
        grew = true;
      }
    }
  }
  // Giữ nguyên thứ tự người dùng viết — thứ tự CHẠY do dữ liệu quyết định, nhưng thứ tự HIỆN ra
  // cho người đọc thì nên ổn định và quen mắt.
  return contracts.filter((c) => chosen.has(c.id));
}

/** Skill này có khai hợp đồng gì không. Không khai ⇒ chạy theo đường cũ, không đụng tới. */
export function hasContract(c: SkillContract): boolean {
  return c.needs.length > 0 || c.produces.length > 0 || c.checks.length > 0 || !!c.target;
}

// ── Chạy ràng buộc ────────────────────────────────────────────────────────────────────────

/**
 * Đọc một giá trị thành số, chịu được cách viết số của người Việt.
 *
 * Dữ liệu ở đây đến từ Bitable nên "1.200.000" và "1,5" là chuyện thường ngày. Không xử đúng thì
 * MỌI so sánh tiền tệ im lặng trả `unknown` — tức là ràng buộc trông như có mà chưa bao giờ chạy,
 * đúng kiểu hỏng tệ nhất cho tính năng này.
 *
 * Chỗ nhập nhằng thật: "1,200" đọc kiểu Mỹ là 1200, kiểu Việt là 1,2. Quy ước chọn ở đây là
 * **nhóm đúng 3 chữ số thì coi là phân cách hàng nghìn**, vì đó là cách viết phổ biến hơn hẳn;
 * "1,5" (một chữ số) vẫn đọc là 1.5. Quy ước, không phải chân lý — nên nó được viết ra đây.
 */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().replace(/[₫\s]/g, '');
  if (!cleaned) return null;
  let normalized: string;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.'); // 1.200.000  |  1.200,50
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    normalized = cleaned.replace(/,/g, ''); // 1,200,000  |  1,200.50
  } else if (/^-?\d+,\d+$/.test(cleaned)) {
    normalized = cleaned.replace(',', '.'); // 1,5
  } else {
    normalized = cleaned; // 0.2 — dấu chấm ở đây là thập phân, đừng đụng vào
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function compare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
}

/**
 * Chạy một ràng buộc trên bảng dữ liệu hiện có.
 *
 * `prose` LUÔN trả `unknown` ở đây — module này không có mô hình để phán. Người gọi phải hỏi mô
 * hình riêng. Cố tình không đoán bừa: một ràng buộc ngữ nghĩa mà tự nhận `pass` là tệ hơn không
 * có ràng buộc, vì nó tạo cảm giác đã kiểm.
 */
export function evalCheck(check: SkillCheck, facts: FactSheet): CheckResult {
  if (check.kind === 'prose') {
    const have = new Set(Object.keys(facts));
    const missing = check.refs.filter((r) => !have.has(r));
    return {
      check,
      verdict: 'unknown',
      reason: missing.length ? `chờ ${missing.join(', ')}` : 'cần mô hình phán (ràng buộc bằng lời)',
    };
  }
  const have = new Set(Object.keys(facts));
  const missing = check.refs.filter((r) => !have.has(r));
  if (missing.length) return { check, verdict: 'unknown', reason: `chờ ${missing.join(', ')}` };

  const l = asNumber(facts[check.left!]);
  const rRaw = KEY_RE.test(check.right!) && have.has(check.right!) ? facts[check.right!] : check.right!;
  const r = asNumber(rRaw);

  if (l === null || r === null) {
    // So sánh không phải số: chỉ == / != là có nghĩa, còn lại là ràng buộc viết sai.
    const ls = String(facts[check.left!] ?? '');
    const rs = String(rRaw ?? '');
    if (check.op === '==') return mk(check, ls === rs, `"${ls}" ${ls === rs ? '=' : '≠'} "${rs}"`);
    if (check.op === '!=') return mk(check, ls !== rs, `"${ls}" ${ls !== rs ? '≠' : '='} "${rs}"`);
    return { check, verdict: 'unknown', reason: `không so sánh được bằng số: "${ls}" ${check.op} "${rs}"` };
  }
  return mk(check, compare(check.op!, l, r), `${l} ${check.op} ${r}`);
}

function mk(check: SkillCheck, ok: boolean, detail: string): CheckResult {
  return { check, verdict: ok ? 'pass' : 'fail', reason: ok ? `đúng (${detail})` : `SAI (${detail})` };
}

/**
 * Chạy MỌI ràng buộc của MỌI skill trên bảng dữ liệu hiện tại — đây là "kiểm chéo liên tục":
 * gọi lại sau mỗi lần có khoá mới, không phải một lần ở cuối.
 *
 * Trả về cả `unknown` chứ không lọc bỏ, để giao diện nói được "còn 3 ràng buộc chưa kiểm được"
 * thay vì im lặng làm như đã kiểm hết.
 */
export function runChecks(contracts: readonly SkillContract[], facts: FactSheet): CheckResult[] {
  return contracts.flatMap((c) => c.checks.map((ck) => evalCheck(ck, facts)));
}

/** Những ràng buộc vừa ĐỔI trạng thái so với lượt trước — chỉ cái này mới đáng báo cho người dùng. */
export function changedVerdicts(prev: readonly CheckResult[], next: readonly CheckResult[]): CheckResult[] {
  const before = new Map(prev.map((r) => [`${r.check.owner}::${r.check.raw}`, r.verdict]));
  return next.filter((r) => before.get(`${r.check.owner}::${r.check.raw}`) !== r.verdict);
}

/**
 * Từ kết quả trích xuất của nhiều tệp → những bản ghi ĐƯỢC PHÉP ghi vào bảng.
 *
 * Đây là luật quan trọng nhất của cả tính năng, nên nó nằm ở hàm thuần có bài kiểm chứ không nằm
 * rải trong mã gọi Lark: **tệp nào còn ràng buộc SAI thì không ghi.** Nếu để agent vừa trích vừa
 * ghi, dòng sai đã nằm trong Base trước khi ai kịp kiểm — đúng thứ người dùng đang phải đi dọn
 * bằng tay.
 *
 * Hai luật phụ, cũng đáng giữ:
 *  • Chỉ ghi khoá CÓ trong `map`. Khoá trích ra mà không khai cột là dữ liệu phụ; đổ hết vào bảng
 *    là đẻ ra cột rác.
 *  • `null` coi như không có. Ghi null đè lên ô đang có dữ liệu là xoá mất dữ liệu cũ.
 */
export function rowsToWrite(
  rows: readonly { file: string; facts: FactSheet; failing: readonly string[] }[],
  target: SkillTarget,
): { fields: Record<string, string | number | boolean> }[] {
  const out: { fields: Record<string, string | number | boolean> }[] = [];
  for (const r of rows) {
    if (r.failing.length) continue; // ràng buộc sai ⇒ KHÔNG ghi, dù đã trích được gì
    const fields: Record<string, string | number | boolean> = {};
    for (const [key, column] of Object.entries(target.map)) {
      const v = r.facts[key];
      if (v === undefined || v === null || v === '') continue;
      fields[column] = v;
    }
    // Không có cột nào có giá trị ⇒ một dòng trống, ghi vào chỉ làm bẩn bảng.
    if (Object.keys(fields).length) out.push({ fields });
  }
  return out;
}

// ── Đọc khối dữ liệu mô hình trả về ───────────────────────────────────────────────────────

/**
 * Mô hình được yêu cầu kết thúc mỗi skill bằng một khối:
 *
 *     ```facts
 *     gia_ban: 120000
 *     bien_loi_nhuan: 0.2
 *     ```
 *
 * Lấy khối CUỐI CÙNG: mô hình hay nhắc lại ví dụ ở đoạn giải thích phía trên, và lấy khối đầu
 * sẽ nhặt đúng cái ví dụ đó thay vì kết quả thật.
 */
export function parseFactBlock(text: string): FactSheet {
  const blocks = [...text.matchAll(/```facts\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return {};
  const body = blocks[blocks.length - 1][1];
  const out: FactSheet = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (v === '' ) continue;
    if (v === 'true' || v === 'false') out[m[1]] = v === 'true';
    else if (v === 'null') out[m[1]] = null;
    else {
      const n = Number(v);
      out[m[1]] = Number.isFinite(n) && v !== '' && /^-?[\d.]+$/.test(v) ? n : v;
    }
  }
  return out;
}

// ── Đề xuất hợp đồng từ lời mô tả ─────────────────────────────────────────────────────────

/**
 * Lời nhắc để mô hình đề xuất `needs`/`produces`/`checks` từ phần mô tả người dùng viết bằng lời.
 *
 * Vì sao cần: tên khoá là thứ máy đọc, còn người dùng viết kỹ năng bằng tiếng Việt. Bắt họ tự nghĩ
 * ra tên khoá VÀ tự khớp tên đó cho khớp giữa bảy kỹ năng chính là phần việc mà tính năng này sinh
 * ra để khỏi phải làm — tự khớp tay thì `gia_von` ở kỹ năng này sẽ thành `giaVon` ở kỹ năng kia và
 * hai cái đó không bao giờ nối được với nhau.
 *
 * `existingKeys` là khoá các kỹ năng khác ĐÃ khai. Truyền vào để mô hình dùng lại tên có sẵn thay
 * vì đẻ ra tên đồng nghĩa — đây là điểm khác biệt lớn nhất giữa đề xuất dùng được và đề xuất phải
 * sửa lại hết.
 */
export function buildContractSuggestPrompt(
  name: string,
  instructions: string,
  existingKeys: readonly string[] = [],
): string {
  const known = [...new Set(existingKeys.filter((k) => KEY_RE.test(k)))].sort();
  return [
    'Bạn đang giúp người dùng khai HỢP ĐỒNG cho một kỹ năng, để nhiều kỹ năng tự nối với nhau.',
    '',
    `TÊN KỸ NĂNG: ${name}`,
    'NỘI DUNG KỸ NĂNG:',
    '"""',
    instructions.slice(0, 6000),
    '"""',
    '',
    known.length
      ? `KHOÁ CÁC KỸ NĂNG KHÁC ĐÃ DÙNG (ưu tiên DÙNG LẠI, đừng đặt tên đồng nghĩa):\n${known.join(', ')}`
      : 'Chưa có kỹ năng nào khai khoá — bạn đang đặt tên đầu tiên, hãy đặt tên tổng quát, dễ dùng lại.',
    '',
    'Trả lời DUY NHẤT một khối JSON, không giải thích gì thêm ngoài khối đó:',
    '```json',
    '{',
    '  "needs": ["khoa_can_co_truoc"],',
    '  "produces": ["khoa_ky_nang_nay_sinh_ra"],',
    '  "checks": ["gia_ban >= gia_von * 1.2"],',
    '  "note": "một câu tiếng Việt nói vì sao chọn các khoá này"',
    '}',
    '```',
    '',
    'LUẬT BẮT BUỘC:',
    '1. Tên khoá: chữ thường không dấu, nối bằng gạch dưới (vi_du_the_nay). Không dùng tiếng Anh nếu tiếng Việt rõ hơn.',
    '2. `needs` chỉ gồm khoá kỹ năng này ĐỌC mà KHÔNG tự tạo ra. Kỹ năng chạy đầu tiên thì để mảng rỗng.',
    '3. `produces` chỉ gồm khoá kỹ năng này THỰC SỰ tính ra được và nói ra ở cuối. Không khai thừa.',
    '4. Một khoá KHÔNG được vừa nằm trong `needs` vừa nằm trong `produces`.',
    '5. `checks` là ràng buộc phải LUÔN đúng, kể cả sau khi kỹ năng khác chạy. Ưu tiên biểu thức so',
    '   sánh máy tự tính được (>=, <=, ==, >, <, !=) hơn là câu mô tả bằng lời. Không nghĩ ra ràng',
    '   buộc thật thì để mảng rỗng — ràng buộc bịa còn hại hơn không có.',
    '6. Chỉ dùng khoá xuất hiện trong `needs` hoặc `produces` khi viết `checks`.',
  ].join('\n');
}

/**
 * Đọc đề xuất mô hình trả về. KHÔNG tin, phải lọc.
 *
 * Lấy khối JSON CUỐI CÙNG: mô hình hay chép lại cái ví dụ ở phần giải thích phía trên, và lấy khối
 * đầu là nhặt đúng cái ví dụ đó thay vì đề xuất thật — cùng bẫy với `parseFactBlock`.
 *
 * Trả về đề xuất đã lọc; hỏng hoàn toàn thì trả rỗng chứ không ném, vì đây là GỢI Ý — người dùng
 * vẫn gõ tay được, và một hộp thoại lỗi ở đây chỉ chặn đường họ.
 */
export function parseContractSuggestion(text: string): SkillContractFields & { note?: string } {
  const blocks = [...String(text || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const raw = blocks.length ? blocks[blocks.length - 1][1] : String(text || '');
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.trim()) as Record<string, unknown>;
  } catch {
    return {};
  }
  const keyList = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.map((x) => String(x ?? '').trim()).filter((k) => KEY_RE.test(k)))]
      : [];

  const produces = keyList(obj.produces);
  // Luật 4 áp ở ĐÂY chứ không chỉ nhờ mô hình tuân thủ: một khoá vừa `needs` vừa `produces` thì kỹ
  // năng tự chờ chính mình — `readySkills` sẽ không bao giờ chọn nó, và người dùng chỉ thấy "bế
  // tắc" mà không hiểu vì sao. `produces` là lời khai mạnh hơn nên `needs` phải nhường.
  const produced = new Set(produces);
  const needs = keyList(obj.needs).filter((k) => !produced.has(k));

  const known = new Set([...needs, ...produces]);
  const checks = (Array.isArray(obj.checks) ? obj.checks : [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean)
    // Ràng buộc nhắc tới khoá không kỹ năng nào trong hợp đồng này biết tới thì mãi mãi ở trạng
    // thái "chưa biết" — vô hại nhưng vô dụng, và làm người dùng tưởng đã có kiểm tra.
    .filter((c) => {
      const used = (c.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((w) => !/^(and|or|not)$/i.test(w));
      return used.length === 0 || used.some((w) => known.has(w));
    });

  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;
  return { needs, produces, checks, ...(note ? { note } : {}) };
}

/**
 * Dựng `SkillContract[]` từ danh sách kỹ năng mà giao diện đang có.
 *
 * Vì sao cần: `relatedSet()` gom bộ theo quan hệ dữ liệu THẬT, kể cả dây nối qua `checks`. Giao
 * diện chỉ cầm `SkillContractFields` (checks còn là chuỗi nguyên văn), nên nếu nó tự gom bộ bằng
 * một vòng lặp riêng thì sẽ có hai luật "cùng một bộ" trong hệ thống — và cái chạy sai sẽ là cái
 * người dùng nhìn thấy, trong khi cái đúng nằm ở chỗ không ai mở ra.
 */
export function contractsFromFields(
  list: readonly { id: string; name: string; contract?: SkillContractFields }[],
): SkillContract[] {
  const known = new Set(list.flatMap((s) => [...(s.contract?.needs ?? []), ...(s.contract?.produces ?? [])]));
  return list
    .filter((s) => s.contract)
    .map((s) => ({
      id: s.id,
      name: s.name,
      needs: s.contract!.needs ?? [],
      produces: s.contract!.produces ?? [],
      checks: (s.contract!.checks ?? []).map((raw) => parseCheck(s.id, raw, known)),
      ...(s.contract!.target ? { target: s.contract!.target } : {}),
    }));
}

/**
 * Ghi hợp đồng thành các dòng frontmatter — NỬA KIA của `parseSkillContract`.
 *
 * Cố ý đặt cạnh bộ đọc trong cùng một file: đây là hai nửa của MỘT định dạng, và khi chúng nằm hai
 * nơi thì chúng trôi lệch nhau trong im lặng — bên ghi đổi cách xuống dòng, bên đọc không khớp
 * nữa, và triệu chứng người dùng thấy là "hợp đồng tự nhiên biến mất". Ở cạnh nhau thì một bài
 * kiểm vòng-tròn bắt được ngay.
 */
export function serializeContract(c: SkillContractFields | undefined): string[] {
  if (!c) return [];
  const lines: string[] = [];
  // Trích dẫn CHỈ khi cần: một chuỗi có `:` hoặc `#` sẽ phá cú pháp YAML nếu để trần. Dùng nháy
  // đơn khi nội dung có nháy kép, để không phải thoát ký tự — mà bộ đọc chỉ bóc nháy ngoài cùng
  // chứ không hiểu ký tự thoát, nên chuỗi thoát sẽ lọt nguyên dấu `\` vào ràng buộc.
  const q = (v: string): string => {
    if (!/[:#'"\[\]{}]|^\s|\s$/.test(v)) return v;
    return v.includes('"') ? `'${v.replace(/'/g, '')}'` : `"${v}"`;
  };
  if (c.needs?.length) lines.push(`needs: [${c.needs.join(', ')}]`);
  if (c.produces?.length) lines.push(`produces: [${c.produces.join(', ')}]`);
  if (c.checks?.length) {
    lines.push('checks:');
    for (const raw of c.checks) lines.push(`  - ${q(raw)}`);
  }
  if (c.target?.table) {
    lines.push('target:');
    if (c.target.base) lines.push(`  base: ${q(c.target.base)}`);
    lines.push(`  table: ${q(c.target.table)}`);
    const map = c.target.map ?? {};
    if (Object.keys(map).length) {
      lines.push('  map:');
      for (const [k, v] of Object.entries(map)) lines.push(`    ${k}: ${q(v)}`);
    }
  }
  return lines;
}

/** Hợp đồng đọc ra từ một SKILL.md, ở dạng form dùng được — `undefined` nếu không khai gì. */
export function contractFieldsFrom(skillMd: string): SkillContractFields | undefined {
  const c = parseSkillContract('x', 'x', skillMd);
  if (!c.needs.length && !c.produces.length && !c.checks.length && !c.target) return undefined;
  return {
    needs: c.needs,
    produces: c.produces,
    checks: c.checks.map((k) => k.raw),
    ...(c.target ? { target: c.target } : {}),
  };
}
