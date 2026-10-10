/**
 * Ghi vào Lark qua phiên web + thẻ tệp: mã hoá đúng kiểu từng cột, so khớp khi đọc lại, đính tệp GHI THÊM,
 * đọc đủ trang (lệch là lỗi), bộ đọc phản hồi tải lên/nhập, xem trước tệp, và luật duyệt (cộng thêm / ghi đè / gửi).
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const Module = require('node:module');
const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => tmpdir(), isPackaged: false, getVersion: () => '0.0.0' }, safeStorage: { isEncryptionAvailable: () => false }, session: { fromPartition: () => ({}) }, BrowserWindow: function () {}, shell: {}, net: {} };
  return orig.apply(this, arguments);
};

const B = join(__dirname, '..', '.test-build', 'runtime', 'lark');
const E = require(join(B, 'bitableEncode.js'));
const R = require(join(B, 'webRecords.js'));
const F = require(join(B, 'webFiles.js'));
const P = require(join(B, 'filePreview.js'));
const FB = require(join(B, 'fileBuild.js'));
const X = require(join(B, 'larkToolExec.js'));
const FX = (n) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'lark-web', n), 'utf8'));

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e && (e.stack || e.message));
  }
};

const TZ = 'Asia/Saigon';
const F_ = {
  text: { id: 'fldText0001', name: 'Tên', type: 1, uiType: 'Text', isPrimary: true },
  mail: { id: 'fldMail0001', name: 'Email', type: 1, uiType: 'Email' },
  num: { id: 'fldNum00001', name: 'Số', type: 2, uiType: 'Number', formatter: '0.00' },
  money: { id: 'fldMoney001', name: 'Tiền', type: 2, uiType: 'Currency', formatter: '0.0' },
  pct: { id: 'fldPct00001', name: 'Phần trăm', type: 2, uiType: 'Number', formatter: '0.00%' },
  sel: { id: 'fldSel00001', name: 'Chọn một', type: 3, uiType: 'SingleSelect', options: [{ id: 'optNew0001', name: 'Mới' }, { id: 'optDone001', name: 'Xong' }] },
  mul: { id: 'fldMul00001', name: 'Chọn nhiều', type: 4, uiType: 'MultiSelect', options: [{ id: 'optA000001', name: 'A' }, { id: 'optB000001', name: 'B' }, { id: 'optC000001', name: 'C' }] },
  date: { id: 'fldDate0001', name: 'Ngày giờ', type: 5, uiType: 'DateTime' },
  chk: { id: 'fldChk00001', name: 'Hộp kiểm', type: 7, uiType: 'Checkbox' },
  url: { id: 'fldUrl00001', name: 'Link web', type: 15, uiType: 'Url' },
  phone: { id: 'fldPhone001', name: 'SĐT', type: 13, uiType: 'Phone' },
  user: { id: 'fldUser0001', name: 'Người', type: 11, uiType: 'User', multiple: true },
  user1: { id: 'fldUser0002', name: 'Phụ trách', type: 11, uiType: 'User', multiple: false },
  link: { id: 'fldLink0001', name: 'Liên kết', type: 18, uiType: 'SingleLink', linkTable: 'tblB', multiple: true },
  file: { id: 'fldFile0001', name: 'Tệp', type: 17, uiType: 'Attachment' },
  fx: { id: 'fldFx000001', name: 'Công thức', type: 20, uiType: 'Formula' },
};
const CTX = {
  timezone: TZ,
  me: { id: '7600000000000000009', name: 'Phương' },
  users: [
    { id: '7600000000000000009', name: 'Phương', email: 'phuong@x.vn' },
    { id: '7600000000000000002', name: 'Nguyễn Văn An', enName: 'An Nguyen', email: 'an@x.vn' },
    { id: '7600000000000000003', name: 'Trần Bình' },
    { id: '7600000000000000004', name: 'Trần Bình' },
  ],
  linkRecords: { tblB: [{ id: 'recB000001', primary: 'Mục B1' }, { id: 'recB000002', primary: 'Mục B2' }] },
};
const enc = (f, v, c = CTX) => E.encodeCell(f, v, c);

(async () => {
  // ── mã hoá từng kiểu cột ───────────────────────────────────────────────────────────────────────
  await t('văn bản / email (mailto) / URL / SĐT → đúng khuôn nội bộ đã đo', async () => {
    assert.deepStrictEqual(enc(F_.text, 'Dòng đủ kiểu').cell, { type: 1, value: [{ type: 'text', text: 'Dòng đủ kiểu' }] });
    assert.deepStrictEqual(enc(F_.text, '007').cell.value, [{ type: 'text', text: '007' }], 'mã có số 0 đầu là CHỮ');
    assert.deepStrictEqual(enc(F_.mail, 'test@example.com').cell.value, [{ type: 'url', text: 'test@example.com', link: 'mailto:test@example.com' }]);
    assert.strictEqual(enc(F_.mail, 'không-phải-email').ok, false);
    assert.deepStrictEqual(enc(F_.url, 'https://www.larksuite.com').cell.value, [{ type: 'url', text: 'https://www.larksuite.com', link: 'https://www.larksuite.com' }]);
    assert.deepStrictEqual(enc(F_.url, { text: 'Lark', link: 'https://www.larksuite.com' }).cell.value, [{ type: 'url', text: 'Lark', link: 'https://www.larksuite.com' }]);
    assert.strictEqual(enc(F_.url, 'ftp://x').ok, false);
    assert.deepStrictEqual(enc(F_.phone, '090 123 4567').cell.value, { fullPhoneNum: '0901234567' });
    assert.deepStrictEqual(enc(F_.phone, '+84 90-123-4567').cell.value, { fullPhoneNum: '+84901234567' });
  });
  await t('số / tiền tệ / phần trăm: "1.500.000", "1,234.5", "25%" → 0.25; chữ lạ → lỗi', async () => {
    assert.strictEqual(enc(F_.num, 1234.5).cell.value, 1234.5);
    assert.strictEqual(enc(F_.money, '1.500.000').cell.value, 1500000);
    assert.strictEqual(enc(F_.money, '1,234.5').cell.value, 1234.5);
    assert.strictEqual(enc(F_.money, '1.234,5').cell.value, 1234.5);
    assert.strictEqual(enc(F_.money, '1 500 000 đ').cell.value, 1500000);
    assert.strictEqual(enc(F_.pct, '25%').cell.value, 0.25);
    assert.strictEqual(enc(F_.pct, 0.25).cell.value, 0.25);
    assert.strictEqual(enc(F_.num, 'abc').ok, false);
  });
  await t('chọn một / nhiều: đúng tên, không phân biệt hoa-dấu nếu duy nhất; thiếu → lỗi + missingOptions (không tự tạo)', async () => {
    assert.strictEqual(enc(F_.sel, 'Mới').cell.value, 'optNew0001');
    assert.strictEqual(enc(F_.sel, 'moi').cell.value, 'optNew0001');
    const miss = enc(F_.sel, 'Đang làm');
    assert.strictEqual(miss.ok, false);
    assert.deepStrictEqual(miss.missingOptions, ['Đang làm']);
    assert.deepStrictEqual(enc(F_.mul, ['A', 'C']).cell.value, ['optA000001', 'optC000001']);
    assert.deepStrictEqual(enc(F_.mul, 'A, B').cell.value, ['optA000001', 'optB000001']);
    assert.deepStrictEqual(enc(F_.mul, ['A', 'Z', 'Y']).missingOptions, ['Z', 'Y']);
  });
  await t('ngày giờ: theo múi giờ của Base (Asia/Saigon) cho chuỗi không múi; ISO có múi; DD/MM/YYYY; giây/mili giây', async () => {
    assert.strictEqual(enc(F_.date, '2026-10-10 14:30').cell.value, 1791617400000); // đúng số trang Lark ghi
    assert.strictEqual(enc(F_.date, '2026-10-10').cell.value, 1791565200000);
    assert.strictEqual(enc(F_.date, '10/10/2026').cell.value, 1791565200000);
    assert.strictEqual(enc(F_.date, '2026-10-10T07:30:00Z').cell.value, 1791617400000);
    assert.strictEqual(enc(F_.date, 1791617400).cell.value, 1791617400000);
    assert.strictEqual(enc(F_.date, 1791617400000).cell.value, 1791617400000);
    assert.strictEqual(enc(F_.date, 'thứ hai tuần sau').ok, false);
    assert.strictEqual(E.formatDateInTz(1791617400000, TZ, true), '2026-10-10 14:30');
  });
  await t('hộp kiểm: true/false/"có"/"x"/"không"', async () => {
    assert.strictEqual(enc(F_.chk, true).cell.value, true);
    assert.strictEqual(enc(F_.chk, 'có').cell.value, true);
    assert.strictEqual(enc(F_.chk, 'x').cell.value, true);
    assert.strictEqual(enc(F_.chk, 'không').cell.value, false);
    assert.strictEqual(enc(F_.chk, 'có lẽ').ok, false);
  });
  await t('người: "me", tên (có/không dấu), email, id; trùng tên → lỗi; cột một người chặn nhiều người', async () => {
    assert.deepStrictEqual(enc(F_.user, 'me').cell.value, { users: [{ notify: false, userId: '7600000000000000009', name: 'Phương', enName: 'Phương' }] });
    assert.strictEqual(enc(F_.user, 'nguyen van an').cell.value.users[0].userId, '7600000000000000002');
    assert.strictEqual(enc(F_.user, 'an@x.vn').cell.value.users[0].userId, '7600000000000000002');
    assert.strictEqual(enc(F_.user, '7600000000000000099').cell.value.users[0].userId, '7600000000000000099');
    assert.match(enc(F_.user, 'Trần Bình').error, /trùng 2 người/);
    assert.match(enc(F_.user, 'Người Lạ').error, /không tìm thấy/);
    assert.strictEqual(enc(F_.user1, ['me', 'An Nguyen']).ok, false);
  });
  await t('liên kết: record_id hoặc chữ ở cột chính của bảng liên kết; không thấy → lỗi', async () => {
    assert.deepStrictEqual(enc(F_.link, 'recB000002').cell.value, ['recB000002']);
    assert.deepStrictEqual(enc(F_.link, ['Mục B1', 'recB000002']).cell.value, ['recB000001', 'recB000002']);
    assert.strictEqual(enc(F_.link, 'Không có').ok, false);
  });
  await t('tệp đính kèm / công thức / ô trống: đính kèm chỉ qua lark_web_attach_file, cột tự tính từ chối, rỗng = xoá ô', async () => {
    assert.match(enc(F_.file, 'x').error, /lark_web_attach_file/);
    assert.match(enc(F_.fx, 1).error, /tự tính/);
    assert.deepStrictEqual(enc(F_.text, '').cell, { type: 1, value: null });
  });
  await t('tìm cột/bảng theo id hoặc TÊN (đúng trước, lỏng nếu duy nhất)', async () => {
    const fields = Object.values(F_);
    assert.strictEqual(E.resolveField(fields, 'fldSel00001').name, 'Chọn một');
    assert.strictEqual(E.resolveField(fields, 'chon mot').id, 'fldSel00001');
    assert.strictEqual(E.resolveField(fields, 'Không có'), null);
  });

  // ── đọc lại: so theo nghĩa ─────────────────────────────────────────────────────────────────────
  await t('so khớp ô ghi ↔ ô máy chủ trả (khoá đảo thứ tự, avatarUrl null, modifiedTime) cho MỌI kiểu', async () => {
    const page = FX('records-page.json');
    const row = page.recordMap.recA000001;
    const v = (fid) => row[fid].value;
    const cases = [
      [F_.text, 'Dòng đủ kiểu'], [F_.num, 1234.5], [F_.money, 1500000], [F_.pct, 0.25], [F_.sel, 'Mới'], [F_.mul, ['A', 'C']],
      [F_.date, '2026-10-10 14:30'], [F_.chk, true], [F_.url, { text: 'Lark', link: 'https://www.larksuite.com' }], [F_.phone, '0901234567'],
      [F_.mail, 'test@example.com'], [F_.user, 'me'], [F_.link, 'Mục B1'],
    ];
    for (const [f, input] of cases) {
      const e = enc(f, input);
      assert.ok(e.ok, `${f.name}: ${e.error}`);
      assert.ok(E.cellMatches(f, e.cell.value, v(f.id)), `${f.name} phải khớp`);
    }
    assert.ok(!E.cellMatches(F_.num, 1234.5, 1234), 'số khác thì lệch');
    assert.ok(!E.cellMatches(F_.mul, ['optA000001'], ['optA000001', 'optC000001']));
    assert.ok(E.cellMatches(F_.file, [{ attachmentToken: 'TokFile0000001' }], v('fldFile0001')));
  });
  await t('giá trị đơn giản để đọc/xuất tệp: tên lựa chọn, ngày theo múi Base, tên người, số giữ là số, mã 007 giữ nguyên', async () => {
    const row = FX('records-page.json').recordMap.recA000001;
    const s = (f) => E.simpleValue(f, row[f.id].value, { timezone: TZ });
    assert.strictEqual(s(F_.sel), 'Mới');
    assert.strictEqual(s(F_.mul), 'A, C');
    assert.strictEqual(s(F_.date), '2026-10-10 14:30');
    assert.strictEqual(s(F_.user), 'Phương');
    assert.strictEqual(s(F_.num), 1234.5);
    assert.strictEqual(s(F_.chk), true);
    assert.strictEqual(s(F_.phone), '0901234567');
    assert.strictEqual(s(F_.file), 'a.csv');
    assert.strictEqual(E.simpleValue(F_.text, FX('records-page.json').recordMap.recA000002.fldText0001.value), '007');
  });
  await t('so từng ô đã ghi với bản đọc lại: thiếu bản ghi / lệch ô được liệt kê', async () => {
    const page = FX('records-page.json');
    const wrote = [
      { recordId: 'recA000001', cells: { fldNum00001: enc(F_.num, 1234.5).cell, fldSel00001: enc(F_.sel, 'Xong').cell } },
      { recordId: 'recMISSING', cells: { fldNum00001: enc(F_.num, 1).cell } },
    ];
    const c = R.compareWritten(Object.values(F_), wrote, page.recordMap, E.cellMatches);
    assert.strictEqual(c.checked, 2);
    assert.deepStrictEqual(c.mismatches.map((m) => m.field), ['Chọn một']);
    assert.deepStrictEqual(c.missing, ['recMISSING']);
  });

  // ── đính kèm: ghi thêm ─────────────────────────────────────────────────────────────────────────
  await t('đính tệp: GHI THÊM sau tệp cũ, bỏ trùng token; replace = thay hết (chỉ khi người dùng yêu cầu)', async () => {
    const cur = [{ attachmentToken: 'T1', name: 'cu.pdf' }, { attachmentToken: 'T2', name: 'cu2.pdf' }];
    const it = R.attachmentItem({ token: 'T3', name: 'moi.xlsx', size: 10, mime: 'x' }, 5);
    assert.deepStrictEqual(it, { id: 'T3', attachmentToken: 'T3', name: 'moi.xlsx', text: 'moi.xlsx', size: 10, mimeType: 'x', timeStamp: 5 });
    assert.deepStrictEqual(R.mergeAttachments(cur, [it]).map((x) => x.attachmentToken), ['T1', 'T2', 'T3']);
    assert.deepStrictEqual(R.mergeAttachments(cur, [{ attachmentToken: 'T2' }]).map((x) => x.attachmentToken), ['T1', 'T2']);
    assert.deepStrictEqual(R.mergeAttachments(cur, [it], true).map((x) => x.attachmentToken), ['T3']);
    assert.deepStrictEqual(R.mergeAttachments(null, [it]).map((x) => x.attachmentToken), ['T3']);
    const js = R.attachScript({ token: 'b', tableId: 't', recordId: 'r', fieldId: 'f', items: [it], current: cur });
    assert.ok(js.includes('OP.current') && js.includes('before.concat'), 'đoạn trong trang dùng giá trị MÁY CHỦ đọc trước');
  });

  // ── đọc đủ trang ───────────────────────────────────────────────────────────────────────────────
  const fakePages = (total, perPage, opts = {}) => async (offset, limit) => {
    const n = opts.serverCap ? Math.min(limit, opts.serverCap) : limit;
    const ids = [];
    for (let k = offset; k < Math.min(total - (opts.short || 0), offset + n); k++) ids.push(`rec${String(k).padStart(6, '0')}`);
    return { recordMap: Object.fromEntries(ids.map((id) => [id, { fldX: { value: [{ type: 'text', text: id }] } }])), order: ids, total };
  };
  await t('đọc HẾT các trang (2 345 bản ghi, trang 1 000) — không dừng ở 100/500', async () => {
    const all = await R.readAllRecords(fakePages(2345), {});
    assert.strictEqual(all.ids.length, 2345);
    assert.strictEqual(all.pages, 3);
    assert.strictEqual(new Set(all.ids).size, 2345);
  });
  await t('máy chủ trả ít hơn tổng báo → NÉM lỗi "đọc thiếu N/M" (không im lặng)', async () => {
    await assert.rejects(R.readAllRecords(fakePages(1200, 1000, { short: 7 })), /Đọc thiếu dữ liệu: mới lấy được 1193\/1200/);
  });
  await t('máy chủ cắt mỗi trang 500 dù xin 1 000 → vẫn đọc đủ (dựa vào offset, không vào kích thước trang)', async () => {
    const all = await R.readAllRecords(async (off, lim) => (await fakePages(1600, 1000, { serverCap: 500 })(off, lim)), { pageSize: 500 });
    assert.strictEqual(all.ids.length, 1600);
  });
  await t('tệp xuất: "N dòng nguồn → N dòng trong tệp", có record_id, chọn cột', async () => {
    const all = await R.readAllRecords(fakePages(12), {});
    const r = R.rowsForFile([{ id: 'fldX', name: 'X', type: 1 }], all, (f, v) => E.simpleValue(f, v), { withRecordId: true });
    assert.strictEqual(r.sourceRows, 12);
    assert.strictEqual(r.fileRows, 12);
    assert.deepStrictEqual(r.rows[0], ['record_id', 'X']);
    assert.deepStrictEqual(r.rows[1], ['rec000000', 'rec000000']);
  });
  await t('trang bản ghi: parse thứ tự theo groupList + tổng (bảng / view)', async () => {
    const p = R.parseRecordsPage(FX('records-page.json'));
    assert.deepStrictEqual(p.order, ['recA000001', 'recA000002', 'recA000003']);
    assert.strictEqual(p.total, 3);
    assert.match(R.recordsPagePath('bTok', 'tblX', 2000, 1000), /records\?tableID=tblX&viewID=&offset=2000&limit=1000/);
    const body = R.recordsByIdBody('bTok', 'tblX', ['rec1', 'rec2']);
    assert.deepStrictEqual(JSON.parse(body.payload), { rec1: {}, rec2: {} });
  });
  await t('đoạn ghi trong trang: addRecords theo lô 100 rồi setRecords; sửa = setRecords; lệnh thêm lựa chọn', async () => {
    const js = R.writeRecordsScript({ token: 'b', tableId: 't', creates: [{ f: { type: 1, value: null } }], updates: [] });
    assert.ok(js.includes('to.addRecords({ tableId: OP.tableId, count: part.length }') && js.includes('to.setRecords({ tableId: OP.tableId, data: data }'));
    assert.ok(R.addOptionsScript({ token: 'b', tableId: 't', adds: [{ fieldId: 'f', names: ['X'] }] }).includes('addSelectFieldOption'));
  });

  // ── tải lên / nhập: bộ đọc phản hồi ────────────────────────────────────────────────────────────
  const U = FX('upload-import.json');
  await t('adler32 đúng hàm checksum của bộ tải lên Lark; query tải lên đủ tham số', async () => {
    assert.strictEqual(F.adler32(Buffer.from('Wikipedia')), 300286872);
    assert.strictEqual(F.adler32(Buffer.alloc(0)), 1);
    assert.strictEqual(F.adler32(Buffer.alloc(100000, 255)) >>> 0, F.adler32(Buffer.alloc(100000, 255)));
    const q = F.uploadQuery({ name: 'Báo cáo.xlsx', size: 10, checksum: 99, mountPoint: 'bitable_file', mountNode: 'bTok', extra: '{"a":1}' });
    assert.ok(q.startsWith('/space/api/box/stream/upload/all/?'));
    const u = new URLSearchParams(q.split('?')[1]);
    assert.strictEqual(u.get('mount_point'), 'bitable_file');
    assert.strictEqual(u.get('mount_node_token'), 'bTok');
    assert.strictEqual(u.get('checksum'), '99');
    assert.strictEqual(u.get('name'), 'Báo cáo.xlsx');
    assert.strictEqual(u.get('ext[extra]'), '{"a":1}');
  });
  await t('phản hồi tải lên: file_token (+ node_token ở Drive); mã lỗi / không phải JSON → lỗi rõ', async () => {
    assert.deepStrictEqual(F.parseUploadResponse(U.upload_bitable), { ok: true, fileToken: 'FileTok000000000000000001' });
    assert.deepStrictEqual(F.parseUploadResponse(U.upload_explorer), { ok: true, fileToken: 'FileTok000000000000000002', nodeToken: 'nodTest000000000000000001' });
    assert.match(F.parseUploadResponse({ status: 200, json: { code: 1061004, message: 'forbidden' } }).error, /mã 1061004/);
    assert.match(F.parseUploadResponse({ status: 502, json: null, snippet: '<html>' }).error, /không phải JSON/);
  });
  await t('nhập: xlsx/csv → sheet, docx/md → docx; thân import/create CÓ event_source (thiếu là Parameter Error)', async () => {
    assert.deepStrictEqual(F.importTargetFor('a.xlsx'), { type: 'sheet', ext: 'xlsx' });
    assert.deepStrictEqual(F.importTargetFor('a.CSV'), { type: 'sheet', ext: 'csv' });
    assert.deepStrictEqual(F.importTargetFor('a.docx'), { type: 'docx', ext: 'docx' });
    assert.strictEqual(F.importTargetFor('a.pdf'), null);
    const b = F.importCreateBody({ fileToken: 'ft', type: 'sheet', ext: 'xlsx', folderToken: 'fold', clientToken: 'ct' });
    assert.strictEqual(b.event_source, 1);
    assert.deepStrictEqual(b.point, { mount_type: 1, mount_key: 'fold' });
    assert.strictEqual(typeof b.passback, 'string');
    assert.strictEqual(F.importUploadExtra({ type: 'sheet', ext: 'xlsx' }), '{"obj_type":"sheet","file_extension":"xlsx"}');
  });
  await t('kết quả nhập: xong / đang chạy / lỗi 129 (docx tối giản) có gợi ý', async () => {
    assert.deepStrictEqual(F.parseImportResult(U.import_result_sheet), { state: 'done', token: 'ShtTok000000000000000001', url: 'https://tenant.sg.larksuite.com/sheets/ShtTok000000000000000001', type: 'sheet' });
    assert.strictEqual(F.parseImportResult({ code: 0, data: { result: { job_status: 1 } } }).state, 'running');
    const bad = F.parseImportResult(U.import_result_minimal_docx);
    assert.strictEqual(bad.state, 'failed');
    assert.match(bad.error, /129.*save_as_import.*styles\/settings/);
    assert.strictEqual(F.parseImportResult(U.import_result_docx).type, 'docx');
  });
  await t('thư mục: tạo (node_list[0] + url), liệt kê con (bỏ chính thư mục), token từ link', async () => {
    assert.deepStrictEqual(F.parseCreateFolder(U.create_folder), { ok: true, token: 'FoldTok00000000000000001', url: 'https://tenant.sg.larksuite.com/drive/folder/FoldTok00000000000000001' });
    const kids = F.parseChildren(U.children, 'FoldTok00000000000000001');
    assert.deepStrictEqual(kids.map((k) => [k.type, k.objToken]), [[3, 'ShtTok000000000000000001'], [22, 'DocTok000000000000000001']]);
    assert.strictEqual(F.folderTokenFrom('https://x.larksuite.com/drive/folder/L01jfF9kKlzSdJdMqDClCnKyg3d?from=a'), 'L01jfF9kKlzSdJdMqDClCnKyg3d');
    assert.strictEqual(F.sheetTokenFrom('https://x.larksuite.com/sheets/Rx5TsXAcwh88kYtbQI4lwboOgNf?sheet=1'), 'Rx5TsXAcwh88kYtbQI4lwboOgNf');
    assert.strictEqual(F.folderTokenFrom('../etc'), '');
  });
  await t('Sheets: A1 ↔ (dòng, cột), so vùng ghi với bản đọc lại (công thức bỏ qua, số so theo số, "00123" là chữ)', async () => {
    assert.deepStrictEqual(F.parseA1('B3'), { row: 2, col: 1 });
    assert.deepStrictEqual(F.parseA1('aa10'), { row: 9, col: 26 });
    assert.strictEqual(F.parseA1('3B'), null);
    assert.strictEqual(F.colLetter(0), 'A');
    assert.strictEqual(F.colLetter(27), 'AB');
    const ok = F.compareSheetBack([['Ghi', '00123', 42, '=C1*2']], [['Ghi', '00123', 42, 84]]);
    assert.ok(ok.ok);
    const bad = F.compareSheetBack([['00123']], [[123]]);
    assert.strictEqual(bad.ok, false, '00123 thành 123 là MẤT số 0 đầu');
    const js = F.sheetWriteScript({ row: 0, col: 0, values: [['00123']] });
    assert.ok(js.includes('setCellValue(rr, cc, String(v), false, undefined, true)'), 'chữ ghi nguyên văn (autoFormat=false, dontParseNumber)');
  });

  // ── xem trước tệp ──────────────────────────────────────────────────────────────────────────────
  await t('xem trước xlsx NHIỀU sheet (kể cả sheet trống): tên, dòng × cột, 10 dòng đầu, mã 007 giữ nguyên', async () => {
    const rows = [['Mã', 'Tên', 'SL']];
    for (let k = 1; k <= 25; k++) rows.push([String(k).padStart(3, '0'), `Hàng ${k}`, k]);
    const buf = FB.buildXlsx([{ name: 'Tổng hợp', rows }, { name: 'Trống', rows: [] }, { name: 'Ghi chú', rows: [['Nội dung'], ['a & b <c>']] }]);
    const pv = P.buildFilePreview('Báo cáo.xlsx', buf);
    assert.strictEqual(pv.kind, 'xlsx');
    assert.deepStrictEqual(pv.sheets.map((s) => s.name), ['Tổng hợp', 'Trống', 'Ghi chú']);
    assert.strictEqual(pv.sheets[0].rows, 26);
    assert.strictEqual(pv.sheets[0].cols, 3);
    assert.strictEqual(pv.sheets[0].head.length, 10);
    assert.deepStrictEqual(pv.sheets[0].head[1], ['001', 'Hàng 1', '1']);
    assert.strictEqual(pv.sheets[1].rows, 0);
    assert.deepStrictEqual(pv.sheets[2].head[1], ['a & b <c>']);
    assert.match(pv.summary, /3 sheet · «Tổng hợp» 25 dòng × 3 cột/);
  });
  await t('xem trước docx (bản dựng đủ phần): số đoạn + các đoạn đầu; docx có đủ styles/settings/docProps để Lark nhập được', async () => {
    const buf = FB.buildDocx('# Báo cáo tuần\nĐoạn một.\n\n- Ý thứ nhất\nĐoạn cuối.');
    const pv = P.buildFilePreview('r.docx', buf);
    assert.strictEqual(pv.kind, 'docx');
    assert.strictEqual(pv.paragraphs, 4);
    assert.strictEqual(pv.head[0], 'Báo cáo tuần');
    const parts = FB.unzip(buf).map((x) => x.path);
    for (const want of ['word/styles.xml', 'word/settings.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml', 'docProps/app.xml']) assert.ok(parts.includes(want), want);
    assert.match(FB.unzip(buf).find((x) => x.path === 'word/document.xml').data.toString('utf8'), /<w:sectPr>/);
  });
  await t('xem trước csv: bỏ BOM, giữ số 0 đầu, ngoặc kép có dấu phẩy/xuống dòng, dấu ;', async () => {
    const csv = '﻿Mã KH,Tên,"Ghi chú"\r\n007,"Công ty A, chi nhánh 1","dòng 1\ndòng 2"\r\n0123,B,""\r\n';
    const pv = P.buildFilePreview('kh.csv', Buffer.from(csv, 'utf8'));
    assert.strictEqual(pv.kind, 'csv');
    assert.deepStrictEqual(pv.sheets[0].head[0], ['Mã KH', 'Tên', 'Ghi chú']);
    assert.deepStrictEqual(pv.sheets[0].head[1], ['007', 'Công ty A, chi nhánh 1', 'dòng 1\ndòng 2']);
    assert.strictEqual(pv.sheets[0].head[2][0], '0123');
    assert.match(pv.summary, /^2 dòng dữ liệu × 3 cột/);
    assert.deepStrictEqual(P.parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
    // Tệp do chính Larkwave dựng (BOM) đọc ngược ra đúng.
    const back = P.parseCsv(FB.buildCsv([['Mã'], ['007']]).toString('utf8'));
    assert.deepStrictEqual(back, [['Mã'], ['007']]);
  });
  await t('xem trước đếm cả BẢN GHI RỖNG (dòng ",,," trong csv, dòng trống trong xlsx) — khớp "N dòng nguồn → N dòng trong tệp"', async () => {
    const csv = FB.buildCsv([['A', 'B'], ['1', 'x'], [null, null], [null, null], ['4', 'y']]);
    assert.strictEqual(P.buildFilePreview('a.csv', csv).sheets[0].rows, 5);
    const x = FB.buildXlsx({ name: 'S', rows: [['A', 'B'], ['1', 'x'], [null, null], [null, null], ['4', 'y']] });
    const pv = P.buildFilePreview('a.xlsx', x);
    assert.strictEqual(pv.sheets[0].rows, 5);
    assert.match(pv.summary, /4 dòng × 2 cột/);
  });
  await t('xem trước pdf: số trang (đếm /Type /Page, không tính /Pages, đối chiếu /Count)', async () => {
    const pdf = '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj\n3 0 obj << /Type /Page >> endobj\n4 0 obj << /Type/Page >> endobj\n5 0 obj << /Type /Page /Parent 2 0 R >> endobj\n%%EOF';
    const pv = P.buildFilePreview('a.pdf', Buffer.from(pdf, 'latin1'));
    assert.deepStrictEqual([pv.kind, pv.pages], ['pdf', 3]);
    assert.strictEqual(P.buildFilePreview('a.bin', Buffer.from('x')), null);
  });
  await t('thẻ tệp: create_file / fill_xlsx / lark_export_table_file đều phát sự kiện tệp KÈM xem trước đọc từ đĩa', async () => {
    const d = mkdtempSync(join(tmpdir(), 'lw-fc-'));
    const p = join(d, 'Xuất.xlsx');
    writeFileSync(p, FB.buildXlsx({ name: 'S', rows: [['A'], ['1']] }));
    for (const name of ['create_file', 'fill_xlsx', 'lark_export_table_file']) {
      const ev = X.fileEventFor(name, { ok: true, file_name: 'Xuất.xlsx', path: p, mime: 'x', bytes: 10 });
      assert.ok(ev && ev.type === 'file' && ev.preview && ev.preview.kind === 'xlsx', name);
    }
    assert.strictEqual(X.fileEventFor('lark_web_drive_upload', { file_name: 'a', path: p }), null, 'tool đưa lên Lark không sinh thẻ tệp mới');
  });

  // ── duyệt: cộng thêm / ghi đè / gửi ───────────────────────────────────────────────────────────
  await t('luật duyệt: thêm bản ghi/đính tệp/tải Drive/nhập = cộng thêm (tự chạy khi Tự động bật); sửa/ghi sheet/gửi luôn hỏi', async () => {
    const tools = require(join(__dirname, '..', '.test-build', 'runtime', 'lark', 'tools', 'index.js'));
    const auto = { autoApproveTool: () => true };
    const by = (n) => tools.allTools().find((x) => x.name === n);
    for (const n of ['lark_web_write_records', 'lark_web_attach_file', 'lark_web_drive_upload', 'lark_web_import_as_sheet', 'lark_web_import_as_doc']) {
      assert.ok(by(n), n);
      assert.strictEqual(X.needsConfirmation(by(n), auto, false, {}), false, `${n} cộng thêm`);
    }
    for (const n of ['lark_web_update_records', 'lark_web_sheet_write_range', 'send_file']) {
      assert.strictEqual(X.needsConfirmation(by(n), auto, false, {}), true, `${n} phải hỏi`);
    }
    assert.strictEqual(X.needsConfirmation(by('lark_web_attach_file'), auto, false, { replace: true }), true, 'đính tệp replace:true = ghi đè → hỏi');
    assert.strictEqual(tools.isAdditiveCall('lark_web_attach_file', { replace: true }), false);
    assert.strictEqual(tools.isAdditiveCall('lark_web_attach_file', {}), true);
    for (const n of ['lark_web_read_records', 'lark_export_table_file']) assert.strictEqual(by(n).gated, false, n);
    // Không cần custom app: có trong bộ công cụ khi chưa kết nối App ID.
    const names = tools.agentTools({ withOpenApi: false }).map((x) => x.name);
    for (const n of ['lark_web_write_records', 'lark_web_update_records', 'lark_web_attach_file', 'lark_web_drive_upload', 'lark_web_import_as_sheet', 'lark_web_import_as_doc', 'lark_web_sheet_write_range', 'lark_web_read_records', 'lark_export_table_file', 'create_file', 'fill_xlsx']) assert.ok(names.includes(n), n);
    assert.ok(!names.includes('send_file'), 'gửi vào chat vẫn chỉ qua custom app');
    // Chế độ hỏi đáp: bỏ mọi tool ghi.
    assert.ok(!tools.agentTools({ withOpenApi: false, mode: 'ask' }).some((x) => x.gated));
  });
  await t('memo kết quả công cụ ghi giữ link + số liệu cho lượt sau', async () => {
    const m = X.memoForTool('lark_web_write_records', { ok: true, written: 2, created_record_ids: ['recN1', 'recN2'], cells_checked: 28, verified: true, url: 'https://t.larksuite.com/base/b?table=tbl1' });
    assert.match(m, /written=2/);
    assert.match(m, /created_record_ids=\[recN1,recN2\]/);
    assert.match(m, /https:\/\/t\.larksuite\.com\/base/);
    assert.strictEqual(X.summarizeTool('lark_web_write_records', { written: 2, verified: true }), 'đã ghi 2 dòng · đã đọc lại khớp');
  });

  console.log(fail ? `\n${fail} ca SAI` : `\nTẤT CẢ ĐÚNG (${pass})`);
  process.exit(fail ? 1 : 0);
})();
