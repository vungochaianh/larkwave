/**
 * Hợp đồng skill + kiểm chéo liên tục.
 *
 * Ca thật người dùng nêu: một bước "mô tả và phân tích hàng hoá" có 5-7 skill, và chúng KHÔNG
 * chạy 1→7. Có lượt là 3→1→2→4→5→6→7. Bài kiểm này canh đúng cái đó: thứ tự phải là HỆ QUẢ của
 * dữ liệu, nên mọi thứ tự hợp lệ đều ra cùng một kết quả, còn thứ tự KHÔNG hợp lệ (chạy khi chưa
 * đủ dữ liệu) thì bị chặn chứ không trôi qua.
 */
const assert = require('node:assert');
const {
  parseSkillContract,
  parseCheck,
  readySkills,
  blockedReport,
  duplicateProducers,
  evalCheck,
  runChecks,
  changedVerdicts,
  parseFactBlock,
  relatedSet,
  hasContract,
  rowsToWrite,
} = require('../.test-build/core/skillContract.js');

// ── đọc hợp đồng ────────────────────────────────────────────────────────────────────────
{
  const md = [
    '---',
    'name: dinh-gia',
    'description: Dinh gia ban',
    'needs:    [gia_von, danh_muc]',
    'produces: [gia_ban, bien_loi_nhuan]',
    'checks:',
    '  - gia_ban >= gia_von',
    '  - "mo ta phai khop danh_muc"',
    '---',
    '',
    '# Dinh gia',
  ].join('\n');
  const c = parseSkillContract('dinh-gia', 'Định giá', md);
  assert.deepStrictEqual(c.needs, ['gia_von', 'danh_muc']);
  assert.deepStrictEqual(c.produces, ['gia_ban', 'bien_loi_nhuan']);
  assert.strictEqual(c.checks.length, 2);
  assert.strictEqual(c.checks[0].kind, 'expr');
  assert.strictEqual(c.checks[1].kind, 'prose');
  // Ràng buộc bằng lời vẫn phải biết nó chờ khoá nào, nếu không nó chạy quá sớm.
  assert.ok(c.checks[1].refs.includes('danh_muc'));
}

// Skill CŨ (không khai gì) phải vẫn chạy được — tính năng mới không được phá cái đang có.
{
  const c = parseSkillContract('cu', 'Skill cũ', '---\nname: cu\n---\n\nnội dung');
  assert.deepStrictEqual(c.needs, []);
  assert.deepStrictEqual(c.produces, []);
  assert.deepStrictEqual(c.checks, []);
}

// Ràng buộc viết sai cú pháp KHÔNG được biến mất — nó thành `prose` để mô hình còn phán.
{
  const ck = parseCheck('x', 'gia phai hop ly chu', new Set(['gia']));
  assert.strictEqual(ck.kind, 'prose');
  assert.strictEqual(ck.raw, 'gia phai hop ly chu');
}

// ── thứ tự là hệ quả: 3→1→2 và 1→2→3 ra cùng kết quả ───────────────────────────────────
{
  const mk = (id, needs, produces) =>
    parseSkillContract(id, id, `---\nname: ${id}\nneeds: [${needs}]\nproduces: [${produces}]\n---\n`);
  // s1 không cần gì; s2 cần khoá của s1; s3 độc lập hoàn toàn.
  const all = [mk('s1', '', 'a'), mk('s2', 'a', 'b'), mk('s3', '', 'c')];

  // Lúc đầu: s1 và s3 chạy được, s2 thì chưa — DÙ người dùng đánh số nó là "bước 2".
  let facts = {};
  let done = new Set();
  let ready = readySkills(all, facts, done).map((c) => c.id);
  assert.deepStrictEqual(ready.sort(), ['s1', 's3']);

  // Chạy s3 TRƯỚC (thứ tự "3→1→2" của người dùng) — hợp lệ, không bị chặn.
  facts = { c: 1 };
  done = new Set(['s3']);
  assert.deepStrictEqual(readySkills(all, facts, done).map((c) => c.id), ['s1']);

  facts = { c: 1, a: 1 };
  done = new Set(['s3', 's1']);
  assert.deepStrictEqual(readySkills(all, facts, done).map((c) => c.id), ['s2']);
}

// Bế tắc phải NÓI RA thiếu gì, và phân biệt "chờ" với "không ai sinh ra nó".
{
  const mk = (id, needs, produces) =>
    parseSkillContract(id, id, `---\nname: ${id}\nneeds: [${needs}]\nproduces: [${produces}]\n---\n`);
  const all = [mk('s1', 'gia_von', 'gia_ban')];
  const rep = blockedReport(all, {}, new Set());
  assert.strictEqual(rep.length, 1);
  assert.deepStrictEqual(rep[0].missing, ['gia_von']);
  // Không skill nào còn lại sinh `gia_von` ⇒ bế tắc thật, phải hỏi người dùng.
  assert.deepStrictEqual(rep[0].nobodyProduces, ['gia_von']);
}

// Hai skill cùng sinh một khoá = kết quả phụ thuộc thứ tự — đúng thứ phải chặn.
{
  const mk = (id, produces) => parseSkillContract(id, id, `---\nname: ${id}\nproduces: [${produces}]\n---\n`);
  const dups = duplicateProducers([mk('a', 'gia_ban'), mk('b', 'gia_ban'), mk('c', 'khac')]);
  assert.strictEqual(dups.length, 1);
  assert.strictEqual(dups[0].key, 'gia_ban');
  assert.deepStrictEqual(dups[0].owners.sort(), ['a', 'b']);
}

// ── chạy ràng buộc ──────────────────────────────────────────────────────────────────────
{
  const ck = parseCheck('dinh-gia', 'gia_ban >= gia_von', new Set(['gia_ban', 'gia_von']));

  // Chưa đủ dữ liệu ⇒ `unknown`, KHÔNG phải `fail`. Lẫn hai cái này là báo sai cho người dùng.
  assert.strictEqual(evalCheck(ck, {}).verdict, 'unknown');
  assert.strictEqual(evalCheck(ck, { gia_ban: 10 }).verdict, 'unknown');

  assert.strictEqual(evalCheck(ck, { gia_ban: 120, gia_von: 100 }).verdict, 'pass');
  assert.strictEqual(evalCheck(ck, { gia_ban: 90, gia_von: 100 }).verdict, 'fail');

  // Số kiểu Việt Nam từ Bitable — không xử thì mọi so sánh tiền im lặng thành `unknown`.
  assert.strictEqual(evalCheck(ck, { gia_ban: '1.200.000', gia_von: '900.000' }).verdict, 'pass');
  assert.strictEqual(evalCheck(ck, { gia_ban: '900.000₫', gia_von: '1.200.000₫' }).verdict, 'fail');
  assert.strictEqual(evalCheck(ck, { gia_ban: '1,5', gia_von: '2' }).verdict, 'fail');
}

// Ràng buộc bằng lời KHÔNG BAO GIỜ tự nhận là đã kiểm — tự nhận `pass` tệ hơn không có ràng buộc.
{
  const ck = parseCheck('x', 'mo ta phai khop danh_muc', new Set(['danh_muc']));
  assert.strictEqual(evalCheck(ck, { danh_muc: 'A' }).verdict, 'unknown');
}

// So sánh không phải số: == / != vẫn có nghĩa, còn lại phải nói là không so sánh được.
{
  const eq = parseCheck('x', 'danh_muc == "Thuc pham"', new Set(['danh_muc']));
  assert.strictEqual(evalCheck(eq, { danh_muc: 'Thuc pham' }).verdict, 'pass');
  assert.strictEqual(evalCheck(eq, { danh_muc: 'Do uong' }).verdict, 'fail');
  const gt = parseCheck('x', 'danh_muc > "Thuc pham"', new Set(['danh_muc']));
  assert.strictEqual(evalCheck(gt, { danh_muc: 'Do uong' }).verdict, 'unknown');
}

// ── kiểm chéo LIÊN TỤC: mâu thuẫn lộ ngay tại bước gây ra, không phải ở cuối ────────────
{
  const dinhGia = parseSkillContract(
    'dinh-gia',
    'Định giá',
    '---\nname: dinh-gia\nneeds: [gia_von]\nproduces: [gia_ban]\nchecks:\n  - gia_ban >= gia_von\n---\n',
  );
  const khuyenMai = parseSkillContract(
    'khuyen-mai',
    'Khuyến mãi',
    '---\nname: khuyen-mai\nneeds: [gia_ban]\nproduces: [gia_sau_km]\nchecks:\n  - gia_sau_km >= gia_von\n---\n',
  );
  const all = [dinhGia, khuyenMai];

  let facts = { gia_von: 100 };
  let prev = runChecks(all, facts);
  // Chưa có gì để kết luận.
  assert.ok(prev.every((r) => r.verdict === 'unknown'));

  // Định giá xong — ràng buộc CỦA NÓ đạt.
  facts = { ...facts, gia_ban: 150 };
  let next = runChecks(all, facts);
  assert.strictEqual(next.find((r) => r.check.owner === 'dinh-gia').verdict, 'pass');
  let changed = changedVerdicts(prev, next);
  assert.strictEqual(changed.length, 1); // chỉ báo cái vừa đổi, không báo lại cả bảng
  prev = next;

  // Khuyến mãi hạ giá xuống dưới giá vốn — ràng buộc của KHUYẾN MÃI gãy, và nó tham chiếu tới
  // khoá do ĐỊNH GIÁ và dữ liệu đầu vào sinh ra. Đây chính là "kiểm chéo".
  facts = { ...facts, gia_sau_km: 80 };
  next = runChecks(all, facts);
  const broken = next.filter((r) => r.verdict === 'fail');
  assert.strictEqual(broken.length, 1);
  assert.strictEqual(broken[0].check.owner, 'khuyen-mai');
  // Câu báo phải nói được con số, để người dùng sửa được.
  assert.ok(broken[0].reason.includes('80'), broken[0].reason);
}

// ── đọc khối dữ liệu mô hình trả về ─────────────────────────────────────────────────────
{
  const out = [
    'Toi se tinh nhu sau. Vi du khoi ket qua:',
    '```facts',
    'gia_ban: 999',
    '```',
    'Va day la ket qua THAT:',
    '```facts',
    'gia_ban: 120000',
    'bien_loi_nhuan: 0.2',
    'ten: "Ao thun"',
    'con_hang: true',
    'ghi_chu:',
    '```',
  ].join('\n');
  const f = parseFactBlock(out);
  // Phải lấy khối CUỐI — lấy khối đầu là nhặt đúng cái ví dụ mô hình vừa nêu.
  assert.strictEqual(f.gia_ban, 120000);
  assert.strictEqual(f.bien_loi_nhuan, 0.2);
  assert.strictEqual(f.ten, 'Ao thun');
  assert.strictEqual(f.con_hang, true);
  assert.ok(!('ghi_chu' in f)); // giá trị rỗng không được thành khoá "đã có"
  assert.deepStrictEqual(parseFactBlock('khong co khoi nao'), {});
}

// ── bộ skill = dính nhau về DỮ LIỆU, không phải do gắn thẻ ──────────────────────────────
{
  const mk = (id, front) => parseSkillContract(id, id, `---\nname: ${id}\n${front}\n---\n`);
  const all = [
    mk('a', 'produces: [gia_von]'),
    mk('b', 'needs: [gia_von]\nproduces: [gia_ban]'),
    mk('c', 'needs: [gia_ban]\nproduces: [gia_km]'),
    mk('roi', 'produces: [chuyen_khac]'), // không dính gì tới ba cái trên
  ];
  // Bắt đầu từ GIỮA chuỗi vẫn phải kéo được cả hai đầu — lan truyền hai chiều.
  assert.deepStrictEqual(relatedSet(all, 'b').map((c) => c.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(relatedSet(all, 'roi').map((c) => c.id), ['roi']);

  // Ràng buộc cũng là dây nối: `d` không trao dữ liệu với `a`, nhưng check của nó nhắc `gia_von`.
  const withCheck = [mk('a', 'produces: [gia_von]'), mk('d', 'produces: [phi]\nchecks:\n  - phi <= gia_von')];
  assert.deepStrictEqual(relatedSet(withCheck, 'd').map((c) => c.id), ['a', 'd']);
}

// Skill cũ không khai gì ⇒ không có hợp đồng ⇒ chạy đường cũ.
{
  assert.strictEqual(hasContract(parseSkillContract('x', 'x', '---\nname: x\n---\n')), false);
  assert.strictEqual(hasContract(parseSkillContract('x', 'x', '---\nname: x\nproduces: [a]\n---\n')), true);
}

// ── đích ghi: "format chốt từ đầu" ──────────────────────────────────────────────────────
{
  const md = [
    '---',
    'name: doc-hoa-don',
    'produces: [so_hd, ngay, tong_tien, ghi_chu]',
    'target:',
    '  base: Ke toan',
    '  table: Hoa don',
    '  map:',
    '    so_hd: "So hoa don"',
    '    ngay: Ngay',
    '    tong_tien: "Tong tien"',
    'checks:',
    '  - tong_tien >= 0',
    '---',
  ].join('\n');
  const c = parseSkillContract('doc-hoa-don', 'Đọc hoá đơn', md);
  assert.strictEqual(c.target.table, 'Hoa don');
  assert.strictEqual(c.target.base, 'Ke toan');
  assert.deepStrictEqual(c.target.map, { so_hd: 'So hoa don', ngay: 'Ngay', tong_tien: 'Tong tien' });
  // `ghi_chu` có trong produces nhưng KHÔNG có trong map ⇒ trích ra nhưng không ghi vào bảng.
  assert.ok(!('ghi_chu' in c.target.map));
  assert.strictEqual(hasContract(c), true);
}

// Khai target thiếu `table` ⇒ không có đích, nhưng kỹ năng vẫn chạy được phần trích xuất.
{
  const c = parseSkillContract('x', 'x', '---\nname: x\nproduces: [a]\ntarget:\n  base: B\n---\n');
  assert.strictEqual(c.target, undefined);
  assert.deepStrictEqual(c.produces, ['a']);
}

// Không khai target ⇒ kỹ năng thường, không phải loại ghi bảng.
{
  const c = parseSkillContract('x', 'x', '---\nname: x\nproduces: [a]\n---\n');
  assert.strictEqual(c.target, undefined);
}

// ── LUẬT QUAN TRỌNG NHẤT: dòng có ràng buộc SAI thì KHÔNG được ghi ─────────────────────
{
  const target = { table: 'Hoa don', map: { so_hd: 'So hoa don', tong_tien: 'Tong tien' } };
  const rows = [
    { file: 'a.pdf', facts: { so_hd: 'HD001', tong_tien: 500000, ghi_chu: 'noi bo' }, failing: [] },
    { file: 'b.pdf', facts: { so_hd: 'HD002', tong_tien: -9 }, failing: ['tong_tien >= 0 — SAI (-9 >= 0)'] },
    { file: 'c.pdf', facts: { so_hd: 'HD003', tong_tien: 120000 }, failing: [] },
  ];
  const recs = rowsToWrite(rows, target);
  assert.strictEqual(recs.length, 2, 'dòng sai phải bị chặn, không ghi');
  assert.deepStrictEqual(recs.map((r) => r.fields['So hoa don']), ['HD001', 'HD003']);
  // Khoá không khai trong `map` thì không được ghi — nếu không sẽ đẻ ra cột rác.
  assert.ok(!('ghi_chu' in recs[0].fields));
  assert.ok(!('noi bo' in recs[0].fields));
}

// null / rỗng coi như không có: ghi đè lên ô đang có dữ liệu là XOÁ mất dữ liệu cũ.
{
  const target = { table: 'T', map: { a: 'Cot A', b: 'Cot B', c: 'Cot C' } };
  const recs = rowsToWrite([{ file: 'x', facts: { a: 1, b: null, c: '' }, failing: [] }], target);
  assert.deepStrictEqual(recs[0].fields, { 'Cot A': 1 });
}

// Trích không ra gì ⇒ không ghi một dòng trống làm bẩn bảng.
{
  const target = { table: 'T', map: { a: 'Cot A' } };
  assert.deepStrictEqual(rowsToWrite([{ file: 'x', facts: {}, failing: [] }], target), []);
  // ...nhưng khoá ngoài map vẫn không cứu được một dòng rỗng.
  assert.deepStrictEqual(rowsToWrite([{ file: 'x', facts: { z: 9 }, failing: [] }], target), []);
}

// Giá trị false / số 0 là DỮ LIỆU THẬT, không được coi là rỗng.
{
  const target = { table: 'T', map: { con_hang: 'Con hang', ton: 'Ton' } };
  const recs = rowsToWrite([{ file: 'x', facts: { con_hang: false, ton: 0 }, failing: [] }], target);
  assert.deepStrictEqual(recs[0].fields, { 'Con hang': false, Ton: 0 });
}

console.log('✓ skillContract: thứ tự tự suy ra, kiểm chéo liên tục, chưa đủ ≠ sai');
