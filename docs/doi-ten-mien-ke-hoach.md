# Kế hoạch hoán đổi tên miền giữa hai hệ thống

> Trạng thái: **ĐÃ THỰC HIỆN** ngày 22/09/2026. Phần "Thực tế" ở cuối ghi những chỗ kế hoạch
> này đoán sai — đọc nó trước nếu phải lùi hoặc làm lại.
> Đo ngày 22/09/2026 trên máy chủ thật (100.100.164.92).

## Đổi cái gì

Ba cặp tên miền đổi chỗ cho nhau. Hai hệ thống chạy trên **cùng một máy chủ**, khác cổng, khác
user, khác cách quản lý tiến trình — nên chúng không đụng nhau.

| Tên miền | Hiện tại | Sau khi đổi |
|---|---|---|
| `toolswave.net` | Portal (hệ B, PM2, cổng 4000) | **App** (hệ A, systemd, cổng 4090) |
| `app.toolswave.net` | App (hệ A, cổng 4090) | **Portal** (hệ B, cổng 4000) |
| `api.toolswave.net` | Backend (hệ B, cổng 4001) | **API** (hệ A, cổng 4091) |
| `apia.toolswave.net` | API (hệ A, cổng 4091) | **Backend** (hệ B, cổng 4001) |
| `cms.toolswave.net` | CRM (hệ B, nginx :80) | **Quản trị** (hệ A, cổng 4090) |
| `aapp.toolswave.net` | Quản trị (hệ A, cổng 4090) | **CRM** (hệ B, nginx :80) |

Hai hệ thống:

- **Hệ A** — kho `toolswave/app`. systemd (`toolswave-web`, `toolswave-web2`, `toolswave-api`),
  user `app`, thư mục `/home/app/toolswave`.
- **Hệ B** — kho `toolswave/toolswave-workspace`. PM2 (`toolswave-portal`, `toolswave-api`),
  user `deveris`, thư mục `/var/www/toolswave`. CRM là file tĩnh do nginx phục vụ ở cổng 80.

## KHÔNG đụng tới

**Subdomain của app người dùng tạo** (`msnede.toolswave.net`, `vkdtdg.toolswave.net`…). Chúng đi
qua tunnel riêng (`toolswave-apps-tunnel.service`) và không nằm trong danh sách trên. Đã kiểm:
`msnede.toolswave.net` trả 200. Việc hoán đổi không chạm vào chúng.

Biến `DOMAIN_GOC=toolswave.net` của hệ A là gốc để CẤP subdomain cho app người dùng — **giữ
nguyên**, không đổi. Nó không liên quan tới việc trang chính nằm ở tên miền nào.

---

## Hai điều làm việc này khó hơn "đổi vài dòng cấu hình"

### 1. Cả hai bên phải BUILD LẠI, không chỉ đổi biến rồi khởi động lại

Hệ A dùng `NEXT_PUBLIC_API_BASE`. Tiền tố `NEXT_PUBLIC_` nghĩa là Next.js **nhúng giá trị vào
bundle JavaScript lúc build**, không đọc lúc chạy. Đổi biến trong `.env` rồi restart là **không
có tác dụng** — trình duyệt vẫn gọi địa chỉ cũ.

CRM của hệ B cũng vậy: là file tĩnh đã build, có nhúng sẵn `https://api.toolswave.net`.

Nên quy trình bắt buộc phải là: đổi biến → **build lại** → mới khởi động lại.

Đây là lý do chính khiến cần cửa sổ bảo trì, chứ không phải bản thân việc đổi tuyến.

### 2. OAuth gãy ngay lập tức nếu không khai báo lại TRƯỚC

Google / GitHub / GitLab chỉ chấp nhận redirect URI đã đăng ký sẵn. Đổi tên miền mà chưa khai lại
thì **không ai đăng nhập được, kể cả người quản trị**.

Việc này **chỉ chủ tài khoản làm được** — phải vào từng bảng điều khiển. Xem danh sách ở dưới.

---

## Việc bạn phải tự làm, TRƯỚC giờ bảo trì

Thêm URI mới vào danh sách cho phép, **giữ luôn URI cũ** trong lúc chuyển. Cả hai cùng tồn tại thì
đổi qua đổi lại được mà không ai bị khoá ngoài; dọn URI cũ sau vài ngày.

**Google Cloud Console** — mục Credentials → OAuth 2.0 Client ID:

- thêm `https://api.toolswave.net/...` (cho hệ A, đường dẫn giữ đúng như `apia` đang dùng)
- thêm `https://apia.toolswave.net/...` (cho hệ B, giữ đúng đường dẫn `api` đang dùng)

**GitHub** — Settings → Developer settings → OAuth Apps → Authorization callback URL.

**GitLab** — Applications → Redirect URI.

Báo tôi khi xong. Chưa xong thì không bắt đầu bước nào phía dưới.

---

## Trình tự thực hiện

Ước tính 45–75 phút, trong đó phần người dùng không truy cập được khoảng **15–25 phút**.

### Bước 0 — chuẩn bị (làm trước, không gây gián đoạn)

1. Sao lưu `.env` của cả hai hệ, kèm dấu thời gian.
2. Chép `/etc/cloudflared/config.yml` ra bản lưu.
3. Kiểm cổng chặn của hệ A: không còn build nào đang chạy, không còn lượt trợ lý nào đang mở.
4. Thông báo bảo trì cho người dùng nếu cần.

### Bước 1 — đổi biến môi trường (chưa ảnh hưởng gì)

**Hệ A** — `/home/app/toolswave/.env`:

```
CORS_ORIGINS=https://toolswave.net,https://cms.toolswave.net
NEXT_PUBLIC_API_BASE=https://api.toolswave.net
DOMAIN_GOC=toolswave.net            ← GIỮ NGUYÊN
SERVER_DEPLOY_DOMAIN=toolswave.net  ← GIỮ NGUYÊN
```

**Hệ B** — `/var/www/toolswave/backend/.env`:

```
FRONTEND_URL=https://app.toolswave.net
ADMIN_URL=https://aapp.toolswave.net
GOOGLE_CALLBACK_URL=https://apia.toolswave.net/...   (giữ nguyên phần đường dẫn)
```

**CRM hệ B**: địa chỉ API nằm trong mã nguồn hoặc biến build — phải sửa rồi build lại.

### Bước 2 — build lại cả hai bên (mất thời gian nhất, chưa gián đoạn)

- Hệ A: `bash deploy/deploy.sh` dưới user `app` (build shared, core, api, web).
- Hệ B: build `portal` và `crm` theo quy trình của kho đó.

Build **xong xuôi rồi mới** sang bước 3. Build hỏng thì dừng ở đây, chưa có gì bị ảnh hưởng.

### Bước 3 — đổi tuyến (đây là lúc gián đoạn bắt đầu)

Sửa `/etc/cloudflared/config.yml`, đúng sáu dòng:

```yaml
- hostname: toolswave.net
  service: http://localhost:4090     # was 4000
- hostname: api.toolswave.net
  service: http://localhost:4091     # was 4001
- hostname: cms.toolswave.net
  service: http://localhost:4090     # was 80

- hostname: app.toolswave.net
  service: http://localhost:4000     # was 4090
- hostname: apia.toolswave.net
  service: http://localhost:4001     # was 4091
- hostname: aapp.toolswave.net
  service: http://localhost:80       # was 4090
```

Rồi `systemctl reload cloudflared`.

### Bước 4 — khởi động lại ứng dụng

- Hệ A: `systemctl restart toolswave-api toolswave-web toolswave-web2`
- Hệ B: `su - deveris -c 'pm2 restart all'`

### Bước 5 — sửa 22 ảnh trong bài blog

22 ảnh trong bài blog của hệ A trỏ `https://apia.toolswave.net/uploads/…`. Sau khi đổi, `apia`
thuộc về hệ B nên **các ảnh này 404 hết**.

Chạy `node scripts/blog-fix-image-host.mjs` (sẽ viết) để đổi `apia.` → `api.` trong cả nội dung
tiếng Việt lẫn bản dịch của mọi bài.

### Bước 6 — SEO

- Sitemap, robots.txt, canonical, hreflang của hệ A tự sinh theo `SITE_URL` — kiểm lại sau build.
- Gửi lại IndexNow cho toàn bộ URL mới.
- Khai báo đổi địa chỉ trong Google Search Console (nếu đã xác minh tên miền).

### Bước 7 — kiểm tra

| Kiểm | Mong đợi |
|---|---|
| `toolswave.net` | trang chủ App |
| `app.toolswave.net` | Portal |
| `api.toolswave.net/v1/health` | 200 từ API hệ A |
| `apia.toolswave.net` | backend hệ B |
| `cms.toolswave.net` | quản trị hệ A |
| `aapp.toolswave.net` | CRM hệ B |
| `msnede.toolswave.net` | vẫn 200 — **không được đổi** |
| Đăng nhập Google trên cả hai hệ | vào được |
| Một bài blog bất kỳ | ảnh hiện đủ |

---

## Đường lùi

Hỏng ở bất kỳ bước nào từ 3 trở đi: chép lại `config.yml` bản lưu, `systemctl reload cloudflared`.
Tuyến về như cũ trong vài giây. Biến môi trường và bản build mới không gây hại khi tuyến đã lùi —
chỉ cần khôi phục `.env` rồi build lại nếu muốn sạch hẳn.

Đây là lý do bước 3 đặt SAU bước build: lùi tuyến rẻ, lùi bản build thì đắt.

---

## Cái giá phải chấp nhận

**SEO bị đóng băng một quãng.** 28 bài blog đang có canonical, hreflang, sitemap và IndexNow trỏ
`app.toolswave.net`. Sau khi đổi, Google cần **vài tuần tới vài tháng** để chuyển uy tín sang tên
miền mới. Không mất hẳn, nhưng thứ hạng sẽ chững lại trong quãng đó.

Nếu vẫn định đổi thì làm càng sớm càng rẻ: 28 bài dễ chuyển hơn 300 bài.

---

## Thực tế: bốn chỗ kế hoạch trên đoán sai

### 1. `systemctl reload cloudflared` không làm gì cả

Unit của cloudflared có `ExecReload` rỗng. systemd báo thành công, mã thoát 0, nhật ký sạch — và
tuyến vẫn y nguyên. Sau lệnh "reload" đầu tiên, cả sáu tên miền vẫn trỏ cổng cũ. Phải **restart**.

Đây là loại lỗi tệ nhất: thất bại mà báo thành công. Bước 3 của kế hoạch ghi `reload`, nên nếu
chỉ làm theo kế hoạch thì sẽ ngồi nhìn tên miền không đổi mà không hiểu vì sao.

### 2. nginx chọn khối theo TÊN MIỀN, không theo cổng

CRM là file tĩnh do nginx phục vụ ở cổng 80. Đổi tuyến `aapp` → `:80` xong vẫn ra trang
"Welcome to nginx", vì khối CRM khai `server_name cms.toolswave.net` mà `cms` thì đã chuyển cho
hệ A. Không tên nào khớp → rơi vào khối mặc định.

Phải đổi `server_name` sang `aapp.toolswave.net` và đổi symlink trong `sites-enabled`.
Script `doi-ten-mien.sh` giờ làm việc này ở bước 4b, và **lùi lại ở nhánh `--lui`** — thiếu vế
sau thì lúc lùi, cms về `:80` nhưng nginx chỉ còn biết tên `aapp`, CRM chết đúng lúc chữa cháy.

### 3. Máy chủ không có mã nguồn hệ B, và `node_modules` ở đó không dựng được

`/var/www/toolswave` chỉ có `.next`, `public` và một `node_modules` rút gọn của bản
standalone — 14 gói, không có `next`. Phải clone kho `toolswave-workspace`, `npm ci`
(466 gói cho portal, 290 cho crm), build ở nơi khác rồi chép lên.

Biến lúc build (đều là biến **build-time**, đổi lúc chạy vô nghĩa):

```
portal:  NEXT_PUBLIC_SITE_URL=https://app.toolswave.net
         NEXT_PUBLIC_API_URL=https://apia.toolswave.net
crm:     VITE_API_URL=https://apia.toolswave.net/api
         VITE_PORTAL_URL=https://app.toolswave.net
```

### 4. Bản build cũ vẫn sống sau khi restart — Next giữ cache fetch trên đĩa

Ảnh và dữ liệu cũ vẫn hiện sau khi đã sửa và khởi động lại. Không phải Cloudflare (header trả
`DYNAMIC`), không phải trình duyệt. Là `.next/cache/fetch-cache`: nó nằm trên **đĩa** nên sống
qua restart, và **mỗi tiến trình giữ một bản riêng** (hệ A chạy hai bản, cổng 4100 và 4102).
Phải xoá ở cả thư mục build lẫn thư mục standalone, rồi restart cả hai.

### Và một lỗi của tôi

`blog-fix-image-host.mjs` bản đầu chỉ sửa `content` với `i18n`, **bỏ sót `coverImage`**.
Nó chạy xong báo "0 bài · 0 chỗ" và tôi nhận con số đó là xong. Thân bài đúng, ảnh bìa vẫn trỏ địa
chỉ cũ, nên thumbnail vỡ hết trên `/blog` — người dùng phải báo tôi mới biết.

Đếm những gì mình đã sửa thì không bao giờ lộ ra thứ mình quên sửa.
