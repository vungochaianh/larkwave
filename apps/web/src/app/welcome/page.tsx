/**
 * Route này KHÔNG bao giờ chạy tới: `next.config.ts` chuyển `/welcome` → `/` bằng 308 ở tầng
 * định tuyến, trước cả khi React được gọi.
 *
 * Vậy vì sao vẫn giữ file? Deploy dùng rsync KHÔNG có `--delete` — xoá ở đây thì bản CŨ (770 dòng
 * trang landing) vẫn nằm trên máy chủ và tiếp tục được dựng. Ghi đè bằng một tệp vô hại là cách
 * duy nhất để thứ trên máy chủ thật sự biến mất.
 */
export default function WelcomeMoved() {
  return null;
}
