import { redirect } from "next/navigation";

/**
 * "Báo lỗi của tôi" đã bỏ cùng chương trình thưởng báo lỗi (07/10/2026). Người gửi xem báo cáo
 * của mình + phản hồi của admin ở /support.
 *
 * Cố ý để lại file chuyển hướng thay vì xoá hẳn: (1) dấu trang / thông báo cũ trỏ /reports không
 * thành 404; (2) deploy bằng rsync không --delete — xoá file thì bản cũ (đọc các trường thưởng đã
 * gỡ khỏi @larkwave/shared) nằm lại trên máy chủ và làm gãy `next build`.
 */
export default function ReportsRedirect() {
  redirect("/support");
}
