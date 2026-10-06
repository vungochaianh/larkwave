/**
 * Hội thoại MỚI chỉ được lưu khi đã có tương tác.
 *
 * Bấm "+" trước đây ghi ngay một tệp phiên rỗng → "Hội thoại cũ" đầy hội thoại trống. Nhưng bỏ
 * ghi mà không mở khe cho lần lưu ĐẦU TIÊN thì `larkSaveSession` (vốn không bao giờ tạo tệp mới)
 * sẽ im lặng bỏ qua — hội thoại mới không bao giờ được lưu. Bài kiểm này canh cả hai phía, và
 * canh luôn chốt chặn chống ghi nhầm sang tài khoản khác.
 */
const Module = require('node:module');
const { mkdtempSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { Notification: class { show() {} static isSupported() { return false; } } };
  return orig.apply(this, arguments);
};
const { LarkService } = require('../.test-build/runtime/lark/larkService.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ← ${extra}`}`);
  if (!ok) failed++;
};

async function main() {
  const base = mkdtempSync(join(tmpdir(), 'tw-draft-'));
  const svc = new LarkService(base);
  await svc.setAccount('user1');
  const file = (id) => join(base, 'lark', 'sessions', 'user1', `${id}.json`);

  // 1. Mở tab mới → CHƯA ghi đĩa.
  const { id } = await svc.larkNewSession([]);
  check('bấm "+" KHÔNG tạo tệp hội thoại rỗng', !existsSync(file(id)));

  // 2. Lưu khi vẫn rỗng → vẫn chưa ghi.
  await svc.larkSaveSession(id, []);
  check('lưu lúc chưa có tin nhắn → vẫn không ghi', !existsSync(file(id)));

  // 3. Có nội dung → ghi thật.
  await svc.larkSaveSession(id, [{ id: 'i1', role: 'user', text: 'xin chào' }]);
  check('có tương tác → hội thoại được lưu', existsSync(file(id)));
  if (existsSync(file(id))) {
    const saved = JSON.parse(readFileSync(file(id), 'utf8'));
    check('nội dung lưu đúng', Array.isArray(saved.items) && saved.items.length === 1, JSON.stringify(saved.items));
  }

  // 4. Lưu tiếp vẫn hoạt động (đã có tệp).
  await svc.larkSaveSession(id, [{ id: 'i1' }, { id: 'i2' }]);
  const after = JSON.parse(readFileSync(file(id), 'utf8'));
  check('lưu lần sau cập nhật được', after.items.length === 2);

  // 5. Chốt chặn tài khoản: nháp của A không được tạo tệp trong thư mục B.
  const svc2 = new LarkService(mkdtempSync(join(tmpdir(), 'tw-draft2-')));
  await svc2.setAccount('userA');
  const { id: draftA } = await svc2.larkNewSession([]);
  await svc2.setAccount('userB');
  await svc2.larkSaveSession(draftA, [{ id: 'x', text: 'của A' }]);
  const leaked = join(svc2.baseDir ?? '', 'lark', 'sessions', 'userB', `${draftA}.json`);
  check('đổi tài khoản → nháp cũ KHÔNG ghi sang thư mục tài khoản mới', !existsSync(leaked));

  console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
  process.exit(failed ? 1 : 0);
}
void main();
