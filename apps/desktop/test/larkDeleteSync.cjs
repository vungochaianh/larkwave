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
  let pushed = null;
  global.fetch = async (url, init) => {
    if (!init || init.method !== 'PUT') {
      return { ok: true, json: async () => ({ data: { sessions: [SESSION] } }) };
    }
    pushed = JSON.parse(init.body).data;
    return { ok: true, json: async () => ({ updatedAt: new Date().toISOString() }) };
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
  check(
    'không đẩy ngược hội thoại đã xoá lên máy chủ',
    Array.isArray(pushed?.sessions) && !pushed.sessions.some((s) => s.id === 'chat-1'),
    JSON.stringify(pushed?.sessions?.map((s) => s.id)),
  );
  check('bia mộ được đẩy lên để máy khác xoá theo', !!pushed?.deleted && 'chat-1' in pushed.deleted);

  // 3. Máy KHÁC xoá (máy chủ gửi bia mộ về) → máy này phải xoá theo.
  const base2 = mkdtempSync(join(tmpdir(), 'tw-lark2-'));
  const svc2 = new LarkService(base2);
  svc2.currentUserId = 'user1';
  const dir2 = join(base2, 'lark', 'sessions', 'user1');
  await mkdir(dir2, { recursive: true });
  await writeFile(join(dir2, 'chat-1.json'), JSON.stringify(SESSION), 'utf8');
  global.fetch = async (url, init) => {
    if (!init || init.method !== 'PUT') {
      return { ok: true, json: async () => ({ data: { sessions: [SESSION], deleted: { 'chat-1': Date.now() } } }) };
    }
    return { ok: true, json: async () => ({ updatedAt: new Date().toISOString() }) };
  };
  await svc2.larkBackupSync(TOKEN);
  check('máy khác xoá → máy này xoá theo', !existsSync(join(dir2, 'chat-1.json')));

  console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
  process.exit(failed ? 1 : 0);
}
void main();
