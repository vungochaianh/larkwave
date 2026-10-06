/**
 * Kiểm bộ phân loại "thất bại này có đáng ngờ do ỨNG DỤNG hỏng không".
 *
 * Đây là ranh giới quan trọng nhất của tính năng nhắc-cài-lại: sai một bên thì đổ oan cho phiên
 * bản (bảo người dùng tải 400MB cho một lỗi quyền), sai bên kia thì im đúng lúc cần nói.
 * Mặc định phải là IM.
 *
 *   bash apps/desktop/test/run.sh
 */
const { suspectAppBugError, isFailurePayload, isSelfDeclaredFailure, tierForPayload, tierForError } =
  require('../.test-build/runtime/lark/larkToolExec.js');

class LarkApiError extends Error {
  constructor(code, msg) { super(`Lark ${code}: ${msg}`); this.name = 'LarkApiError'; this.code = code; }
}
class LarkNetworkError extends Error {
  constructor(p) { super(`Không kết nối được tới Lark (${p}).`); this.name = 'LarkNetworkError'; }
}

const NEN_IM = [
  ['Lark từ chối vì thiếu quyền', new LarkApiError(91403, 'no permission')],
  ['Lark từ chối vì sai tham số', new LarkApiError(1254005, 'invalid field name')],
  ['Lark không tìm thấy bản ghi', new LarkApiError(1254043, 'record not found')],
  ['mạng hỏng', new LarkNetworkError('/open-apis/bitable/v1/apps')],
  ['tải tệp 400 (thiếu extra)', new Error('Tải tệp thất bại (HTTP 400: thiếu hoặc sai tham số `extra`)')],
  ['tệp quá lớn — giới hạn sản phẩm', { ok: false, reason: 'Tệp 41.3MB, vượt giới hạn 25MB.' }],
  ['thiếu table_id — lỗi dữ liệu/lời gọi', { ok: false, reason: 'Không tải được tệp đính kèm. Thiếu table_id — hãy gọi lại tool này kèm table_id.' }],
  ['chốt an toàn requires-confirm', { ok: false, error: 'requires-confirm', blocked: 'sensitive-action' }],
  ['stale-ref (được thiết kế để xảy ra)', { ok: false, error: 'stale-ref' }],
  ['chưa kết nối Lark web', { ok: false, error: 'Cần "Kết nối Lark web" (Cài đặt → Lark × Agents).' }],
  ['người dùng từ chối', new Error('Thao tác bị từ chối hoặc hết thời gian chờ xác nhận.')],
  ['payload thành công', { ok: true, items: [] }],
];

const NEN_NOI = [
  ['công cụ không tồn tại (chữ ký bản cài cũ)', new Error('Không tìm thấy tool lark_read_attachment.')],
  ['công cụ dựng app không tồn tại', new Error('Không có công cụ write_file.')],
  ['lỗi cấp ngôn ngữ', new Error("Cannot read properties of undefined (reading 'exec')")],
  ['TypeError', new TypeError('x is not a function')],
  ['payload tự khai lỗi ứng dụng', { ok: false, error: 'TypeError: undefined is not an object' }],
];

let bad = 0;
const judge = (v) => (v instanceof Error ? suspectAppBugError(v) : isFailurePayload(v));

for (const [name, v] of NEN_IM) {
  const got = judge(v);
  if (got) { bad++; console.log('✗ ĐÁNG LẼ IM:', name); } else console.log('✓ im  —', name);
}
for (const [name, v] of NEN_NOI) {
  const got = judge(v);
  if (!got) { bad++; console.log('✗ ĐÁNG LẼ NÓI:', name); } else console.log('✓ nói —', name);
}

// isSelfDeclaredFailure vẫn phải bắt MỌI {ok:false} (dùng cho chip lỗi trên giao diện)
const uiCases = [
  [{ ok: false, error: 'requires-confirm', blocked: 'x' }, true],
  [{ ok: false, reason: 'Tệp quá lớn' }, true],
  [{ ok: true }, false],
  ['chuỗi', false],
  [null, false],
];
for (const [v, want] of uiCases) {
  if (isSelfDeclaredFailure(v) !== want) { bad++; console.log('✗ isSelfDeclaredFailure sai với', JSON.stringify(v)); }
}
// ── Phân tầng thất bại: quyết định hộp "Lỗi công cụ" đếm cái gì ────────────────
const TIERS = [
  // Lỗi THẬT — phải vào hộp lỗi.
  ['Lark thiếu quyền', new LarkApiError(91403, 'no permission'), 'error', 'err'],
  ['mạng hỏng', new LarkNetworkError('/x'), 'error', 'err'],
  ['tệp quá lớn', { ok: false, reason: 'Tệp 41.3MB, vượt giới hạn 25MB.' }, 'error', 'pay'],
  ['thiếu table_id', { ok: false, reason: 'Không tải được tệp đính kèm. Thiếu table_id.' }, 'error', 'pay'],
  // CẦN NGƯỜI xử lý — hiện ra nhưng không đếm là lỗi.
  ['chốt an toàn', { ok: false, error: 'requires-confirm', blocked: 'sensitive-action' }, 'blocked', 'pay'],
  ['chưa kết nối Lark web', { ok: false, error: 'Cần "Kết nối Lark web" (Cài đặt).' }, 'blocked', 'pay'],
  ['không có cửa sổ Lark', { ok: false, error: 'no-window' }, 'blocked', 'pay'],
  // (Không kiểm "người dùng từ chối" ở đây: đường đó phát `tool_denied` rồi return, KHÔNG bao giờ
  //  đi qua bộ xếp tầng — giao diện đã hiện nó là 'denied' xám qua cơ chế khác.)
  // NHIỄU nội bộ — agent tự phục hồi.
  ['ref cũ', { ok: false, error: 'stale-ref', hint: 'Snapshot lại.' }, 'noise', 'pay'],
  ['không thấy nút', { ok: false, error: 'not-visible' }, 'noise', 'pay'],
  ['không thấy lựa chọn', { ok: false, error: 'option-not-found' }, 'noise', 'pay'],
  // budget-exhausted thuộc tầng B chứ không phải C: hint của chính nó là "dừng và BÁO NGƯỜI DÙNG".
  ['hết ngân sách bước', { ok: false, error: 'budget-exhausted' }, 'blocked', 'pay'],
  ['không ở trang Lark (agent tự mở lại)', { ok: false, error: 'not-on-lark' }, 'noise', 'pay'],
  ['mã ghép tiền tố nav-failed: chi tiết', { ok: false, error: 'nav-failed: net::ERR_X' }, 'noise', 'pay'],
  ['lỗi JS thô trong vòng lái giao diện', { ok: false, error: 'Script failed to execute' }, 'noise', 'pay', 'lark_ui_act'],
  ['lỗi JS thô ngoài vòng đó vẫn là lỗi thật', { ok: false, error: 'Script failed to execute' }, 'error', 'pay', 'bitable_search_records'],
  ['mở trang hỏng', { ok: false, status: 'nav-failed', error: 'timeout' }, 'noise', 'pay'],
];
for (const [name, v, want, kind, toolName] of TIERS) {
  const got = kind === 'err' ? tierForError(v) : tierForPayload(v, toolName);
  if (got !== want) { bad++; console.log(`✗ tầng sai — ${name}: mong '${want}', nhận '${got}'`); }
  else console.log(`✓ tầng ${want.padEnd(7)} — ${name}`);
}

console.log(bad ? `\nHỎNG ${bad}` : `\nĐẠT ${NEN_IM.length + NEN_NOI.length + uiCases.length + TIERS.length} ca`);
process.exit(bad ? 1 : 0);
