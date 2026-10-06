/**
 * Tệp agent dựng ra phải MỞ ĐƯỢC thật.
 *
 * Phép kiểm mạnh nhất có được mà không cần cài Excel: dựng `.xlsx`/`.docx` bằng bộ GHI mới, rồi
 * đọc ngược bằng chính bộ ĐỌC `ooxml.ts` vốn đã chạy trên tệp Office thật của người dùng bấy lâu.
 * Hai nửa viết độc lập nhau, nên khớp được là bằng chứng thật chứ không phải tự chấm mình.
 */
const assert = require('node:assert');
const {
  buildXlsx,
  buildDocx,
  buildCsv,
  buildHtml,
  colName,
  safeSheetName,
  safeFileName,
  xmlEscape,
} = require('../.test-build/runtime/lark/fileBuild.js');
const { extractOfficeText } = require('../.test-build/runtime/lark/ooxml.js');

const CTRL = String.fromCharCode(11); // ký tự điều khiển XML 1.0 KHÔNG cho phép

// ── .xlsx đọc ngược được, giữ nguyên chữ có dấu ───────────────────────────────────────
const rows = [
  ['Khách hàng', 'Mã', 'Số tiền'],
  ['Nguyễn Thị Bưởi', '0074', 1250000],
  ['Trần Đức Đạt', '0123456789', 980500.25],
  ['Lê "Bé" Hương', null, 0],
];
const xlsx = buildXlsx({ name: 'Thu tiền T9', rows });
assert.ok(xlsx.length > 0, 'xlsx rỗng');
assert.strictEqual(xlsx.readUInt32LE(0), 0x04034b50, 'không phải ZIP hợp lệ');

const doc = extractOfficeText(xlsx, 'xlsx');
for (const t of ['Nguyễn Thị Bưởi', 'Trần Đức Đạt', 'Lê "Bé" Hương', '1250000']) {
  assert.ok(doc.includes(t), `bộ đọc không thấy "${t}" trong xlsx vừa dựng`);
}
// Mã có số 0 đầu phải GIỮ NGUYÊN dạng chữ — ép thành số là mất mã khách, mất số điện thoại.
assert.ok(doc.includes('0074'), 'mã "0074" bị mất số 0 đầu');
assert.ok(doc.includes('0123456789'), 'số điện thoại bị ép thành số');
console.log('✓ .xlsx mở lại được, giữ chữ có dấu và số 0 đầu của mã');

// Ký tự điều khiển phải bị loại, nếu không Excel từ chối mở CẢ tệp.
const ban = buildXlsx({ rows: [[`bình${CTRL}thường`]] });
assert.ok(extractOfficeText(ban, 'xlsx').includes('bình'), 'ô có ký tự điều khiển làm hỏng tệp');
assert.ok(!xmlEscape(`a${CTRL}b`).includes(CTRL), 'xmlEscape phải bỏ ký tự điều khiển');
console.log('✓ ký tự điều khiển bị loại thay vì làm hỏng cả tệp');

// ── .docx ────────────────────────────────────────────────────────────────────────────
const docx = buildDocx('# Báo cáo tháng 9\n\nTổng thu 12.500.000đ.\n- Đã đối chiếu 128 dòng\n- Còn 3 đơn lệch');
const dtext = extractOfficeText(docx, 'docx');
for (const t of ['Báo cáo tháng 9', 'Tổng thu', 'Đã đối chiếu 128 dòng']) {
  assert.ok(dtext.includes(t), `bộ đọc không thấy "${t}" trong docx vừa dựng`);
}
console.log('✓ .docx mở lại được, giữ tiêu đề và gạch đầu dòng');

// ── .csv ─────────────────────────────────────────────────────────────────────────────
const csv = buildCsv([
  ['Tên', 'Ghi chú'],
  ['Bưởi', 'có "nháy" và, dấu phẩy'],
  ['Đạt', 'xuống\ndòng'],
]);
assert.deepStrictEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'CSV thiếu BOM → Excel Windows hỏng chữ Việt');
const ctext = csv.subarray(3).toString('utf8');
assert.ok(ctext.includes('"có ""nháy"" và, dấu phẩy"'), 'CSV không thoát đúng nháy kép + dấu phẩy');
assert.ok(ctext.includes('"xuống\ndòng"'), 'CSV không bọc ô có xuống dòng');
console.log('✓ .csv có BOM, thoát đúng nháy kép / dấu phẩy / xuống dòng');

// ── HTML (nguồn để in PDF) ───────────────────────────────────────────────────────────
const html = buildHtml('Báo cáo <thu tiền>', 'Dòng một\nDòng hai', {
  rows: [
    ['A', 'B'],
    ['1', '2'],
  ],
});
assert.ok(html.includes('<th>A</th>'), 'hàng đầu phải là tiêu đề bảng');
assert.ok(html.includes('&lt;thu tiền&gt;'), 'tiêu đề chưa thoát HTML');
assert.ok(!/fonts\.googleapis|https?:\/\//.test(html), 'không được tải phông từ mạng — mất mạng là PDF trắng');
console.log('✓ HTML thoát ký tự, dựng bảng, và không phụ thuộc mạng');

// ── tên cột / tên sheet / tên tệp ────────────────────────────────────────────────────
assert.strictEqual(colName(0), 'A');
assert.strictEqual(colName(25), 'Z');
assert.strictEqual(colName(26), 'AA');
assert.strictEqual(colName(701), 'ZZ');
assert.strictEqual(safeSheetName('a/b:c*d[e]'), 'a b c d e');
assert.strictEqual(safeSheetName(''), 'Sheet1');
assert.strictEqual(safeSheetName('x'.repeat(40)).length, 31, 'Excel cấm tên sheet quá 31 ký tự');
// Tên tệp GIỮ dấu, nhưng không được trỏ ra ngoài thư mục.
assert.strictEqual(safeFileName('Báo cáo thu tiền tháng 9'), 'Báo cáo thu tiền tháng 9');
assert.ok(!safeFileName('../../etc/passwd').includes('/'), 'tên tệp không được chứa dấu phân cách');
assert.ok(!safeFileName('..').startsWith('.'), 'tên tệp không được bắt đầu bằng dấu chấm');
console.log('✓ tên cột/sheet/tệp: giữ dấu tiếng Việt, chặn đường dẫn thoát ra ngoài');
