/**
 * Cờ bật/tắt tính năng — MỘT chỗ cho cả desktop (packages/ui) lẫn web (apps/web import
 * `@larkwave/ui/features`). File này cố ý KHÔNG import gì, để trang phía máy chủ của Next cũng
 * đọc được mà không kéo antd/React theo.
 */

/**
 * Bạn bè (kết bạn, nhắn tin 1-1, chia sẻ kết nối Lark / Trợ lý AI cho bạn bè).
 *
 * 07/10/2026: Larkwave tạm chạy như app MỘT người dùng — chỉ ẨN GIAO DIỆN, giữ nguyên toàn bộ
 * logic, API và DB để test lại sau. Chia sẻ vẫn đi bằng liên kết công khai (/lark/s/[id]).
 * Bật lại: đổi thành `true` — mọi lối vào (thanh bên, Tổng quan, Hồ sơ, Messenger, chia sẻ Lark
 * cho bạn bè, trang /friends) đều đọc cờ này.
 */
export const FEATURE_FRIENDS: boolean = false;

/**
 * "Để Larkwave chạy lịch hộ" (PUT/DELETE /me/lark-hosted).
 *
 * 10/2026: Larkwave dùng chung API + tài khoản với Toolswave. Máy chủ chỉ có MỘT cấu hình chạy hộ
 * cho mỗi tài khoản (và nó chạy lịch đọc từ bản sao lưu Lark của app Toolswave — Larkwave không
 * còn đẩy bản sao lưu lên). Bật/tắt từ Larkwave là ghi đè App ID/Secret mà app Toolswave đang dùng.
 * Nên: chỉ HIỆN trạng thái, bật/tắt làm trong app Toolswave. Bật lại khi máy chủ có ô sao lưu
 * riêng cho Larkwave (`?slot=larkwave`) — xem docs/migrate-from-toolswave.md.
 */
export const FEATURE_HOSTED_RUNNER_WRITE: boolean = false;
