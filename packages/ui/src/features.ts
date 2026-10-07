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
