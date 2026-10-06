# MAIC — hạn mức theo từng người dùng Toolswave

Toolswave là **đại lý** của MAIC: ta bán gói cho người dùng của mình, MAIC chạy
máy phía sau. Tài liệu này mô tả phần nối giữa hai bên.

Hợp đồng API đầy đủ nằm ở `maic-workspace/prompt-tich-hop.md`, mục *"Lớp đại lý"*.

---

## Vấn đề trước đây

Cả Toolswave đi qua **một token MAIC dùng chung** (`MAIC_TOKEN`, không bao giờ
rời `apps/api`). Với MAIC, toàn bộ lưu lượng của ta là một khối: không quy được
ai tiêu bao nhiêu, và không chặn được ai.

Hạn mức per-user chỉ tồn tại trong cơ sở dữ liệu của ta (`User.quotaUsed` +
`assertMaicAllowed`). Nghĩa là nó biến mất ngay khi một đường code quên gọi hàm
kiểm tra — và không có gì ở phía sau đỡ lại.

## Giờ thì

MAIC biết từng người dùng Toolswave, quy chi phí về đúng họ, và **tự chặn** khi
họ cạn trần. Đây là hàng rào thứ hai, nằm ở phía tin được.

**Người dùng cuối vẫn KHÔNG có token MAIC riêng.** Ta gọi bằng token của chính
mình rồi khai `endUser` là ai. Bí mật không rời máy chủ — đúng kiến trúc cũ.

---

## Các mảnh

| Tệp | Việc |
|---|---|
| `apps/api/src/maic/maic.service.ts` | Thêm `endUser` vào `MaicAskInput`/`MaicRunInput`; dịch lỗi từ chối của MAIC sang hợp đồng lỗi của ta |
| `apps/api/src/maic/maic-admin.service.ts` | Client cho `/v1/end-users`: đồng bộ trần, khoá/mở, mở chu kỳ, đọc sổ |
| `apps/api/src/maic/maic-admin.controller.ts` | `GET/POST /v1/admin/maic/*` cho màn quản trị |
| `apps/web/src/app/admin/maic/page.tsx` | Màn *MAIC — hạn mức*: ai tiêu bao nhiêu, khoá/mở, xem sổ |

### Quy chi phí về ai

18/20 chỗ gọi MAIC giờ khai `endUser`. Bốn chỗ còn lại cố ý không khai vì không
có người dùng nào để quy về:

- `assistant.service.ts` — chatbot marketing công khai, vốn không tính phí
- `feedback.service.ts` `findSimilar` — lời gọi hệ thống
- `skills.service.ts` `draft` — không có người dùng trong phạm vi
- `suggestions.service.ts` khi cron chạy (`actor` rỗng)

### Trần được đẩy sang MAIC khi nào

- **Đổi gói** — thanh toán SePay, admin tặng gói, hoặc người dùng tự đổi
- **Lần đầu tiến trình gặp một tài khoản** (`assertMaicAllowed`) — để mọi tài
  khoản có từ trước cũng được vũ trang, không chỉ ai vừa đổi gói
- **Bấm tay** ở màn quản trị: từng người, hoặc "Đồng bộ tất cả" sau khi đổi danh
  mục gói

Trần bên MAIC tính bằng USD, trần bên ta tính bằng token. Quy đổi bằng đúng
`MAIC_USD_PER_MTOK` mà `meterMaic` dùng theo chiều ngược lại, để hai con số mô tả
cùng một hạn mức thay vì trôi xa nhau.

### Chu kỳ

Cửa sổ hạn mức bên ta xoay vòng → gọi `reset-usage` sang MAIC ngay trong
`meterMaic`. MAIC **không tự xoay theo tháng**, để hai bên không bao giờ lệch mốc.

Lượt chạy cũ không bị xoá, chỉ thôi được tính vào trần — sổ sách vẫn đối chiếu
được ở màn quản trị.

### Người dùng thấy gì khi cạn trần

MAIC trả `402 end_user_quota_exceeded`. `maic.service.ts` dịch thành
`HttpException 402 { code: 'QUOTA_EXCEEDED' }` — đúng dạng lỗi mà giao diện đã
biết xử lý từ trước, nên **cả web và desktop** tự động dẫn người dùng sang trang
giá, không cần sửa gì thêm ở hai chỗ ấy.

Tương tự: `end_user_blocked` → 403 `ACCOUNT_BLOCKED`,
`end_user_too_many_runs` → 429 `TOO_MANY_RUNS`.

---

## Vận hành

Token `toolswave-codegen` **đã được nâng vai trò đại lý** bên MAIC (03/09/2026).
Nếu sau này phát token mới thì phải nâng lại: màn quản trị MAIC → Token → *Nâng
thành đại lý*.

Chưa nâng thì mọi thứ vẫn chạy bình thường, chỉ là `endUser` bị MAIC từ chối và
`MaicAdminService` ghi log cảnh báo — sản phẩm không hỏng, chỉ mất phần quy trách
nhiệm. Đó là lựa chọn có chủ ý: sổ sách không đáng để làm hỏng một lượt phục vụ
người dùng.

Màn quản trị: **Cấu hình → MAIC — hạn mức**.
