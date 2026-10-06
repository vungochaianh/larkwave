# Marketing sẽ chuyển sang Social Wave — ghi chú phía Toolswave

Tài liệu bàn giao đầy đủ nằm ở **dự án nhận**, không phải ở đây:

    Fbinbox_Workspace/fbinbox-sender/docs/ban-giao-marketing.md

Để ở đó vì người THỰC HIỆN việc chuyển ngồi bên ấy. Tệp này chỉ để người đọc mã Toolswave biết
chuyện gì đang xảy ra với thư mục `marketing/`.

## Thứ sẽ rời đi

| đường dẫn | số dòng | ghi chú |
|---|---|---|
| `packages/ui/src/account/marketing/` + `account/marketingApi.ts` | 1.757 | bản được chép đi (bản desktop) |
| `apps/web/src/app/marketing/` | 1.548 | bản gốc cho web |
| `apps/api/src/marketing/` + 2 service liên quan | 894 | **Ở LẠI** — dùng chung CSDL tài khoản |

## Việc chưa chốt, và nó chặn mọi thứ khác

**Sau khi chuyển, Toolswave còn giữ Marketing không?**

- Còn → một tính năng tồn tại ở bốn bản sao (web, packages/ui, Social Wave, bản gốc). Sửa một lỗi
  phải sửa bốn chỗ, và chúng sẽ trôi khác nhau.
- Gỡ → sạch, nhưng người dùng Toolswave mất tính năng.

Chưa ai trả lời. **Đừng chép mã khi chưa có câu trả lời** — nếu câu trả lời là "gỡ" thì việc đúng
là DI CHUYỂN, không phải nhân bản; mà nhân bản rồi gỡ sau thì thường không bao giờ gỡ.

Xem phần 3 của tài liệu bàn giao để biết đủ ba câu hỏi phải chốt.
