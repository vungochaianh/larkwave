/**
 * Đính kèm file Office phải ĐỌC ĐƯỢC.
 *
 * Người dùng đính .xlsx vào hội thoại Lark: `Read` mở ra chỉ thấy nhị phân, và model quay sang
 * đoán `lark_read_attachment` (công cụ dành cho tệp trong Bitable/Drive) → HTTP 404 rồi kết luận
 * "không có công cụ nào đọc được file Excel". Bộ đọc ooxml đã có sẵn trong dự án, chỉ chưa được
 * nối vào đường đính kèm. Bài kiểm này dựng một .xlsx THẬT rồi kiểm phần chữ trích ra.
 */
const { extractOfficeText, officeKindFor } = require('../.test-build/runtime/lark/ooxml.js');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ← ${extra}`}`);
  if (!ok) failed++;
};

// Nhận dạng theo đuôi và theo mime
check('nhận ra .xlsx theo tên', officeKindFor('bang.xlsx', '') === 'xlsx');
check('nhận ra .docx theo tên', officeKindFor('tailieu.docx', '') === 'docx');
check('nhận ra theo mime khi tên không có đuôi', officeKindFor('noname', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') === 'xlsx');
check('file thường KHÔNG bị nhận nhầm', officeKindFor('anh.png', 'image/png') === null);

// Dựng một .xlsx thật bằng python rồi trích chữ
const dir = mkdtempSync(join(tmpdir(), 'tw-xlsx-'));
const xlsx = join(dir, 'mau.xlsx');
let built = false;
try {
  execFileSync('python3', ['-c', `
import zipfile
CT='''<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'''
RELS='''<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''
WB='''<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Trang1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>'''
WBR='''<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'''
SS='''<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Ma Khach Hang</t></si><si><t>Cuoc Van Chuyen</t></si><si><t>HOA NAM</t></si></sst>'''
SH='''<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12345</v></c></row></sheetData></worksheet>'''
z=zipfile.ZipFile('${xlsx}','w')
z.writestr('[Content_Types].xml',CT); z.writestr('_rels/.rels',RELS); z.writestr('xl/workbook.xml',WB)
z.writestr('xl/_rels/workbook.xml.rels',WBR); z.writestr('xl/sharedStrings.xml',SS); z.writestr('xl/worksheets/sheet1.xml',SH)
z.close()
`]);
  built = true;
} catch (e) {
  console.log('  (không dựng được .xlsx mẫu:', String(e).slice(0, 80), ')');
}

if (built) {
  const text = extractOfficeText(readFileSync(xlsx), 'xlsx');
  check('trích được chữ từ .xlsx thật', text.trim().length > 0, JSON.stringify(text).slice(0, 120));
  check('có nội dung ô chữ', text.includes('Ma Khach Hang') && text.includes('HOA NAM'), JSON.stringify(text).slice(0, 200));
  check('có cả số', text.includes('12345'), JSON.stringify(text).slice(0, 200));
}

console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
process.exit(failed ? 1 : 0);
