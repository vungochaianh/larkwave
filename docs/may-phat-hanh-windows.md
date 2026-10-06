# Biến máy Windows thành máy phát hành chính

Mục tiêu: sau khi dựng xong, ở máy Windows chỉ cần `git pull` → sửa → chạy lệnh, không phải quay
về máy Mac.

## Thứ DUY NHẤT không chuyển được: bản cài macOS (.dmg)

Đây là giới hạn nền tảng, không phải cấu hình — đừng mất thời gian tìm cách vòng:

| thứ cần | công cụ | có trên Windows? |
|---|---|---|
| ký ad-hoc bản `.app` | `codesign` | không |
| đóng gói `.dmg` | `hdiutil` | không |
| gộp universal (arm64+x64) | `lipo` / `@electron/universal` | không |

Bỏ bước ký thì app arm64 báo *"Toolswave is damaged and can't be opened"* và **không mở nổi** —
xem `apps/desktop/afterPack.cjs`. Nên giữ máy Mac lại cho đúng một việc: chạy `dist:mac` khi cần
phát hành bản macOS. Mọi thứ khác chuyển được hết.

Điểm lợi đi kèm: bản Windows dựng **trên chính Windows** thì làm được `.exe` cài đặt thật (NSIS),
thay vì file `.zip` như hiện nay — trên Mac phải qua Wine và đường đó đã tắc trên Apple Silicon
(xem chú thích trong `electron-builder.yml`).

## 0. Chọn chỗ đặt dự án — TRÁNH dấu cách

Đặt ở `C:\tw\app`, đừng đặt ở `C:\Work Space C\app`. Chuỗi công cụ dựng Electron
(`electron-builder`, `node-gyp`, vài script npm) vẫn hỏng với đường dẫn có dấu cách, và lúc hỏng
thì báo lỗi rất khó lần ra nguyên nhân. Đổi chỗ bây giờ rẻ hơn nhiều so với gỡ sau.

```powershell
mkdir C:\tw -Force
cd C:\tw
```

## 1. Cài nền

> PowerShell 5.1 (bản đi kèm Windows) **không hiểu `&&`** — đó là cú pháp của PowerShell 7+. Nối
> lệnh bằng `;` hoặc xuống dòng. Gõ `&&` thì lỗi cú pháp làm **cả dòng không chạy**, kể cả phần
> trước dấu `&&` — nên trông như lệnh đầu tiên cũng hỏng.

**WSL2 là bắt buộc**, không phải tuỳ chọn: `deploy/ci-deploy.sh` cần `rsync` và `sshpass`, Git
Bash không có hai thứ đó một cách đáng tin.

```powershell
wsl --install -d Ubuntu     # rồi khởi động lại máy
```

Trong **WSL2 Ubuntu** — đây sẽ là nơi làm việc chính:

```bash
sudo apt update && sudo apt install -y git rsync sshpass openssl curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pnpm
```

Trên **Windows native** (chỉ dùng để đóng gói bản Windows): Node ≥ 20 + pnpm.

Máy chủ nằm sau Tailscale → cài Tailscale trên Windows và đăng nhập cùng tài khoản, rồi kiểm từ
WSL: `ping 100.100.164.92`.

## 2. Đăng nhập GitLab rồi lấy mã nguồn

Có **HAI** kho, đừng lẫn:

| kho | chế độ | dùng để |
|---|---|---|
| `toolswave/app` (id 83102910) | **riêng tư** | mã nguồn — clone ở đây |
| `deveris.vu/toolswave-desktop-release` (id 83700259) | công khai | chứa file cài |

Deploy token ở mục 3 nằm ở kho **thứ hai** và chỉ có `write_package_registry` — nó **không** clone
được mã nguồn, và đó là cố ý. Để lấy mã, máy này phải đăng nhập bằng tài khoản GitLab của bạn.

> Deploy token của GitLab **không thể** có quyền ghi vào kho (`write_repository` không phải scope
> hợp lệ). Nên muốn `git push` từ máy này thì bắt buộc dùng tài khoản hoặc Personal Access Token.

**Cách 1 — đăng nhập qua trình duyệt (dễ nhất).** Git for Windows có sẵn Git Credential Manager:

```powershell
git config --global credential.helper manager
git clone https://gitlab.com/toolswave/app
```

Trình duyệt sẽ bật lên để đăng nhập. Nếu nó **không** bật mà báo `HTTP Basic: Access denied` thì
máy đang giữ một thông tin đăng nhập cũ — xoá đi rồi thử lại:

```powershell
cmdkey /delete:git:https://gitlab.com
```

**Cách 2 — Personal Access Token.** GitLab → ảnh đại diện → *Edit profile* → *Access tokens* →
tạo token scope `write_repository` (thêm `read_repository` nếu có ô riêng). Khi `git clone` hỏi:

```
Username: deveris.vu
Password: <dán token vừa tạo>
```

Xong rồi:

```powershell
cd app
pnpm install
```

> **Kiểm ngay**: `node -p "require('./apps/desktop/package.json').version"`.
> Nếu số này thấp hơn bản đang phát hành thì máy Mac còn commit chưa đẩy — quay về đó
> `git push origin main` trước, nếu không mọi thứ dựng ở đây đều là mã cũ.

## 3. Mang khoá sang

Trên **máy Mac**:

```bash
bash scripts/bundle-secrets.sh          # → toolswave-secrets.enc (AES-256, PBKDF2 200k vòng)
```

Chép file đó sang (USB/Drive đều được — nó đã mã hoá). **Mật khẩu đọc qua đường KHÁC với file** —
gọi điện, nhắn riêng. Gửi chung một chỗ thì việc mã hoá thành vô nghĩa.

Trong **WSL2** ở máy Windows:

```bash
bash scripts/bundle-secrets.sh --open toolswave-secrets.enc
rm toolswave-secrets.enc          # ở CẢ HAI máy
```

Nói thẳng một lần nữa cái đang đánh đổi: bộ này gồm **49 khoá**, trong đó có mật khẩu root máy chủ
production và `JWT_SECRET` (ký token của mọi người dùng). Từ giờ máy Windows đó có quyền ngang máy
Mac. Mất máy hoặc máy bị chiếm là mất tất cả — nên bật mã hoá đĩa (BitLocker) và đặt mật khẩu đăng
nhập cho máy đó.

## 4. Chạy gì ở đâu

Tất cả trong **WSL2**, trừ dòng cuối:

```bash
# Deploy API + web lên máy chủ
DEPLOY_HOST=100.100.164.92 DEPLOY_SSH_PASS=$(grep '^ROOT_SSH_PASS=' .deploy-secrets|cut -d= -f2-) \
  bash deploy/ci-deploy.sh

# Đẩy renderer (code-push, không đổi số phiên bản)
set -a; . ./.env; set +a; node scripts/push-renderer.mjs

# Kiểm trước khi phát hành
pnpm --filter api test
bash apps/desktop/test/run.sh
for p in @larkwave/core @larkwave/ui desktop web api; do pnpm --filter $p exec tsc --noEmit; done
```

Trong **PowerShell** (Windows native), để đóng gói bản Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\win-release.ps1
```

## 5. Phát hành bản macOS (vẫn phải ở máy Mac)

```bash
pnpm --filter @larkwave/core build     # BẮT BUỘC trước — core cũ = màn hình trắng (lỗi 1.0.92)
pnpm --filter desktop dist:mac
node scripts/boot-smoke.mjs             # phải thấy ~180+ kênh IPC
set -a; . ./.env; set +a; node scripts/push-installers.mjs
```

## Những cái bẫy đã biết

- **Dựng `@larkwave/core` TRƯỚC khi đóng gói desktop.** Bản dựng gói `core` từ `dist/` chứ không
  từ `src/` và không tự dựng lại. Core cũ ⇒ một kênh IPC thành `undefined` ⇒ màn hình trắng khi
  mở app. Không kêu thành lỗi lúc dựng.
- **`ROOT_SSH_PASS` bắt đầu bằng `#`** nên `source .deploy-secrets` trả về rỗng. Luôn lấy bằng
  `grep '^ROOT_SSH_PASS=' .deploy-secrets | cut -d= -f2-`.
- **rsync của deploy KHÔNG có `--delete`** — file xoá ở máy này vẫn còn trên máy chủ và import cũ
  của nó làm hỏng `next build`. Đổi tên/di chuyển thư mục route cũng vậy.
- **Thêm trường `@unique` mới** làm `prisma db push` fail vì cảnh báo mất dữ liệu. Chạy một lần
  trên máy chủ với `--accept-data-loss` rồi deploy lại.
- **`--main-change` khi đẩy manifest** làm `latestVersion` nhảy lên và mọi người bị nhắc cài lại.
  Bản Windows chỉ đang bắt kịp thì **đừng** dùng cờ đó.
