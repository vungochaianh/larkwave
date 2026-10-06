# tw-agent-host — máy chủ Trợ lý AI chia sẻ (Phương án A)

Cho phép **admin chia sẻ Trợ lý AI cho nhiều người dùng**, chạy **24/7 trên một VM** bằng **Claude CLI của admin** — người được cấp dùng **thoải mái**, **không tốn token của họ**, **không cần máy của họ bật**, và **không có gì chạy trên máy người dùng**.

## Nó hoạt động thế nào

1. Trong app desktop (đăng nhập bằng tài khoản **admin**): mở **Trợ lý AI → Chia sẻ** → mời từng người bạn/đồng nghiệp (có thể thu hồi từng người).
2. Người được cấp mở Trợ lý AI → chọn **"Trợ lý của <admin>"** → hỏi bình thường.
3. Server đưa câu hỏi vào hàng đợi. **Service này** (chạy trên VM) lấy câu hỏi ra, chạy bằng **`claude` của admin**, rồi trả kết quả về. Người dùng thấy câu trả lời như chat bình thường.

Không cần bật app desktop của admin — VM này là "máy chủ" luôn bật.

> **Lưu ý:** dùng **một** nơi phục vụ thôi. Nếu bạn vừa chạy service này **vừa** mở app desktop bằng
> tài khoản admin, cả hai cùng nhận một câu hỏi → chạy 2 lần (lãng phí). Đã có service 24/7 thì
> KHÔNG cần mở app desktop admin để phục vụ.
>
> **Bảo mật:** `.env` chứa đăng nhập admin → đặt quyền `chmod 600`, và VM phải do bạn kiểm soát
> (ai vào được VM là truy cập được tài khoản admin). Service đã hardening bằng systemd + Claude chạy
> read-only, nhưng token admin vẫn là "chìa khoá" — giữ VM sạch, không cài thứ lạ.

## An toàn (quan trọng)

Mỗi câu hỏi chạy ở chế độ **CHỈ hỏi–đáp + tra web** (WebSearch). Trợ lý **KHÔNG** đọc tệp, **KHÔNG** chạy lệnh, **KHÔNG** ghi file, **KHÔNG** tải URL nội bộ — nên người được cấp **không** chạm được vào VM hay chính tài khoản Claude của admin. (Cùng bộ khoá đã qua rà soát bảo mật của bản desktop.)

> Nếu sau này bạn muốn cho phép chạy **lệnh/đọc-ghi file thật** (Phương án B), phải chạy trên **VM sandbox riêng mỗi phiên** — KHÔNG dùng service này với cờ nới lỏng.

## Cài đặt trên VM

Yêu cầu: Node ≥ 18, và **Claude CLI đã đăng nhập bằng tài khoản admin** (`claude` chạy được, `claude --version` OK) dưới đúng user sẽ chạy service.

```bash
sudo useradd -m twagent            # user chạy service (nếu chưa có)
sudo -u twagent claude             # đăng nhập Claude CLI bằng tài khoản admin cho user này
sudo mkdir -p /opt/tw-agent-host
sudo cp -r src package.json /opt/tw-agent-host/
sudo cp .env.example /opt/tw-agent-host/.env
sudo nano /opt/tw-agent-host/.env  # điền TW_ADMIN_EMAIL/PASSWORD (hoặc TW_ADMIN_TOKEN) + CLAUDE_BIN
sudo chown -R twagent:twagent /opt/tw-agent-host

sudo cp systemd/tw-agent-host.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tw-agent-host
sudo journalctl -u tw-agent-host -f    # xem log
```

## Cấu hình (`.env`)

Xem `.env.example`. Bắt buộc: cách đăng nhập admin (`TW_ADMIN_TOKEN` **hoặc** `TW_ADMIN_EMAIL`+`TW_ADMIN_PASSWORD`) và `CLAUDE_BIN` (thường là `claude`).

## Kiểm thử nhanh (không cần VM)

```bash
cd tw-agent-host
cp .env.example .env && nano .env     # điền admin + claude
npm start
```
Rồi từ một tài khoản khác đã được admin cấp quyền, hỏi trong "Trợ lý của <admin>" — log sẽ hiện `turn … ok`.
