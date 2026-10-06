# tw-cms-keeper

> ⚠️ **Trước khi sửa bất cứ thứ gì: đọc [DEPLOY.md](./DEPLOY.md).**
> Dịch vụ này chạy từ `/opt/tw-cms-keeper` trên máy chủ — **`ci-deploy.sh` KHÔNG đụng tới nó**, nên
> sửa trong repo rồi deploy thì thay đổi không bao giờ tới nơi. Bản trên server cũng đang **cũ hơn
> và khác kiến trúc** so với repo (single-account vs multi-account). Đừng copy cả cụm file lên.

Giữ **phiên Lark web** sống 24/7 trên một VM Linux (hoặc Windows) để **Đồng bộ Bitable (CMS)** không bao giờ chết khi bạn tắt app desktop.

## Nó làm gì (và KHÔNG làm gì)

- Việc sync thật (đọc Bitable → ghi) **vẫn chạy trên backend `apihoanam`** (scheduler 5 phút). Service này **không** tự đồng bộ.
- Việc **duy nhất** service này làm: giữ một phiên Lark web đăng nhập, rồi **đẩy session tươi** (`cookies` + `csrfToken`) vào **mọi job connector** trên CMS theo lịch — và **bật lại** những job mà backend đã tự tắt do session hết hạn (larkCode 99991668/99991663).
- Đây chính là phần mà app desktop đang gánh (`larkWebSession.ts` + `cmsSyncService.refreshAll`). Service này tách nó ra chạy độc lập, không cần Mac.

```
[Chromium headless: phiên Lark] --(cookies+csrf mỗi 30')--> apihoanam /bitable-sync/:id
                                                             (scheduler tự sync như cũ)
```

## Yêu cầu

- **Ubuntu 22.04 / 24.04 x64** (khuyến nghị — deps của Chromium có sẵn qua `apt`). CentOS/Fedora chạy được nhưng cài Chromium deps cực hơn.
- Node.js ≥ 20 (script tự cài).
- Ra Internet tới `*.larksuite.com` và `apihoanam.toolswave.net`.
- Backend CMS **không cần token** — chỉ cần đúng `LARK_HOST` (tenant của bạn).

## Cài đặt (Ubuntu)

```bash
# copy thư mục tw-cms-keeper/ lên VM, rồi:
cd tw-cms-keeper
sudo bash scripts/install-ubuntu.sh      # Node 20 + npm install + Chromium + deps

cp .env.example .env
nano .env                                 # sửa LARK_HOST cho đúng tenant (xem URL Bitable của bạn)
```

`LARK_HOST` = phần host trong URL Bitable của bạn, ví dụ URL `https://lsgav2gopb4m.sg.larksuite.com/base/Abc...` → `LARK_HOST=https://lsgav2gopb4m.sg.larksuite.com`.

## Đăng nhập Lark lần đầu (chọn 1 cách)

Session được lưu vào `PROFILE_DIR` (mặc định `./.profile`) và **tồn tại qua các lần khởi động lại** — chỉ cần làm 1 lần.

**Cách 0 — kế thừa session từ backend (TIỆN NHẤT, 1 lệnh):**
Nếu app desktop của bạn đang/đã từng chạy và đẩy session lên CMS, keeper lấy luôn session đó — khỏi login, khỏi DevTools:
```bash
node src/index.js seed-from-backend
```
Nó tự lấy cookie + host từ job trên apihoanam, nạp vào profile, và báo `LARK_HOST` cần đặt (nếu khác). Chỉ dùng được khi backend đang có 1 session còn sống (mở desktop 1 lần là đủ).

**Cách A — nạp cookie sẵn có (không cần màn hình):**
Trên máy đang đăng nhập Lark web (hoặc lấy từ app desktop): mở DevTools › Application › Cookies, copy chuỗi `name=value; ...` của host Lark, rồi:
```bash
node src/index.js seed-cookies "passport_web=...; _csrf_token=...; session=..."
```
Báo `✅ Cookies hợp lệ` là xong.

**Cách B — đăng nhập bằng trình duyệt thật (QR/mật khẩu) qua VNC:**
VM headless cần một màn hình ảo:
```bash
sudo apt-get install -y xvfb x11vnc
export DISPLAY=:99
Xvfb :99 -screen 0 1280x900x24 &
x11vnc -display :99 -nopw -forever -bg -rfbport 5900   # rồi VNC vào <IP>:5900
HEADLESS=false node src/index.js login                 # quét QR / nhập mật khẩu trong cửa sổ
```
Báo `✅ Đăng nhập thành công` là xong; tắt Xvfb/x11vnc đi.

## Kiểm thử

```bash
node src/index.js jobs     # liệt kê job connector trên CMS
node src/index.js once     # chạy 1 lượt đẩy session rồi thoát
# muốn thử mà KHÔNG ghi lên backend:  DRY_RUN=1 node src/index.js once
```
`once` báo `refreshed N/N` là chuẩn.

## Chạy nền 24/7 (systemd)

```bash
sudo useradd -r -s /usr/sbin/nologin -d "$(pwd)" cmskeeper 2>/dev/null || true
sudo chown -R cmskeeper:cmskeeper "$(pwd)"
sudo cp systemd/tw-cms-keeper.service /etc/systemd/system/
# nếu thư mục KHÁC /opt/tw-cms-keeper: sửa WorkingDirectory + EnvironmentFile + HOME trong unit
sudo systemctl daemon-reload
sudo systemctl enable --now tw-cms-keeper
journalctl -u tw-cms-keeper -f     # xem log trực tiếp
```

## Cấu hình (.env)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `CMS_API_BASE` | `https://apihoanam.toolswave.net/api` | REST API backend (không token) |
| `LARK_HOST` | tenant mẫu | Host Lark web giữ phiên — **phải sửa cho đúng** |
| `KEEPALIVE_URL` | `LARK_HOST/` | URL tải lại mỗi tick để giữ cookie tươi (có thể trỏ 1 base cụ thể để bắt thêm `docs-host-id`) |
| `REFRESH_INTERVAL_SEC` | `1800` | Bao lâu đẩy session/lượt (30') |
| `KEEPALIVE_INTERVAL_SEC` | `600` | Bao lâu reload trang giữ cookie (10') |
| `HEADLESS` | `true` | Chạy headless (đặt `false` chỉ khi `login` qua VNC) |
| `PROFILE_DIR` | `.profile` | Thư mục hồ sơ Chromium (chứa cookie) |
| `ALERT_WEBHOOK` | — | Webhook Lark bot để báo khi phiên rớt (cần login lại) |
| `DRY_RUN` | `0` | `1` = chạy nhưng không ghi backend |

## Khi phiên hết hạn

Khi Lark logout phiên (đổi mật khẩu, hết hạn dài ngày…), service **ngừng đẩy** (không ghi đè session chết) và log cảnh báo; nếu đặt `ALERT_WEBHOOK` nó gửi 1 tin nhắn Lark. Đăng nhập lại bằng Cách A/B ở trên → service tự tiếp tục ở lượt kế.

## Windows

Chạy được tương tự: `npm install` (tự tải Chromium), `node src\index.js login` (mở cửa sổ thật để đăng nhập — Windows có màn hình sẵn), rồi `node src\index.js run`. Muốn chạy nền như dịch vụ, dùng `pm2` hoặc NSSM bọc `node src/index.js run`.
