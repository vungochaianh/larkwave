#!/usr/bin/env node
/**
 * Bản .app vừa dựng có thật sự phân phối được không — hỏi CHÍNH công cụ của Apple.
 *
 * Vì sao cần: máy dựng ở đây đang TẮT Gatekeeper (`spctl --status` = assessments disabled). Nghĩa
 * là bản cài nào cũng mở được trên máy này, kể cả bản mà mọi máy khác sẽ chặn. Không có bước này
 * thì cách duy nhất phát hiện là người dùng báo "mở không lên" — và lúc đó bản cài đã ra ngoài.
 *
 * `syspolicy_check distribution` là công cụ Apple kèm sẵn macOS 14+. Nó trả lời đúng câu hỏi cần
 * hỏi: "máy của người khác sẽ xử lý bản này thế nào", chứ không phải "máy này mở được không".
 *
 * Hai lỗi nó bắt được mà mắt thường không thấy:
 *   • thiếu vé notarization (app sẽ bị chặn trên mọi máy có Gatekeeper bật),
 *   • ký bằng chứng chỉ "Apple Development" — loại chỉ dùng để phát triển, không được phép dùng
 *     để phân phối. Đã lọt ra một lần ở bản 1.0.310 vì builder tự nhặt chứng chỉ trong keychain.
 *
 * CHẶN cái BẤT THƯỜNG, chỉ NHẮC cái vốn luôn thiếu:
 *   • chặn  — chữ ký hỏng, hoặc ký bằng chứng chỉ "Apple Development" (lẽ ra không bao giờ xảy ra,
 *             xảy ra nghĩa là builder lại tự nhặt chứng chỉ trong keychain);
 *   • nhắc  — thiếu notarization. Dự án này CHƯA có Developer ID nên nó luôn thiếu; chặn vì lý do
 *             đó thì cổng lúc nào cũng đỏ, người ta quen tay bỏ qua, và lúc có drift thật thì
 *             không ai còn đọc nữa. Một cổng luôn đỏ là một cổng đã tắt.
 *
 * Dùng:
 *   node scripts/check-dist-mac.mjs [đường/dẫn/tới/Larkwave.app]
 *   node scripts/check-dist-mac.mjs --strict        # coi cả thiếu notarization là lỗi
 *
 * Mặc định lấy bản vừa dựng ở apps/desktop/dist/mac-universal/.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const appArg = args.find((a) => !a.startsWith('--'));
const APP = appArg || join(ROOT, 'apps/desktop/dist/mac-universal/Larkwave.app');

const c = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const die = (m) => {
  console.error(`${c.red}✗ ${m}${c.off}`);
  process.exit(1);
};

if (process.platform !== 'darwin') {
  console.log(`${c.dim}không phải macOS — bỏ qua${c.off}`);
  process.exit(0);
}
if (!existsSync(APP)) die(`Không thấy ${APP}. Dựng trước: pnpm --filter desktop dist:mac`);

/**
 * Chạy một lệnh, trả về {ok, out}. Không ném — mã thoát ở đây là DỮ LIỆU, không phải sự cố.
 *
 * Gộp CẢ stdout LẪN stderr: `codesign -dvvv` in toàn bộ thông tin chữ ký ra **stderr**. Chỉ đọc
 * stdout thì hàm này báo "không có chữ ký" cho một app ký đầy đủ — tức là bước kiểm chứng chỉ, thứ
 * quan trọng nhất ở đây, im lặng trả kết quả sai.
 */
function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
  if (r.error) return { ok: false, out: String(r.error.message || '') };
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}

let blocking = false; // sai lệch bất thường — phải dừng
let note = false; // trạng thái đã biết — chỉ nhắc

// ── 1. Chứng chỉ ký ───────────────────────────────────────────────────────────
// Kiểm TRƯỚC notarization vì nó là nguyên nhân gốc: không thể notarize một app ký bằng chứng chỉ
// phát triển, nên báo "thiếu notarization" mà không nói chuyện chứng chỉ là chỉ tay vào triệu chứng.
const sig = run('codesign', ['-dvvv', APP]);
const authority = (sig.out.match(/^Authority=(.+)$/m) || [])[1] || '';
const adhoc = /Signature=adhoc/.test(sig.out);

if (adhoc) {
  // Đây là trạng thái BÌNH THƯỜNG của dự án cho tới khi có Developer ID. Apple xếp nó là Warning,
  // không phải Fatal — người dùng vẫn mở được qua Cài đặt hệ thống, đúng như mọi bản trước nay.
  console.log(`${c.yellow}⚠ ký ad-hoc${c.off} — người dùng phải tự cho phép trong Cài đặt hệ thống (như các bản trước)`);
  note = true;
} else if (/^Apple Development:/.test(authority)) {
  console.log(`${c.red}✗ ký bằng chứng chỉ PHÁT TRIỂN${c.off} — ${authority}`);
  console.log(`  Loại chứng chỉ này KHÔNG được phép dùng để phân phối và không notarize được.`);
  console.log(`  Gốc rễ thường gặp: builder tự nhặt chứng chỉ trong keychain. Đã ghim`);
  console.log(`  ${c.dim}identity: null${c.off} trong electron-builder.yml để chặn — nếu vẫn thấy dòng này thì có ai đó gỡ ra.`);
  blocking = true;
} else if (/^Developer ID Application:/.test(authority)) {
  console.log(`${c.green}✓ ký bằng Developer ID${c.off} — ${authority}`);
} else {
  console.log(`${c.yellow}⚠ không nhận ra loại chữ ký${c.off}: ${authority || '(không có)'}`);
  blocking = true;
}

// ── 2. Chữ ký còn nguyên vẹn ──────────────────────────────────────────────────
// Một chữ ký hỏng cho ra thông báo TỆ NHẤT với người dùng ("app bị hỏng, hãy chuyển vào Thùng
// rác") — tệ hơn hẳn "chưa xác minh được nhà phát triển", vì nó không có đường đi tiếp.
const verify = run('codesign', ['--verify', '--deep', '--strict', APP]);
if (!verify.ok) {
  console.log(`${c.red}✗ chữ ký HỎNG${c.off} — người dùng sẽ thấy "app bị hỏng", không có cách mở`);
  console.log(`  ${verify.out.trim().split('\n').slice(0, 3).join('\n  ')}`);
  blocking = true;
} else {
  console.log(`${c.green}✓ chữ ký nguyên vẹn${c.off}`);
}

// ── 3. Phán quyết của Apple ───────────────────────────────────────────────────
// Tách FATAL khỏi WARNING. Cả hai kiểu ký hiện có đều dính đúng MỘT Fatal — thiếu notarization —
// nên dùng nó để chặn là chặn mọi lần phát hành, mãi mãi, cho tới khi mua Developer ID.
const sys = run('syspolicy_check', ['distribution', APP]);
if (/failed one or more pre-distribution checks/i.test(sys.out)) {
  const fatals = [...sys.out.matchAll(/^(\S[^\n]*)\n(?:[^\n]*\n)??\s+Severity:\s*Fatal/gm)].map((m) => m[1].trim());
  const onlyNotary = fatals.length > 0 && fatals.every((f) => /Notary Ticket Missing/i.test(f));
  if (onlyNotary) {
    console.log(`${c.yellow}⚠ chưa notarize${c.off} — máy người dùng sẽ hỏi trước khi cho mở (Cài đặt → Quyền riêng tư & Bảo mật)`);
    note = true;
  } else if (fatals.length) {
    console.log(`${c.red}✗ Apple chặn${c.off} — ${fatals.join(', ')}`);
    blocking = true;
  }
} else if (sys.ok) {
  console.log(`${c.green}✓ Apple: phân phối được${c.off}`);
} else {
  // Công cụ vắng mặt (macOS cũ) KHÔNG được coi là đạt — im lặng cho qua là đúng thứ bước này sinh
  // ra để tránh. Nhưng cũng không chặn: thiếu công cụ là chuyện của máy dựng, không phải của bản dựng.
  console.log(`${c.yellow}⚠ không chạy được syspolicy_check${c.off} — chưa kết luận được, đừng coi là đạt`);
  note = true;
}

if (blocking) {
  console.log(`\n${c.dim}Xem docs/ky-va-notarize-macos.md${c.off}`);
  die('Bản dựng sai lệch so với cấu hình — dừng phát hành.');
}
if (note) {
  console.log(`\n${c.yellow}Bản này phát hành được, nhưng người dùng phải tự cho phép ở lần mở đầu${c.off}`);
  console.log(`${c.dim}Bỏ hẳn bước đó cần Developer ID + notarize — xem docs/ky-va-notarize-macos.md${c.off}`);
  if (STRICT) die('--strict: coi cảnh báo là lỗi.');
  process.exit(0);
}
console.log(`\n${c.green}Bản cài này mở được trên máy người khác mà không cần thao tác gì thêm.${c.off}`);
process.exit(0);
