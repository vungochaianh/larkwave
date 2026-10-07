import { redirect } from "next/navigation";

/**
 * Không còn trang "Gói & Thanh toán" riêng trong app (07/10/2026): gói hiện tại, hạn mức và nâng
 * cấp đều nằm trong Hồ sơ. Bảng giá công khai vẫn ở /pricing.
 *
 * Để lại file chuyển hướng (không xoá) để liên kết cũ không thành 404, và để deploy bằng rsync
 * không --delete ghi đè bản cũ trên máy chủ.
 */
export default function BillingRedirect() {
  redirect("/profile#plan");
}
