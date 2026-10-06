/**
 * Tài khoản CHƯA có bản sao lưu Lark nào thì `GET /me/lark-backup` trả **200 kèm thân rỗng**
 * (controller trả null). `r.json()` trên thân rỗng nổ "Unexpected end of JSON input".
 *
 * Lỗi thật, bắt được lúc chạy thử trên máy chủ ngày 2026-09-12, và nó trúng đúng người dùng LẦN
 * ĐẦU — người vừa bấm "Để Larkwave chạy lịch hộ" trước khi máy tính kịp đồng bộ lần nào:
 *   • chế độ chạy hộ: tenant đó bị ghi lỗi khó hiểu và không được gánh;
 *   • chế độ VM một-người: `entry.ts` exit(1) nên systemd crash-loop 10 giây một lần.
 *
 * Không có sao lưu là trạng thái HỢP LỆ (0 lịch), không phải lỗi.
 */
const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Module = require('node:module');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => mkdtempSync(join(tmpdir(), 'tw-empty-')) } };
  return orig.apply(this, arguments);
};

const { HeadlessRunner } = require('../.test-build/apps/desktop/main/runtime/lark/headlessRunner.js');

const mk = (bodyText) => {
  global.fetch = async () => ({ ok: true, status: 200, text: async () => bodyText });
  return new HeadlessRunner({
    appId: 'cli_x',
    appSecret: 's',
    accountToken: 't',
    apiBase: 'https://x.invalid/v1',
    ownerId: 'test',
    label: 'test',
  });
};

(async () => {
  // Thân rỗng ⇒ 0 lịch, KHÔNG ném.
  assert.strictEqual(await mk('').pullRules(), 0);

  // Chỉ có khoảng trắng cũng vậy.
  assert.strictEqual(await mk('   \n').pullRules(), 0);

  // Có sao lưu nhưng chưa có lịch nào.
  assert.strictEqual(await mk(JSON.stringify({ data: {} })).pullRules(), 0);

  // Có lịch thì phải đọc ra đủ — ca vá xong đừng làm hỏng đường thường.
  const two = JSON.stringify({ data: { automations: [{ id: 'a', enabled: true }, { id: 'b', enabled: false }] } });
  const r = mk(two);
  assert.strictEqual(await r.pullRules(), 2);
  assert.strictEqual(r.enabledCount(), 1);

  // JSON hỏng thật thì VẪN phải ném — đừng nuốt luôn cả lỗi thật.
  await assert.rejects(() => mk('{khong-phai-json').pullRules());

  console.log('✓ hostedEmptyBackup: chưa có sao lưu ⇒ 0 lịch, không nổ');
})().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
