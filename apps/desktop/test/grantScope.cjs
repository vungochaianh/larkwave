/**
 * Phạm vi quyền của lượt uỷ quyền — chỗ sai thì RÒ DỮ LIỆU, nên kiểm ở tầng thực thi công cụ
 * chứ không tin vào giao diện.
 *
 * Bốn bất biến:
 *  1. Base ngoài phạm vi → từ chối, và KHÔNG tiết lộ Base đó có tồn tại hay không.
 *  2. Không kèm app_token → từ chối (không có "Base hiện tại" ngầm định nào cả).
 *  3. Base chỉ-đọc → công cụ ghi bị từ chối, công cụ đọc vẫn chạy.
 *  4. Base được cấp ghi → công cụ ghi chạy. Chính sách CŨ (không có writeTokens) phải là chỉ-đọc.
 */
const Module = require('node:module');
const { mkdtempSync } = require('node:fs');
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

const svc = new LarkService(mkdtempSync(join(tmpdir(), 'tw-grant-')));
const call = async (tools, name, input) => {
  const t = tools.find((x) => x.name === name);
  if (!t) return { missing: true };
  try {
    await t.exec(input, {});
    return { ok: true };
  } catch (e) {
    return { error: String(e.message || e) };
  }
};

async function main() {
  const RO = 'basRead', RW = 'basWrite', OUT = 'basOutside';

  // ── chính sách: RO chỉ đọc, RW được ghi ─────────────────────────────────
  const tools = svc.scopedGrantTools({ appTokens: [RO, RW], mode: 'build', writeTokens: { [RW]: true } });

  const outside = await call(tools, 'bitable_list_tables', { app_token: OUT });
  check('Base ngoài phạm vi bị từ chối', !!outside.error, JSON.stringify(outside));
  check(
    'thông báo KHÔNG tiết lộ Base đó có tồn tại hay không',
    !!outside.error && !/không tồn tại|not found|tồn tại/i.test(outside.error),
    outside.error,
  );

  const noToken = await call(tools, 'bitable_list_tables', {});
  check('thiếu app_token → từ chối', !!noToken.error, JSON.stringify(noToken));

  const writeOnRO = await call(tools, 'bitable_update_record', { app_token: RO, table_id: 't', record_id: 'r', fields: {} });
  check('Base chỉ-đọc → công cụ GHI bị từ chối', !!writeOnRO.error && /chỉ có quyền ĐỌC/.test(writeOnRO.error), JSON.stringify(writeOnRO));

  const writeOnRW = await call(tools, 'bitable_update_record', { app_token: RW, table_id: 't', record_id: 'r', fields: {} });
  check('Base được cấp ghi → công cụ GHI qua được cổng phạm vi', !writeOnRW.error || !/Từ chối/.test(writeOnRW.error), JSON.stringify(writeOnRW));

  // ── chính sách CŨ (không có writeTokens) phải là chỉ-đọc ────────────────
  const legacy = svc.scopedGrantTools({ appTokens: [RW], mode: 'build' });
  const legacyWrite = legacy.find((t) => t.name === 'bitable_update_record');
  check('chính sách cũ (thiếu writeTokens) KHÔNG có công cụ ghi', !legacyWrite, legacyWrite ? 'có tool ghi' : '');

  // ── chế độ ask thì không có tool ghi dù đã cấp writeTokens ──────────────
  const askMode = svc.scopedGrantTools({ appTokens: [RW], mode: 'ask', writeTokens: { [RW]: true } });
  check('chế độ "chỉ hỏi" không có công cụ ghi', !askMode.find((t) => t.name === 'bitable_update_record'));

  console.log(failed ? `\n${failed} ca SAI` : '\nTẤT CẢ ĐÚNG');
  process.exit(failed ? 1 : 0);
}
void main();
