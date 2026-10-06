/**
 * Ký tự đầu của một chuỗi, tính theo ĐIỂM MÃ — không phải theo đơn vị mã UTF-16.
 *
 * Vì sao không dùng `charAt(0)`. JavaScript lưu chuỗi bằng UTF-16, nên mọi emoji ngoài mặt phẳng
 * cơ bản (🚀 🌿 🍅 …) chiếm HAI đơn vị mã. `charAt(0)` cắt đúng một nửa và trả về một nửa cặp
 * thay thế (lone surrogate) — một ký tự không hợp lệ đứng một mình.
 *
 * Hậu quả không chỉ là "hiện dấu hỏi". Đó là một lỗi hydrate: máy chủ serialize nửa ký tự đó vào
 * HTML, trình duyệt phân tích cú pháp thì thay bằng U+FFFD, còn React lúc hydrate lại dựng đúng
 * nửa ký tự ban đầu — hai bên khác nhau nên React vứt cả nhánh cây và dựng lại từ đầu ở client.
 * Đo ngày 23/09/2026 trên /store và /store/sourcecode: `Minified React error #418`, đúng những
 * trang có món tên bắt đầu bằng emoji (🚀 WaitlistKit, 🌿 GardenLog, 🍅 StudyRoom).
 *
 * `Array.from` duyệt theo điểm mã nên lấy trọn emoji. `toUpperCase()` với emoji là phép đồng nhất,
 * không cần tách trường hợp.
 */
export function chuDau(s: string | null | undefined): string {
  const first = Array.from((s ?? "").trim())[0] ?? "";
  return first.toUpperCase();
}
