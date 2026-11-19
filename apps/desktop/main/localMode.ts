/**
 * CHẾ ĐỘ "DỮ LIỆU CHỈ TRÊN MÁY" (0.1.25) — dùng Larkwave không cần tài khoản Toolswave.
 *
 * Bật bằng nút "Dùng ngay — không cần tài khoản" ở màn đăng nhập, hoặc cưỡng bức cho bản tự dựng từ mã
 * nguồn mở bằng biến môi trường `LARKWAVE_LOCAL_ONLY=1`. Khi bật:
 *   • main KHÔNG đưa token tài khoản cho bất kỳ tính năng máy chủ nào (sao lưu/đồng bộ hội thoại, relay,
 *     chia sẻ, Gói Larkwave, nhịp máy chạy hộ) và chặn mọi lời gọi API tài khoản (`accountFetch`);
 *   • không bật điều khiển từ xa, không code-push (luôn dùng giao diện đóng gói, không hỏi manifest);
 *   • dữ liệu Lark nằm ở khoang `_local` của userData — không rời máy.
 * Cờ do MAIN giữ (tệp trong userData): giao diện code-push đổi origin nên localStorage không tin được.
 */
import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LocalModeState {
  on: boolean;
  /** Bật cưỡng bức bằng LARKWAVE_LOCAL_ONLY=1 (bản tự dựng) — giao diện không cho tắt. */
  forced: boolean;
}

let cached: boolean | null = null;

function file(): string {
  return join(app.getPath('userData'), 'local-mode.json');
}

export function localModeForced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LARKWAVE_LOCAL_ONLY === '1';
}

export function localModeOn(): boolean {
  if (localModeForced()) return true;
  if (cached !== null) return cached;
  try {
    cached = (JSON.parse(readFileSync(file(), 'utf8')) as { on?: boolean }).on === true;
  } catch {
    cached = false;
  }
  return cached;
}

export function setLocalMode(on: boolean): LocalModeState {
  if (!localModeForced()) {
    writeFileSync(file(), JSON.stringify({ on, at: new Date().toISOString() }, null, 2));
    cached = on;
  }
  return localModeState();
}

export function localModeState(): LocalModeState {
  return { on: localModeOn(), forced: localModeForced() };
}

/** Phản hồi `accountFetch` khi đang ở chế độ chỉ trên máy — cùng khuôn với lỗi mạng (status 0). */
export const LOCAL_MODE_BLOCKED = { ok: false, status: 0, localMode: true, text: JSON.stringify({ message: 'Đang dùng chế độ dữ liệu chỉ trên máy — không gọi máy chủ Larkwave.', code: 'LOCAL_MODE' }) };
