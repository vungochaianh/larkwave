import Splash from "@/components/Splash";

/**
 * Vỏ chờ khi chuyển trang trong khu làm việc.
 *
 * TRƯỚC ĐÂY tệp này nằm ở GỐC `app/`, và đó là một lỗi kín: một `loading.tsx` ở gốc bọc TOÀN BỘ
 * site trong một ranh giới Suspense, nên Next phát vỏ chờ ra trước — kèm mã 200 — rồi mới dựng
 * nội dung. Mã trạng thái đã gửi đi thì không rút lại được, nên `notFound()` chạy sau đó chỉ đổi
 * được phần nhìn: trang hiện "không tìm thấy" nhưng máy tìm kiếm nhận HTTP 200.
 *
 * Đo ngày 23/09/2026: `/blog/<slug-bịa-đặt>` trả 200. Tức là mọi URL sai trên site đều là một
 * trang hợp lệ dưới mắt Google — số lượng vô hạn, nội dung trùng nhau.
 *
 * Để ở đây thì khu làm việc vẫn có vỏ chờ (nơi chuyển trang thật sự chậm), còn trang công khai
 * trả đúng mã trạng thái.
 */
export default function Loading() {
  return <Splash />;
}
