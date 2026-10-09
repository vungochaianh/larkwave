/**
 * Xoá hội thoại Lark là MẤT HẲN — kể cả sau khi đồng bộ với máy chủ.
 *
 * Lỗi gốc: hợp nhất khi đồng bộ là phép HỢP TẬP HỢP theo id, nên bản trên máy chủ được kéo về và
 * ghi lại — người dùng xoá mãi không mất. Bài kiểm này chạy trên MÃ ĐÃ BIÊN DỊCH với `electron`
 * giả và một `fetch` giả đóng vai máy chủ vẫn còn giữ hội thoại đã xoá.
 *
 *   cd apps/desktop && npx tsc main/runtime/lark/larkService.ts --outDir .test-build \
 *     --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 *   node test/larkDeleteSync.cjs
 */
const Module = require('node:module');
const { mkdtempSync, existsSync, readFileSync } = require('node:fs');
const { mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { Notification: class { constructor() {} show() {} static isSupported() { return false; } } };
  return orig.apply(this, arguments);
};

const { LarkService } = require('../.test-build/runtime/lark/larkService.js');

// JWT giả: chỉ cần phần payload có `sub` để service suy ra thư mục theo tài khoản.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 'user1' })}.y`;
const SESSION = { id: 'chat-1', title: 'Hội thoại cần xoá', items: [{ id: 'i1', text: 'xin chào' }], updatedAt: Date.now() };

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ← ${extra}`}`);
  if (!ok) failed++;
};

async function main() {
  const base = mkdtempSync(join(tmpdir(), 'tw-lark-'));
  const svc = new LarkService(base);
  svc.currentUserId = 'user1';

  // Hội thoại đang có trên máy.
  const dir = join(base, 'lark', 'sessions', 'user1');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'chat-1.json'), JSON.stringify(SESSION), 'utf8');

  // MÁY CHỦ vẫn giữ hội thoại đó — đây chính là thứ trước đây làm nó sống lại.
  // Từ khi dùng chung API Toolswave, Larkwave CHỈ KÉO bản sao lưu (không PUT — ô đó là của app
  // Toolswave). Đếm mọi lần PUT để chốt điều đó.
  let puts = 0;
  const reply = (o) => ({ ok: true, text: async () => JSON.stringify(o), json: async () => o });
  global.fetch = async (url, init) => {
    if (!init || init.method !== 'PUT') return reply({ data: { sessions: [SESSION] } });
    puts++;
    return reply({ updatedAt: new Date().toISOString() });
  };

  // 1. Đồng bộ khi CHƯA xoá: hội thoại phải còn.
  await svc.larkBackupSync(TOKEN);
  check('chưa xoá → hội thoại vẫn còn', existsSync(join(dir, 'chat-1.json')));

  // 2. Xoá, rồi đồng bộ lại — máy chủ vẫn trả về nó.
  await svc.larkDeleteSession('chat-1');
  check('xoá xong → tệp biến mất', !existsSync(join(dir, 'chat-1.json')));
  await svc.larkBackupSync(TOKEN);
  check(
    'ĐỒNG BỘ SAU KHI XOÁ → KHÔNG sống lại',
    !existsSync(join(dir, 'chat-1.json')),
    'hội thoại đã bị kéo về từ máy chủ',
  );
  check('KHÔNG PUT lên ô sao lưu dùng chung với Toolswave', puts === 0, `${puts} lần PUT`);
  const tomb = JSON.parse(readFileSync(join(base, 'lark', 'deleted', 'user1', 'deleted.json'), 'utf8'));
  check('bia mộ vẫn giữ ở máy (chặn kéo về lại)', 'chat-1' in tomb);

  // 3. Máy KHÁC xoá (máy chủ gửi bia mộ về) → máy này phải xoá theo.
  const base2 = mkdtempSync(join(tmpdir(), 'tw-lark2-'));
  const svc2 = new LarkService(base2);
  svc2.currentUserId = 'user1';
  const dir2 = join(base2, 'lark', 'sessions', 'user1');
  await mkdir(dir2, { recursive: true });
  await writeFile(join(dir2, 'chat-1.json'), JSON.stringify(SESSION), 'utf8');
  global.fetch = async (url, init) => {
    if (!init || init.method !== 'PUT') return reply({ data: { sessions: [SESSION], deleted: { 'chat-1': Date.now() } } });
    puts++;
    return reply({ updatedAt: new Date().toISOString() });
  };
  await svc2.larkBackupSync(TOKEN);
  check('máy khác xoá → máy này xoá theo', !existsSync(join(dir2, 'chat-1.json')));

  // 4. runnerId của máy/app khác trong settings sao lưu KHÔNG được nhận về.
  const base3 = mkdtempSync(join(tmpdir(), 'tw-lark3-'));
  const svc3 = new LarkService(base3);
  svc3.currentUserId = 'user1';
  svc3.store.setScope('user1');
  global.fetch = async (url, init) => {
    if (!init || init.method !== 'PUT') return reply({ data: { settings: { runnerId: 'pc-toolswave', defaultModel: 'opus' } } });
    puts++;
    return reply({});
  };
  await svc3.larkBackupSync(TOKEN);
  const st3 = JSON.parse(readFileSync(join(base3, 'lark', 'accounts', 'user1', 'settings.json'), 'utf8'));
  check('settings từ máy chủ vẫn hợp nhất (defaultModel)', st3.defaultModel === 'opus', JSON.stringify(st3));
  check('runnerId của Toolswave KHÔNG chảy sang', st3.runnerId === undefined, st3.runnerId);
  // Bản sao lưu rỗng (200 + 0 byte) không được làm nổ.
  global.fetch = async () => ({ ok: true, text: async () => '', json: async () => { throw new Error('empty'); } });
  check('sao lưu rỗng → vẫn trả kết quả', !!(await svc3.larkBackupSync(TOKEN)));
  check('tổng cộng không có lần PUT nào', puts === 0, `${puts}`);

  console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
  process.exit(failed ? 1 : 0);
}
void main();
