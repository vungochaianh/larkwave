---
name: ban-giao
description: Bàn giao giữa máy Mac và máy Windows. Dùng ở ĐẦU mỗi phiên làm việc trên repo này, và TRƯỚC khi nghỉ/chuyển máy. Cũng dùng khi được hỏi "máy nào đang giữ bản mới", "chuyển sang máy kia", "push/pull chưa", hoặc khi sắp phát hành desktop.
---

# Bàn giao giữa hai máy

Dự án này làm trên **hai máy thay phiên**: một Mac và một Windows. Chúng nối nhau qua `git`, và
mỗi máy làm được một việc mà máy kia **không** làm được.

| | Mac | Windows |
|---|---|---|
| đóng gói `.dmg` (macOS) | ✓ | ✗ cần `codesign`/`hdiutil`/`lipo` |
| đóng gói bản cài Windows | ✗ Wine tắc trên Apple Silicon | ✓ |
| deploy máy chủ, đẩy renderer, chạy kiểm | ✓ | ✓ (trong WSL2) |

## Luật số một

**Đừng nhớ, hãy đo.** Mở đầu phiên, chạy:

```bash
node scripts/handoff.mjs
```

Nó đo bốn thứ: máy này là máy nào, git lệch bao nhiêu so với `origin`, phiên bản desktop ở ba nơi
(máy này / origin / bản đang phát hành), và bản cài của nền tảng nào đang tụt lại. Rồi in ra việc
cần làm theo đúng thứ tự.

Lý do có luật này rất cụ thể: đã từng có lúc `origin` đứng ở desktop 1.0.289 trong khi máy Mac đã
ở 1.0.309, và **bản cài Windows kẹt ở 1.0.289 suốt nhiều ngày** vì không ai đo. Người ta tưởng
thiếu khoá, thiếu quyền, thiếu cấu hình — thật ra chỉ là mã chưa rời khỏi máy kia.

## Mở đầu phiên

1. `node scripts/handoff.mjs`
2. Làm đúng danh sách nó in ra, **theo thứ tự**. Nếu lệch cả hai chiều thì `pull` TRƯỚC rồi mới
   `push` — đẩy đè lên là xoá mất công của máy kia.
3. Báo lại cho người dùng bằng một câu: máy này là máy nào, còn lệch gì, và việc nào **chỉ máy
   này** làm được.

## Kết thúc phiên / chuyển máy

1. Commit hết. Thay đổi chưa commit **không sang được máy kia** — chúng ở lại đây.
2. `git push origin main`.
3. Chạy lại `node scripts/handoff.mjs` để xác nhận đã khớp.
4. Nói rõ cho người dùng **việc còn lại thuộc về máy nào**, ví dụ: "phần còn thiếu là bản cài
   Windows, máy này không dựng được, để máy Windows làm."

## Đừng làm

- **Đừng đoán máy kia đang ở đâu.** `handoff.mjs` đọc `origin` và manifest đang phát hành — đó là
  sự thật, còn trí nhớ thì không.
- **Đừng dựng/phát hành khi đang chậm hơn `origin`.** Sản phẩm ra sẽ thiếu công việc của máy kia,
  và không có gì báo cho biết.
- **Đừng thêm `--main-change`** khi một nền tảng chỉ đang bắt kịp phiên bản đã phát hành: cờ đó đẩy
  `latestVersion` lên và người dùng nền tảng kia bị nhắc cài lại đúng bản họ đang chạy.
- **Đừng quên dựng `@larkwave/core` trước khi đóng gói desktop.** Bản dựng gói `core` từ `dist/`
  chứ không từ `src/` và không tự dựng lại. Core cũ ⇒ một kênh IPC thành `undefined` ⇒ màn hình
  trắng khi mở app, và lúc dựng KHÔNG có lỗi nào báo.

## Đọc thêm

- `docs/may-phat-hanh-windows.md` — dựng máy Windows (một lần) và phát hành bản Windows bằng token hẹp
