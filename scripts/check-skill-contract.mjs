#!/usr/bin/env node
/**
 * Kiểm HỢP ĐỒNG KỸ NĂNG — hai luật mà sai là hỏng im lặng.
 *
 * 1. VÒNG TRÒN frontmatter: `serializeContract` ghi ra, `parseSkillContract` đọc lại, phải ra đúng
 *    cái ban đầu. Hai nửa này lệch nhau thì triệu chứng người dùng thấy là "hợp đồng tự nhiên biến
 *    mất" — không lỗi, không cảnh báo, chỉ là lần chạy sau bộ kỹ năng thôi kiểm chéo nhau.
 *
 * 2. ĐỌC ĐỀ XUẤT của mô hình: nó trả JSON tự do, và phần lọc ở đây là thứ chặn một đề xuất hỏng
 *    biến thành một hợp đồng hỏng nằm im trong SKILL.md.
 *
 * Chạy: node scripts/check-skill-contract.mjs   (cần `pnpm -C packages/core build` trước)
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'packages/core/dist/skillContract.js');
if (!existsSync(DIST)) {
  console.error('Chưa có bản dựng core. Chạy: pnpm -C packages/core build');
  process.exit(1);
}
const {
  serializeContract,
  contractFieldsFrom,
  parseContractSuggestion,
  buildContractSuggestPrompt,
} = await import(DIST);

let pass = 0,
  fail = 0;
const eq = (n, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++;
  else { fail++; console.log('\u2717', n, '\n  được:', A, '\n  cần :', B); }
};

// ── 1. vòng tròn frontmatter ──────────────────────────────────────────────────
const md = (c) => `---\nname: k\ndescription: d\n${serializeContract(c).join('\n')}\n---\n\n# K\n\nnội dung\n`;
const tgt = (g) => (g ? { base: g.base ?? null, table: g.table, map: g.map ?? {} } : null);
const norm = (x) =>
  JSON.stringify({ needs: x?.needs ?? [], produces: x?.produces ?? [], checks: x?.checks ?? [], target: tgt(x?.target) });
const trip = (n, c) => {
  const back = contractFieldsFrom(md(c));
  if (norm(back) === norm(c)) pass++;
  else { fail++; console.log('\u2717 vòng tròn:', n, '\n  ghi ra:\n' + md(c), '\n  đọc lại:', norm(back), '\n  cần   :', norm(c)); }
};
trip('cơ bản',{needs:['ten_hang'],produces:['gia_von'],checks:[]});
trip('nhiều khoá',{needs:['a','b','c'],produces:['d','e'],checks:[]});
trip('ràng buộc biểu thức',{needs:['gia_von'],produces:['gia_ban'],checks:['gia_ban >= gia_von * 1.2']});
trip('ràng buộc bằng lời',{needs:['mo_ta'],produces:['nganh_hang'],checks:['mô tả phải khớp ngành hàng đã phân loại']});
trip('ràng buộc CÓ dấu hai chấm',{needs:['a'],produces:['b'],checks:['lưu ý: b không được rỗng']});
trip('ràng buộc có nháy kép',{needs:['a'],produces:['b'],checks:['b phải là "đã duyệt"']});
trip('nhiều ràng buộc',{needs:[],produces:['x','y'],checks:['x > 0','y >= x']});
trip('bảng đích đủ',{needs:['ten_tep'],produces:['so_tien'],checks:[],target:{base:'Kho',table:'Hoá đơn',map:{so_tien:'Số tiền'}}});
trip('bảng đích không base',{needs:[],produces:['a'],checks:[],target:{table:'Bảng A',map:{a:'Cột A'}}});
trip('bảng đích tên có dấu hai chấm',{needs:[],produces:['a'],checks:[],target:{table:'Bảng: A',map:{a:'Cột: A'}}});
trip('map rỗng',{needs:[],produces:['a'],checks:[],target:{table:'T',map:{}}});
trip('chỉ produces',{needs:[],produces:['z'],checks:[]});

const empty = contractFieldsFrom(md({ needs: [], produces: [], checks: [] }));
if (empty === undefined) pass++;
else { fail++; console.log('\u2717 hợp đồng rỗng phải ra undefined, được:', JSON.stringify(empty)); }

// ── 2. đọc đề xuất của mô hình ────────────────────────────────────────────────
// 1. khối JSON CUỐI cùng, không phải cái ví dụ ở trên
eq('lấy khối cuối', parseContractSuggestion(
`Ví dụ mẫu:
\`\`\`json
{"needs":["vi_du"],"produces":["vi_du_ra"]}
\`\`\`
Đề xuất thật:
\`\`\`json
{"needs":["ten_hang"],"produces":["gia_von"],"checks":[]}
\`\`\``).produces, ['gia_von']);

// 2. khoá vừa needs vừa produces -> bỏ khỏi needs (nếu không sẽ tự chờ chính mình)
eq('bỏ chồng lấn', parseContractSuggestion(
'```json\n{"needs":["x","gia_ban"],"produces":["gia_ban"]}\n```').needs, ['x']);

// 3. tên khoá rác bị loại
eq('lọc tên rác', parseContractSuggestion(
'```json\n{"needs":["giá vốn","2bad","ok_key",""],"produces":[]}\n```').needs, ['ok_key']);

// 4. check nhắc khoá lạ hoàn toàn -> bỏ
eq('bỏ check khoá lạ', parseContractSuggestion(
'```json\n{"needs":["a"],"produces":["b"],"checks":["b > a","zzz > qqq"]}\n```').checks, ['b > a']);

// 5. JSON hỏng -> rỗng, không ném
eq('JSON hỏng', parseContractSuggestion('không phải json gì cả'), {});

// 6. trùng lặp bị gộp
eq('gộp trùng', parseContractSuggestion(
'```json\n{"needs":["a","a","b"],"produces":[]}\n```').needs, ['a','b']);

// 7. note giữ lại
eq('giữ note', parseContractSuggestion(
'```json\n{"needs":[],"produces":["x"],"note":"vì x là đầu ra duy nhất"}\n```').note, 'vì x là đầu ra duy nhất');

// 8. lời nhắc có nhét khoá sẵn có vào
const p = buildContractSuggestPrompt('Tra giá vốn','Tìm giá nhập từ bảng NCC', ['ten_hang','gia_von','BAD KEY']);
eq('lời nhắc nêu khoá sẵn có', /gia_von, ten_hang/.test(p) && !/BAD KEY/.test(p), true);


// ── 3. bộ kỹ năng DỰNG SẴN (apps/desktop/main/runtime/skills/builtinSkills.ts) ────────────────
// Hợp đồng của từng kỹ năng phải ghi ra ↔ đọc lại y nguyên; ràng buộc biểu thức chỉ nhắc khoá của
// chính nó; không hai kỹ năng dựng sẵn cùng sinh một khoá; không kỹ năng nào nối thành bộ với cái khác.
{
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const out = mkdtempSync(join(tmpdir(), 'lw-builtin-'));
  try {
    execFileSync('npx', ['tsc', join(ROOT, 'apps/desktop/main/runtime/skills/builtinSkills.ts'), '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { BUILTIN_SKILLS } = req(join(out, 'builtinSkills.js'));
    const { parseSkillContract, duplicateProducers, relatedSet } = await import(DIST);
    // NGƯỠNG SÀN, không phải con số chính xác. Bản cũ đòi đúng 7 và đã đỏ im lìm từ khi bộ kỹ
    // năng lên 12 — phép kiểm nào phải sửa tay mỗi lần thêm kỹ năng thì rốt cuộc không ai sửa.
    // Rủi ro thật cần canh là kỹ năng BIẾN MẤT, nên canh sàn.
    const SAN = 10;
    eq(`có ≥${SAN} kỹ năng dựng sẵn (hiện ${BUILTIN_SKILLS.length})`, BUILTIN_SKILLS.length >= SAN, true);
    const parsed = [];
    for (const d of BUILTIN_SKILLS) {
      trip(`dựng sẵn ${d.id}`, d.contract);
      const c = parseSkillContract(d.id, d.name, md(d.contract));
      const own = new Set([...d.contract.needs, ...d.contract.produces]);
      eq(`${d.id}: ràng buộc chỉ nhắc khoá của mình`, c.checks.flatMap((x) => x.refs).every((r) => own.has(r)), true);
      eq(`${d.id}: id có tiền tố lw-`, d.id.startsWith('lw-'), true);
      parsed.push(c);
    }
    eq('không hai kỹ năng dựng sẵn cùng sinh một khoá', duplicateProducers(parsed), []);
    eq('kỹ năng dựng sẵn không nối thành bộ', parsed.every((c) => relatedSet(parsed, c.id).length === 1), true);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

console.log(`\n${pass} đạt, ${fail} hỏng`);
if (fail) process.exit(1);
