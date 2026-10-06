/**
 * Luật gánh nhiều tenant của chế độ "Larkwave chạy lịch hộ".
 *
 * Cái sai ở đây không kêu thành lỗi, nên phải có bài kiểm canh:
 *  (a) người dùng đổi App Secret ở Lark rồi bật lại → nếu runner chỉ gia hạn token mà không dựng
 *      lại, `LarkClient` vẫn ôm khoá CŨ và mọi lịch của họ hỏng lặng lẽ cho tới lần khởi động lại
 *      tiến trình tiếp theo.
 *  (b) không đổi gì → nếu cứ dựng lại thì mỗi 30 phút runner bị giết và dựng lại một lần, lịch
 *      đang chạy dở mất trạng thái.
 */
const assert = require('node:assert');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Module = require('node:module');
const orig = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { getPath: () => mkdtempSync(join(tmpdir(), 'tw-hosted-')) } };
  return orig.apply(this, arguments);
};

const { tenantAction } = require('../.test-build/tw-lark-runner/src/hosted.js');

const A = { appId: 'cli_a', appSecret: 's1' };

// Chưa có gì → dựng mới.
assert.strictEqual(tenantAction(undefined, A), 'create');

// Không đổi gì → chỉ gia hạn token, GIỮ runner đang chạy.
assert.strictEqual(tenantAction({ ...A }, A), 'refresh');

// Đổi App Secret → BẮT BUỘC dựng lại.
assert.strictEqual(tenantAction({ ...A }, { appId: 'cli_a', appSecret: 's2' }), 'rebuild');

// Đổi hẳn sang app Lark khác → cũng phải dựng lại.
assert.strictEqual(tenantAction({ ...A }, { appId: 'cli_b', appSecret: 's1' }), 'rebuild');

console.log('✓ hostedTenants: dựng mới / gia hạn / dựng lại đúng luật');
