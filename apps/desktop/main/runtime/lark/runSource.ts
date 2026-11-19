/**
 * Luật chọn NGUỒN CHẠY của Lark × Agents (hàm thuần — larkService.effectiveRunSource gom dữ kiện rồi gọi).
 *
 * Mục tiêu từ 0.1.24: người dùng TỰ CÀI AI ngay trong app (màn "Cài AI") và chạy trên máy của họ —
 * KHÔNG tự chuyển sang AI của máy chủ. Thứ tự:
 *   1. Người dùng đã tự chọn nguồn → giữ đúng lựa chọn đó (kể cả 'cli' khi CLI chưa cài: giao diện báo
 *      "Chưa cài …" kèm nút "Cài AI").
 *   2. Bật "API trực tiếp" (cờ cũ apiMode) → 'api'.
 *   3. Trình CLI đang chọn đã sẵn sàng (Claude/Gemini… của chính họ) → 'cli'.
 *   4. Chưa có CLI nhưng đã cài AI miễn phí trên máy (Ollama + ít nhất một mô hình) → 'local'.
 *   5. Còn lại → 'cli' (giao diện hướng dẫn mở "Cài AI").
 * 'maic' (Gói Larkwave, AI trên máy chủ) chỉ chạy khi người dùng TỰ chọn.
 */
import type { LarkRunSource } from '@larkwave/core';

export type RunSource = LarkRunSource;

export interface RunSourceFacts {
  /** Lựa chọn đã lưu của người dùng (vắng = chưa từng chọn). */
  chosen?: RunSource;
  /** Cờ cũ "API trực tiếp". */
  apiMode?: boolean;
  /** Trình CLI đang chọn đã cài + đăng nhập. */
  runnerReady: boolean;
  /** AI trên máy (Ollama) đang chạy và đã có ít nhất một mô hình. */
  localReady: boolean;
}

export function pickRunSource(f: RunSourceFacts): RunSource {
  if (f.chosen) return f.chosen;
  if (f.apiMode) return 'api';
  if (f.runnerReady) return 'cli';
  if (f.localReady) return 'local';
  return 'cli';
}
