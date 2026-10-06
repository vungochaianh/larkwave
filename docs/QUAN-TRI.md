# Tài liệu quản trị Toolswave (CMS)

## 1. Truy cập
- **URL:** https://aapp.toolswave.net (hoặc https://app.toolswave.net/admin)
- **Đăng nhập:** tài khoản có vai trò **admin** (vd `deveris.vu@gmail.com`). Tài khoản thường sẽ bị chặn (403).
- Cùng hệ thống đăng nhập với app chính; chỉ khác host `aapp.` tự chuyển vào khu `/admin`.

## 2. Các trang & cách quản lý

| Trang | Đường dẫn | Làm được gì |
|---|---|---|
| **Dashboard** | `/admin` | Tổng quan: số người dùng, apps, builds, deployments đang live + 8 build gần nhất. |
| **Người dùng** | `/admin/users` | Danh sách user (email, tên, vai trò, trạng thái, số app, ngày tạo). **Tạo / sửa (tên, vai trò, trạng thái, đặt lại mật khẩu) / xoá**. Không xoá được admin cuối cùng. |
| **Apps** | `/admin/apps` | Mọi app của mọi user (tên, slug, chủ sở hữu, loại, trạng thái, link live). Tìm kiếm + xoá. |
| **Builds** | `/admin/builds` | Lịch sử build (prompt, trạng thái, loại, ngày). Lọc theo trạng thái. Mở chi tiết xem log + file. |
| **Deployments** | `/admin/deployments` | Bản deploy (URL, project, trạng thái live/superseded/failed). |
| **Cấu hình** | `/admin/settings` | Sửa **5 prompt** (classify, spec, codegen, fix, guide) + **giới hạn vận hành** (số lần sửa lỗi tối đa, cost limit, số job đồng thời…). Áp dụng ngay, không cần deploy. |
| **Báo cáo** | `/admin/reports` | Doanh thu · **chi phí Claude API đã nạp** (tách Opus/Sonnet) · **lợi nhuận + biên** · builds theo model · doanh thu/người dùng theo gói · biểu đồ theo thời gian (Hôm nay/7/30 ngày/Tất cả). |
| **🛡️ Kiểm duyệt App** | `/admin/moderation` | Rà soát mọi app: tab *Tất cả / Cần xem xét (cờ vi phạm) / Đang tạm ngưng*. **Xem** = preview iframe nội dung + chủ sở hữu. **Tạm ngưng** (nhập lý do → app offline ngay) · **Khôi phục** · **Gỡ vĩnh viễn**. Cờ vi phạm tự động theo từ khoá cấm (sửa danh sách trong Cấu hình). Mọi thao tác ghi Nhật ký. |
| **🤖 Quản lý AI** | `/admin/ai` | Chi phí/usage theo model (Opus/Sonnet, token + USD) · **sửa credit mỗi model** · prompt AI · giới hạn vận hành — gộp 1 nơi. |
| **💲 Gói & Giá** | `/admin/billing` | Sửa **giá / credits / số app live mỗi gói** + **chi phí credit theo model** + **tỷ giá VND/USD** — runtime, áp dụng ngay, không cần deploy. |
| **💳 Thanh toán** | (user) `/billing` | Lịch sử giao dịch + usage credit. Đối soát tự động qua SePay. |
| **Nhật ký** | `/admin/audit` | Mọi hành động (user, build, thanh toán, kiểm duyệt, đổi cấu hình) — ai làm, lúc nào, mục tiêu, lý do. |

## 3. Dữ liệu được lưu (phục vụ báo cáo)
- **Mỗi build** lưu `usage` = số token vào/ra + **USD thực** (tính theo đúng model Opus/Sonnet) → dùng tính "đã nạp vào Claude API".
- **Mỗi thanh toán** lưu số tiền (VND) + trạng thái (pending/paid) + gói + thời điểm trả.
- **Credit/hạn mức:** mỗi user có `plan`, `quotaUsed` (credit đã dùng trong tháng), reset đầu tháng. Admin không giới hạn.
- **Nhật ký** ghi mọi thao tác quan trọng.

## 4. Quy trình thanh toán (SePay) — tự động
1. User chọn gói → hệ thống sinh **mã `TWxxxxxx`** + QR VietQR (TK VietinBank `999901101666` · VU NGOC HAI ANH).
2. User chuyển khoản đúng **nội dung + số tiền**.
3. SePay bắn webhook → khớp mã + số tiền → **tự kích hoạt gói + reset credit** + ghi lịch sử.
4. Xem ở trang **Thanh toán** (user) / **Báo cáo** (admin).

## 5. Đổi cấu hình linh hoạt (không cần lập trình lại)
- **Prompt + giới hạn:** `/admin/settings`.
- **Giá gói / credits / model cost / tỷ giá:** `/admin/billing` *(đang thêm)* — đổi là áp dụng ngay cho hạn mức, giá hiển thị `/pricing` và phép tính lợi nhuận.
