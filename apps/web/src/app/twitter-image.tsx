/**
 * Ảnh cho thẻ Twitter/X. Dùng LẠI đúng ảnh Open Graph — trước đây /twitter-image trả 404, nên
 * thẻ `twitter:image` trỏ vào một địa chỉ không tồn tại.
 *
 * Không nhân bản mã: `next/og` yêu cầu mỗi route một tệp riêng, nên tệp này chỉ xuất lại
 * (re-export) trình sinh ảnh của Open Graph.
 */
export { default, alt, size, contentType } from "./opengraph-image";
