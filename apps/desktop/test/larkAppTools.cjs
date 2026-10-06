/**
 * Bốn tool cấp "app/Drive" mà agent tự chẩn ra là nó thiếu.
 *
 * Chuyện đã xảy ra: agent dựng xong 32 bảng, nhưng Base thì KHÔNG CÓ TÊN và nằm trơ ở gốc Drive —
 * người dùng phải tự vào Lark đặt tên rồi kéo đi. Bộ tool cũ chỉ xuống tới bảng / cột / bản ghi /
 * view / role, không có cấp app, và Drive thì chỉ đọc được.
 *
 * Bài kiểm giữ ĐƯỜNG DẪN endpoint, vì đó là thứ duy nhất không tự lộ ra khi sai: một tool trỏ sai
 * địa chỉ vẫn biên dịch được, vẫn hiện trong danh sách, và chỉ chết lúc người dùng cần nó nhất.
 * Bốn đường dẫn dưới đây đã đối chiếu tài liệu Lark trước khi viết.
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const R = join(__dirname, '..', 'main', 'runtime', 'lark');
const bitable = readFileSync(join(R, 'tools', 'bitable.ts'), 'utf8');
const drive = readFileSync(join(R, 'tools', 'drive.ts'), 'utf8');

/** Lấy thân một tool theo tên, để phép kiểm không khớp nhầm sang tool khác. */
const toolBody = (src, name) => {
  const i = src.indexOf(`name: '${name}'`);
  assert.ok(i > 0, `không tìm thấy tool ${name}`);
  const j = src.indexOf("name: '", i + 10);
  return src.slice(i, j > 0 ? j : i + 3000);
};

// ── Cấp app: tạo Base CÓ TÊN, và đổi tên Base đã có ─────────────────────────────────
const create = toolBody(bitable, 'bitable_create_app');
assert.ok(/'POST', '\/open-apis\/bitable\/v1\/apps'/.test(create), 'bitable_create_app sai endpoint');
assert.ok(/name: i\.name/.test(create), 'phải truyền name — Base không tên đúng là lỗi gốc');
assert.ok(/folder_token/.test(create), 'phải nhận folder_token để Base không rơi ra gốc Drive');
assert.ok(/gated: true/.test(create), 'tạo Base là thao tác GHI, phải hỏi xác nhận');

const update = toolBody(bitable, 'bitable_update_app');
assert.ok(/'PUT', apps\(i\.app_token\)/.test(update), 'bitable_update_app phải PUT vào /apps/{app_token}');
assert.ok(/gated: true/.test(update), 'đổi tên Base là thao tác GHI');
console.log('✓ bitable_create_app + bitable_update_app: đúng endpoint, có name/folder_token, đều gated');

// ── Drive: tạo thư mục + di chuyển ───────────────────────────────────────────────────
const mkdir = toolBody(drive, 'drive_create_folder');
assert.ok(
  /'POST', '\/open-apis\/drive\/v1\/files\/create_folder'/.test(mkdir),
  'drive_create_folder sai endpoint',
);
const move = toolBody(drive, 'drive_move_file');
assert.ok(
  /'POST', `\/open-apis\/drive\/v1\/files\/\$\{enc\(i\.file_token\)\}\/move`/.test(move),
  'drive_move_file sai endpoint',
);
// `type` sai thì Lark từ chối, và Base thì phải là "bitable" — không phải "file".
assert.ok(/'bitable'/.test(move), 'drive_move_file phải cho phép type = bitable');
assert.ok(/gated: true/.test(mkdir) && /gated: true/.test(move), 'tạo/di chuyển đều là thao tác GHI');
console.log('✓ drive_create_folder + drive_move_file: đúng endpoint, Base chuyển được, đều gated');

// ── Cả hai bộ phải tới được máy chạy nền, không chỉ bản desktop ─────────────────────
const headless = readFileSync(join(R, 'tools', 'headless.ts'), 'utf8');
assert.ok(/\.\.\.bitableTools/.test(headless) && /\.\.\.driveTools/.test(headless),
  'máy chạy nền cũng phải có các tool này');
console.log('✓ máy chạy nền cũng cầm được bốn tool');

// ── Và agent phải được DẶN dùng, nếu không nó vẫn dựng Base không tên ───────────────
const prompt = readFileSync(join(R, 'systemPrompt.ts'), 'utf8');
assert.ok(/bitable_create_app/.test(prompt), 'lời hệ thống phải dặn tạo Base có tên');
assert.ok(/ĐỪNG dựng bảng vào một Base không tên/.test(prompt), 'phải cấm thẳng thói quen cũ');
console.log('✓ lời hệ thống dặn tạo Base CÓ TÊN, đúng thư mục');
