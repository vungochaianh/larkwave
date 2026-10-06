#!/usr/bin/env node
/**
 * Đẩy lỗi bộ soi tìm được sang bảng "Nhiệm vụ kiểm lỗi (Tester)", và cập nhật khi chúng đã hết.
 *
 * Hai bảng trước đây rời nhau: bộ soi ghi vào "Lỗi website (tự động)", còn bảng Tester là luồng
 * làm việc của người. Ai chỉ mở bảng Tester thì không bao giờ thấy lỗi máy tìm ra.
 *
 * BA RÀNG BUỘC quyết định cách làm, đọc thẳng từ schema bảng Tester:
 *
 *  1. CHỈ đẩy UI/UX và Logic. `Loại lỗi` chỉ có hai lựa chọn "Giao diện hiển thị" | "Logic" —
 *     không có SEO. Và đúng ra cũng không nên: bảng này để người MỞ MÀN HÌNH RA KIỂM, mà độ dài
 *     thẻ meta thì không kiểm bằng mắt được. SEO ở lại bảng riêng.
 *
 *  2. `Trang/Màn` là chọn-nhiều với DANH SÁCH ĐÓNG 38 URL. Ghi giá trị ngoài danh sách là hỏng cả
 *     lô, nên chỉ điền khi khớp; không khớp thì để trống và ghi URL vào phần Tình huống.
 *
 *  3. Không được làm ngập bảng. 11 dòng người viết mà đổ 35 dòng máy vào thì phần của người chìm
 *     mất. Chỉ đẩy mức Nặng và Vừa.
 *
 * Chống trùng: mỗi dòng máy tạo mang dấu `[auto:<hash>]` ở đầu Ghi chú. Chạy lại thì cập nhật
 * đúng dòng đó thay vì đẻ dòng mới.
 *
 * Dùng:  node scripts/sync-tester.mjs [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

const cfg = { ...process.env };
for (const f of ['.blog-autopost.env', '.lark-report.env']) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) cfg[m[1]] = m[2];
  }
}
const LARK = (cfg.LARK_HOST || 'https://open.larksuite.com').replace(/\/$/, '');
const BASE = cfg.LARK_BASE_TOKEN || 'N0Pubvc2ka8XaisoxcdjL5lRp2e';
const BUG_TABLE = cfg.LARK_BUG_TABLE || 'Lỗi website (tự động)';
const TESTER_TABLE = cfg.LARK_TESTER_TABLE || 'tblbJcZ70EmbUgEZ';

const log = (m) => console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')}  ${m}`);
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

let TK = null;
async function lark(method, route, body) {
  if (!TK) {
    const r = await (
      await fetch(`${LARK}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: cfg.LARK_APP_ID, app_secret: cfg.LARK_APP_SECRET }),
      })
    ).json();
    if (r.code !== 0) die(`Lark token: ${r.code} ${r.msg}`);
    TK = r.tenant_access_token;
  }
  return (
    await fetch(`${LARK}${route}`, {
      method,
      headers: { authorization: `Bearer ${TK}`, 'content-type': 'application/json; charset=utf-8' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  ).json();
}

/** Dấu chống trùng. Ngắn để không chiếm chỗ trong ô Ghi chú người cũng đọc. */
const mark = (page, text) =>
  `auto:${createHash('sha1').update(`${page}|${text}`).digest('hex').slice(0, 8)}`;

const PRIORITY = { Nặng: 'Cao', Vừa: 'Trung bình', Nhẹ: 'Thấp' };
const KIND = { 'UI/UX': 'Giao diện hiển thị', Logic: 'Logic' };

// ── đọc sổ lỗi ───────────────────────────────────────────────────────────────
const tables = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables?page_size=100`);
const bugTable = (tables.data?.items ?? []).find((t) => t.name === BUG_TABLE);
if (!bugTable) die(`Không thấy bảng "${BUG_TABLE}" — chạy scripts/site-check.mjs trước.`);

const bugs = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${bugTable.table_id}/records?page_size=500`);
const all = bugs.data?.items ?? [];

const relevant = all.filter((r) => {
  const kind = r.fields['Loại'];
  const level = r.fields['Mức'];
  return KIND[kind] && (level === 'Nặng' || level === 'Vừa');
});
log(`sổ lỗi: ${all.length} dòng → ${relevant.length} dòng thuộc UI/UX hoặc Logic, mức Nặng/Vừa`);

// ── danh sách Trang/Màn hợp lệ ───────────────────────────────────────────────
const fields = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${TESTER_TABLE}/fields?page_size=100`);
const screenField = (fields.data?.items ?? []).find((f) => f.field_name.startsWith('Trang/Màn'));
const SCREENS = new Set((screenField?.property?.options ?? []).map((o) => o.name));

// ── dòng đã có trong bảng Tester ─────────────────────────────────────────────
const cur = await lark('GET', `/open-apis/bitable/v1/apps/${BASE}/tables/${TESTER_TABLE}/records?page_size=500`);
const existing = new Map();
for (const r of cur.data?.items ?? []) {
  const note = String(r.fields['Ghi chú'] ?? '');
  const m = note.match(/\[(auto:[0-9a-f]{8})\]/);
  if (m) existing.set(m[1], r);
}
log(`bảng Tester: ${(cur.data?.items ?? []).length} dòng, trong đó ${existing.size} dòng do bộ soi tạo`);

// ── dựng bản ghi ─────────────────────────────────────────────────────────────
const toCreate = [];
const toUpdate = [];
const today = new Date().toLocaleDateString('vi-VN');

for (const r of relevant) {
  const f = r.fields;
  const url = f['Trang']?.link ?? '';
  const pagePath = f['Trang']?.text ?? '';
  const text = String(f['Lỗi'] ?? '');
  const id = mark(pagePath, text);
  const resolved = f['Trạng thái'] === 'Đã hết';
  const viewport = String(f['Khung nhìn'] ?? '').trim();
  const commit = String(f['Bản mã'] ?? '').trim();

  const note =
    `[${id}] Bộ soi tự động phát hiện, không phải người nhập.` +
    (viewport && viewport !== '—' ? ` Thấy ở khung nhìn: ${viewport}.` : '') +
    (resolved
      ? ` ĐÃ HẾT — không còn phát hiện được ở lượt soi ${today}${commit ? `, bản mã ${commit}` : ''}.`
      : ` Còn thấy ở lượt soi ${today}${commit ? `, bản mã ${commit}` : ''}.`);

  const hit = existing.get(id);
  if (hit) {
    // Chỉ cập nhật khi trạng thái ĐỔI. Ghi đè mỗi lượt sẽ dập mất phân loại người kiểm thử tự đặt
    // — họ có thể đã chuyển sang "Không phải lỗi (không FIX)" và mình không được phép lật lại.
    const curStatus = hit.fields['Trạng thái'];
    const humanDecided = curStatus === 'Không phải lỗi (không FIX)' || curStatus === 'Có thể TEST';
    if (humanDecided) continue;
    const want = resolved ? 'Đã FIX (DEV)' : curStatus || 'Chưa có trạng thái';
    if (want === curStatus && String(hit.fields['Ghi chú'] ?? '').includes(resolved ? 'ĐÃ HẾT' : 'Còn thấy')) continue;
    toUpdate.push({ record_id: hit.record_id, fields: { 'Trạng thái': want, 'Ghi chú': note } });
    continue;
  }

  // Lỗi đã hết mà CHƯA từng có trong bảng Tester thì không thêm nữa: thêm một việc đã xong chỉ
  // làm dài bảng, không ai cần kiểm nó.
  if (resolved) continue;

  toCreate.push({
    fields: {
      // Danh sách đóng — chỉ điền khi khớp, không thì để trống và ghi URL ở Tình huống.
      ...(SCREENS.has(url) ? { 'Trang/Màn (Website/Desktop)': [url] } : {}),
      'Tình huống': `${text}${SCREENS.has(url) ? '' : `\n\nTrang: ${url}`}`,
      'Các bước thực hiện': viewport && viewport !== '—'
        ? `Mở ${url} ở khung nhìn ${viewport}.`
        : `Mở ${url}.`,
      'Kết quả mong đợi (sau FIX)': 'Không còn hiện tượng nêu ở Tình huống khi mở lại trang.',
      'Loại lỗi': KIND[f['Loại']],
      'Độ ưu tiên': PRIORITY[f['Mức']] ?? 'Trung bình',
      'Trạng thái': 'Chưa có trạng thái',
      'Ghi chú': note,
    },
  });
}

log(`sẽ thêm ${toCreate.length} dòng, cập nhật ${toUpdate.length} dòng`);
for (const c of toCreate.slice(0, 6)) log(`   + ${String(c.fields['Tình huống']).split('\n')[0].slice(0, 90)}`);
if (DRY) {
  log('dry-run: dừng ở đây.');
  process.exit(0);
}

for (let i = 0; i < toCreate.length; i += 100) {
  const w = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${TESTER_TABLE}/records/batch_create`, {
    records: toCreate.slice(i, i + 100),
  });
  if (w.code !== 0) die(`thêm dòng Tester: ${w.code} ${w.msg}`);
}
for (let i = 0; i < toUpdate.length; i += 100) {
  const w = await lark('POST', `/open-apis/bitable/v1/apps/${BASE}/tables/${TESTER_TABLE}/records/batch_update`, {
    records: toUpdate.slice(i, i + 100),
  });
  if (w.code !== 0) die(`cập nhật dòng Tester: ${w.code} ${w.msg}`);
}
log(`xong: +${toCreate.length} mới, ~${toUpdate.length} cập nhật`);
