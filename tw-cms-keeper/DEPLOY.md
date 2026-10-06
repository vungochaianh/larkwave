# tw-cms-keeper — nơi nó thực sự chạy

## Cảnh báo trước tiên: repo ≠ server

Dịch vụ này **KHÔNG chạy từ thư mục mà `deploy/ci-deploy.sh` đồng bộ tới.**

| | |
|---|---|
| Chạy tại | `/opt/tw-cms-keeper` trên máy chủ (systemd: `tw-cms-keeper.service`) |
| ci-deploy rsync tới | `/home/app/toolswave/` — **không đụng tới `/opt`** |

Hệ quả: sửa file trong repo rồi chạy `ci-deploy.sh` thì **thay đổi KHÔNG bao giờ tới được
keeper**. Ngày 2026-09-04 đã mất công vì đúng chuyện này — vá bảo mật trong repo, deploy 5 lần,
mà bản đang chạy vẫn nguyên si.

Muốn cập nhật keeper thì phải copy tay rồi restart:

```bash
scp tw-cms-keeper/src/<file> root@<host>:/opt/tw-cms-keeper/src/<file>
ssh root@<host> 'systemctl restart tw-cms-keeper'
```

Nhớ sao lưu trước (`cp -r /opt/tw-cms-keeper/src /root/tw-cms-keeper-src.bak-$(date +%s)`).

## Hai phiên bản đang tồn tại song song

Tính đến 2026-09-04:

- **Server chạy bản CŨ, single-account** — `config.js` 78 dòng, `httpServer.js` 88, `keeper.js` 172.
- **Repo có bản MỚI, multi-account** — 161 / 147 / 226 dòng. Lệch 95–119 dòng mỗi file.

Bản multi-account **chưa từng được deploy và hiện KHÔNG được dùng**: server không set biến
`ACCOUNTS`, và không có dòng code nào trong `apps/` hay `packages/` gọi các endpoint riêng của nó
(`/status/<id>`, `/qr/<id>`, `?acct=`). Desktop chỉ đọc trạng thái keeper gián tiếp qua backend CMS
(`/bitable-sync/keeper-status`, xem `apps/desktop/main/runtime/lark/cmsSyncService.ts`) — keeper
*đẩy* heartbeat lên, chứ app không gọi vào keeper.

**Đừng copy cả cụm file từ repo lên server** để "cho đồng bộ". Làm thế là âm thầm đổi kiến trúc
của một dịch vụ đang giữ phiên Lark sống 24/7; nếu cấu hình không khớp, phiên rớt và phải quét lại
QR bằng điện thoại. Cần vá gì thì port riêng phần đó vào bản đang chạy (đó là cách bản vá token
2026-09-04 được áp dụng).

## `.http-token` là credential

Sinh tự động ở lần chạy đầu, lưu tại gốc thư mục keeper, quyền `600`. Nó mở được `/qr` — trang
hiển thị **mã QR đăng nhập Lark còn sống**; ai quét được mã đó là đăng nhập với tư cách tài khoản
này. Vì vậy:

- Đã nằm trong `.gitignore` — **không bao giờ commit**.
- Link trong cảnh báo (`state.reloginUrl`) có kèm `?k=<token>` → **đối xử với link đó như mật khẩu**.
- Đặt `KEEPER_HTTP_TOKEN` trong `.env` nếu muốn cố định thay vì để tự sinh.

Server bind `0.0.0.0:8790` để quét QR được từ điện thoại. Cổng này **không** nằm trong ingress của
Cloudflare Tunnel, và firewall (`deploy/firewall.sh`) không mở nó — nên chỉ vào được qua Tailscale.
