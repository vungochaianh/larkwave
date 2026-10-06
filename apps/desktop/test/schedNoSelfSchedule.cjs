/**
 * Một lịch không được tạo thêm lịch.
 *
 * Lượt chạy theo lịch cầm bộ công cụ mặc định, trong đó có `schedule_agent_job`. Prompt của lịch
 * viết theo giọng đặt việc ("mỗi ngày 9h chạy skill …"), nên model dễ đọc thành "hãy ĐẶT LỊCH"
 * rồi gọi tool đó; `awaitConfirm` ở chế độ build tự duyệt. Chống trùng lại chỉ khớp khi prompt
 * GIỐNG HỆT TỪNG CHỮ, nên lệch một chữ là ra quy tắc mới + hội thoại `sched-<id>` mới. Kết quả
 * người dùng thấy: hội thoại cứ mọc thêm mà việc thì không ai làm.
 *
 * Bài kiểm đọc THẲNG mã nguồn thay vì import (tools/index.ts kéo theo electron).
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const R = join(__dirname, '..', 'main', 'runtime', 'lark');
const doc = (p) => readFileSync(join(R, p), 'utf8');

// ── 1. Lượt chạy theo lịch phải LỌC BỎ công cụ đặt lịch ────────────────────────────────
const svc = doc('larkService.ts');
const i = svc.indexOf('async runScheduledAgentTurn(');
assert.ok(i > 0, 'không tìm thấy runScheduledAgentTurn');
// Chỉ soi trong thân hàm đó, để một chỗ khác có lọc không làm bài kiểm này đạt oan.
const than = svc.slice(i, i + 6000);
assert.ok(
  /toolsOverride:[\s\S]{0,200}schedule_agent_job/.test(than),
  'runScheduledAgentTurn phải truyền toolsOverride loại bỏ schedule_agent_job',
);
console.log('✓ lượt chạy theo lịch không cầm được công cụ đặt lịch');

// ── 2. Nếu thêm công cụ đặt lịch MỚI, bộ lọc một-tên ở trên là chưa đủ ─────────────────
const names = [...doc('tools/automation.ts').matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
assert.deepStrictEqual(
  names,
  ['schedule_agent_job'],
  `automationTools nay có ${names.join(', ')} — bộ lọc trong runScheduledAgentTurn đang chặn ĐÚNG MỘT tên, hãy chặn cả nhóm`,
);
console.log('✓ nhóm công cụ tự động hoá vẫn chỉ có một tên, bộ lọc còn đủ');

// ── 3. Chống trùng lịch khớp theo prompt nguyên văn — ghi lại để khỏi quên giới hạn ────
const eng = doc('automationEngine.ts');
assert.ok(
  /\(r\.action\.prompt \|\| ''\)\.trim\(\) === \(clean\.action\.prompt \|\| ''\)\.trim\(\)/.test(eng),
  'chống trùng lịch phải so prompt; nếu đổi cách so, xem lại chú thích ở runScheduledAgentTurn',
);
console.log('✓ chống trùng vẫn so prompt nguyên văn (đó là lý do phải chặn từ gốc)');
