/**
 * So phiên bản CLI, và vì sao phải cảnh báo khi nó cũ.
 *
 * Model được chọn bằng BÍ DANH (`opus`, `fable`), nên bí danh chỉ trỏ tới model mới khi CLI đủ
 * mới. Máy cài CLI cũ vẫn chạy ngon lành: không lỗi, không cảnh báo, chỉ là chạy model đời trước
 * — và người dùng không có cách nào biết. Đo thật lúc viết: máy này 2.1.220, npm 2.1.286.
 */
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Dựng lại đúng phép so trong claude.ts (hàm thật nằm trong cây import kéo theo electron).
const older = (a, b) => {
  if (!a || !b) return false;
  const pa = a.split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0);
  const pb = b.split('.').map((x) => Number(x.replace(/\D.*$/, '')) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
};

assert.ok(older('2.1.220', '2.1.286'), 'đúng ca đã đo trên máy thật');
assert.ok(older('2.0.999', '2.1.0'), 'phải so theo từng đoạn, không so chuỗi');
assert.ok(older('1.9.9', '2.0.0'));
assert.ok(!older('2.1.286', '2.1.286'), 'bằng nhau thì KHÔNG phải cũ');
assert.ok(!older('2.2.0', '2.1.286'), 'mới hơn thì không được báo cũ');
// Thiếu dữ liệu (mất mạng, chưa cài) thì im lặng — đừng doạ người ta bằng một phép so không có vế.
assert.ok(!older(undefined, '2.1.286'));
assert.ok(!older('2.1.220', undefined));
// Hậu tố kiểu "2.1.220-beta.1" không được làm phép so vỡ.
assert.ok(older('2.1.220-beta.1', '2.1.286'));
console.log('✓ so phiên bản: theo từng đoạn, bằng/mới hơn thì im, thiếu vế thì không doạ');

// Luật phải CÒN trong mã, và chỉ tra npm khi CLI thật sự có trên máy.
const src = readFileSync(join(__dirname, '..', 'main', 'runtime', 'runners', 'claude.ts'), 'utf8');
assert.ok(/registry\.npmjs\.org\/@anthropic-ai\/claude-code\/latest/.test(src), 'phải tra npm để biết bản mới nhất');
assert.ok(/s\.installed \? await latestClaudeCliVersion\(\)/.test(src), 'chưa cài thì đừng tra npm');
assert.ok(/catch \{/.test(src), 'mất mạng KHÔNG được làm hỏng việc liệt kê runner');
console.log('✓ chỉ tra npm khi đã cài, và nuốt lỗi mạng');

// Giao diện phải nói ra, kèm câu lệnh cập nhật.
const ui = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'components', 'RunnerModelPicker.tsx'),
  'utf8',
);
assert.ok(/active\.outdated/.test(ui), 'picker phải đọc cờ outdated');
assert.ok(/npm i -g @anthropic-ai\/claude-code/.test(ui), 'phải đưa sẵn câu lệnh cập nhật');
console.log('✓ giao diện cảnh báo kèm câu lệnh cập nhật');

// Và bí danh model mới phải có trong danh mục.
const cat = readFileSync(join(__dirname, '..', 'main', 'runtime', 'runners', 'catalog.ts'), 'utf8');
for (const alias of ['fable', 'opus', 'sonnet', 'haiku']) {
  assert.ok(new RegExp(`id: '${alias}'`).test(cat), `thiếu bí danh ${alias}`);
}
console.log('✓ danh mục có đủ fable / opus / sonnet / haiku');

// ── Phải hiện tên model THẬT, không chỉ bí danh ──────────────────────────────────────
// Đo thật ngày 01/10/2026, cùng một máy, chỉ khác phiên bản CLI:
//   CLI 2.1.220 → --model opus = claude-opus-5
//   CLI 2.1.286 → --model opus = claude-opus-5-5
// Cùng một lựa chọn "Opus", hai model khác đời, không có gì báo. Chính tôi đã kết luận nhầm
// "không có Opus 5.5" vì CLI của mình cũ — nên app phải hiện id thật ra.
const agent = readFileSync(join(__dirname, '..', 'main', 'runtime', 'lark', 'larkAgent.ts'), 'utf8');
assert.ok(/\.\.\.\(cliModel \? \{ model: cliModel \} : \{\}\)/.test(agent), 'usage phải mang id model thật');

const chat = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'components', 'lark', 'LarkChat.tsx'),
  'utf8',
);
assert.ok(/if \(ev\.model\) lastAgentRef\.current/.test(chat), 'bong bóng trả lời phải ghi model thật');
console.log('✓ hiện id model thật (claude-opus-5-5), không chỉ bí danh "opus"');
