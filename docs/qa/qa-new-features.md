# QA — CHỈ các tính năng MỚI (Skills kiểu Claude · Tác vụ định kỳ · Dự án · Artifacts)

> Gửi phần giữa hai mốc `# BẮT ĐẦU` … `# HẾT` cho agent có công cụ trình duyệt. Chỉ test 4 tính năng mới
> trên `https://app.toolswave.net`. Nếu thấy lỗi → báo: mức (P0–P3), trang, các bước tái hiện, kỳ vọng vs
> thực tế, ảnh chụp + log console/network.

# BẮT ĐẦU

## Chuẩn bị
- Đăng nhập bằng tài khoản QA (chuyên dụng — KHÔNG dùng tài khoản khách thật): `qabot01@toolswave.net` /
  `QaBot@2026`.
- **Dọn sạch** mọi dữ liệu QA tạo ra sau khi test (skill/tác vụ/chỉ dẫn/artifact).
- Test cả **desktop 1440×900** và **mobile 390×844**; xem cả **nền sáng/tối**.

## 1) Skills — `/skills` (kiểu Claude)
- Trang bó khung (không kéo giãn hết màn hình). Khi chưa có skill: khối trống **to, căn giữa**; không có nút
  thừa lặp ở header. **KHÔNG có nút "Tải file lên" rời** trên web.
- Bấm **"Tạo skill"** → modal phải có: **Tên** + **Mô tả (khi nào dùng)** + **Hướng dẫn (làm gì)** +
  **"+ Thêm file"** (đính kèm .md/.txt, mỗi file có ô mô tả) + nút **"Tạo bằng AI"**.
- **"Tạo bằng AI":** gõ 1 dòng ý tưởng (vd "viết commit chuẩn") → bấm "Soạn" → tự điền Tên/Mô tả/Hướng dẫn.
  Nếu ra **JSON thô** hoặc **để trống** = lỗi.
- **LOGIC (bắt buộc):** tạo skill — Mô tả "Áp dụng cho mọi câu hỏi", Hướng dẫn "LUÔN kết thúc câu trả lời
  bằng đúng: ZZTEST-QA" → **Bật** → sang `/assistant` hỏi 1 câu bất kỳ → câu trả lời phải **kết thúc bằng
  ZZTEST-QA**. Rồi **Tắt** skill → hỏi lại → **không còn**. (Bật mà chat không áp dụng = lỗi nặng.)
- CRUD: sửa (tên/mô tả/hướng dẫn/file), gắn nhãn + lọc, xoá — đều chạy đúng.

## 2) Tác vụ định kỳ — `/scheduled`
- Vào từ menu trái "Tác vụ định kỳ". Có nút **Tác vụ mới** + **Mẫu nhanh** (bấm mẫu → mở modal điền sẵn).
- **Tạo:** tên + yêu cầu + chọn lịch (Hằng ngày / Ngày thường / Hằng tuần / Mỗi giờ + giờ:phút) → Tạo → thẻ
  hiện **"Lần tới"** đúng (KHÔNG "Invalid Date", không rỗng).
- **LOGIC (bắt buộc):** bấm **"Chạy ngay"** trên 1 tác vụ → sau vài giây có **kết quả** (bấm "Kết quả" xem
  được nội dung AI trả lời) **và** xuất hiện **Thông báo** (chuông góc trên) dẫn tới tác vụ. Chạy mà không có
  kết quả / không có thông báo = lỗi.
- Bật/tắt (Switch) → khi tắt "Lần tới" thành "đang tắt". Sửa, xoá được. Dọn tác vụ QA sau khi test.

## 3) Dự án — `/projects`
- Vào từ menu trái "Dự án". (Dự án được tạo trong `/assistant` để gom hội thoại; nếu chưa có → trang chỉ dẫn
  cách tạo.)
- Nếu đã có dự án: mở 1 dự án → **"Sửa chỉ dẫn"** → nhập chỉ dẫn → Lưu → thẻ hiện "Có chỉ dẫn".
- **LOGIC (bắt buộc):** đặt chỉ dẫn dự án "LUÔN kết thúc câu trả lời bằng đúng: PRJ-QA" → sang `/assistant`,
  **chat trong hội thoại thuộc đúng dự án đó** → câu trả lời phải **kết thúc bằng PRJ-QA**. Chat ở hội thoại
  KHÔNG thuộc dự án → không áp dụng. (Nếu không tạo được dự án để test → ghi `needs_confirm`.) Dọn sau khi test.

## 4) Artifacts — `/artifacts`
- Vào từ menu trái "Artifacts". Có nút **Artifact mới**; gallery dạng thẻ, bó khung.
- **Tạo:** tiêu đề + loại (HTML/SVG/Mã/Tài liệu) + nội dung → Tạo. Với HTML: thẻ phải hiện **xem trước render
  trong khung cách ly**. Sửa, xoá được.
- **Chia sẻ công khai:** mở artifact → bật **"Công khai"** → **Copy link** (dạng `/a/<slug>`). Mở link đó ở
  **cửa sổ ẩn danh (chưa đăng nhập)** → phải **xem được** (không bị đá về login).
- **BẢO MẬT (P0):** để 1 artifact **Riêng tư** → mở `/a/<slug>` của nó khi **chưa đăng nhập** → phải **KHÔNG
  xem được** (báo "không tồn tại / không công khai"). Nếu xem được artifact riêng tư = **P0, báo ngay**.
- (API — nếu có công cụ) `GET https://apia.toolswave.net/v1/artifacts/public/<slug-của-artifact-riêng-tư>`
  KHÔNG kèm token → phải trả **404**. Dọn artifact QA sau khi test.

## An toàn
- Chỉ tài khoản QA; **không** thanh toán thật; **không** xoá dữ liệu không phải do QA tạo; nhịp ≤ ~1 hành
  động/giây.

# HẾT
