import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { HeadlessRunner } from '../../apps/desktop/main/runtime/lark/headlessRunner';
import { HostedSupervisor } from './hosted';

/**
 * Điểm vào của tw-lark-runner: chạy lịch tự động hoá Lark 24/7 trên một VM, để chúng không chết
 * khi tắt app desktop. Cùng vai với `tw-cms-keeper`, chỉ khác việc nó gánh.
 *
 * Khoá Lark nằm trong `.env` TRÊN VM CỦA BẠN, không phải trên máy chủ Larkwave — bất biến "máy
 * chủ không giữ chất liệu khoá Lark" giữ nguyên, chỉ là "máy của bạn" nay là cái VM này.
 */
const need = (k: string): string => {
  const v = process.env[k]?.trim();
  if (!v) {
    console.error(`✗ Thiếu ${k} trong .env`);
    process.exit(1);
  }
  return v;
};

/** Định danh ổn định của VM này — sinh một lần rồi nhớ, để lease không nhảy mỗi lần khởi động lại. */
function ownerId(): string {
  const f = join(process.cwd(), '.runner-id');
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const id = `vm-${randomUUID().slice(0, 8)}`;
  writeFileSync(f, id);
  try {
    chmodSync(f, 0o600);
  } catch {
    /* không sao — đây không phải bí mật, chỉ là một cái tên */
  }
  return id;
}

const ts = () => new Date().toLocaleString('vi-VN', { timeZone: process.env.TZ || 'Asia/Ho_Chi_Minh' });
const log = (level: 'info' | 'warn' | 'error', msg: string) => {
  const tag = level === 'error' ? '✗' : level === 'warn' ? '!' : '·';
  console.log(`${ts()} ${tag} ${msg}`);
};

/**
 * Chế độ CHẠY HỘ (MODE=hosted): một tiến trình gánh lịch cho nhiều người dùng, khoá lấy từ máy
 * chủ. Không đọc LARK_APP_* trong .env — mỗi tenant có khoá riêng.
 *
 * Đây là chế độ Larkwave tự vận hành, KHÁC hẳn chế độ mặc định bên dưới (một người, khoá nằm
 * trong .env trên máy của chính họ). Xem chú thích ở `hosted.ts` và ở model `LarkHostedRunner`.
 */
async function mainHosted(): Promise<void> {
  const sup = new HostedSupervisor({
    apiBase: (process.env.LARKWAVE_API || 'https://api.toolswave.net/v1').replace(/\/+$/, ''),
    serviceKey: need('LARK_RUNNER_SERVICE_KEY'),
    // 30 phút: token tenant sống 6 giờ, nên biên còn rất rộng; đủ nhanh để người vừa bật không
    // phải chờ lâu, đủ thưa để không đập vào máy chủ.
    refreshMs: 1_800_000,
    log,
  });
  await sup.start();
  log('info', 'chế độ CHẠY HỘ — đang phục vụ nhiều tài khoản.');

  const bye = (sig: string) => {
    log('info', `nhận ${sig} — dừng ${sup.count()} tài khoản.`);
    sup.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => bye('SIGINT'));
  process.on('SIGTERM', () => bye('SIGTERM'));
}

async function main(): Promise<void> {
  const runner = new HeadlessRunner({
    appId: need('LARK_APP_ID'),
    appSecret: need('LARK_APP_SECRET'),
    accountToken: need('LARKWAVE_TOKEN'),
    apiBase: (process.env.LARKWAVE_API || 'https://api.toolswave.net/v1').replace(/\/+$/, ''),
    ownerId: ownerId(),
    label: process.env.RUNNER_LABEL?.trim() || `VM ${hostname()}`,
    log,
  });

  try {
    const n = await runner.pullRules();
    log('info', `đã tải ${n} lịch (${runner.enabledCount()} đang bật)`);
  } catch (e) {
    log('error', `không tải được lịch: ${(e as Error)?.message}`);
    process.exit(1);
  }

  runner.start();
  log('info', 'đang chạy. Máy này sẽ GIÀNH quyền chạy lịch từ app desktop (VM được ưu tiên).');

  // Tải lại lịch định kỳ: người dùng thêm/sửa lịch ở app desktop, VM phải thấy mà không cần khởi
  // động lại. 5 phút — đủ nhanh để không khó chịu, đủ thưa để không đập vào máy chủ.
  setInterval(() => {
    void runner
      .pullRules()
      .then((n) => log('info', `làm mới lịch: ${n} (${runner.enabledCount()} đang bật)`))
      .catch((e) => log('warn', `không làm mới được lịch: ${(e as Error)?.message}`));
  }, 300_000);

  const bye = (sig: string) => {
    log('info', `nhận ${sig} — dừng.`);
    runner.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => bye('SIGINT'));
  process.on('SIGTERM', () => bye('SIGTERM'));
}

// MODE=hosted ⇒ Larkwave chạy hộ nhiều người; mặc định ⇒ VM riêng của một người.
void (process.env.MODE?.trim() === 'hosted' ? mainHosted() : main());
