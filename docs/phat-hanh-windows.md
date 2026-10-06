# Dựng bản cài Windows trên một máy Windows riêng

Bản `.dmg` dựng được trên máy Mac, nhưng `.exe` thì không — `electron-builder` cần chạy trên
Windows. Tài liệu này mô tả cách để một máy Windows dựng và phát hành bản đó mà **không** phải
mang khoá của máy chính sang.

## Việc chia ở đâu, và vì sao

| | máy Windows | máy chính (Mac) |
|---|---|---|
| dựng `.exe` | ✓ | — |
| tải lên GitLab | ✓ | — |
| cập nhật manifest (Cloudflare) | — | ✓ |
| khoá cần có | **một** deploy token hẹp | khoá đầy đủ, ở nguyên chỗ cũ |

Máy Windows sẽ nằm đó nhiều tháng không ai ngó. Nó chỉ cần làm đúng một việc — tải một file lên
package registry của một dự án — nên nó chỉ được cầm đúng quyền đó.

**KHÔNG chép `GITLAB_TOKEN` trong `.env` của máy chính sang.** Đó là token `glpat-` toàn quyền
API: đọc/ghi được mọi dự án, mọi issue, mọi biến CI của tài khoản.

## Chuẩn bị (làm MỘT LẦN, trên máy chính)

```bash
set -a; . ./.env; set +a
node scripts/make-win-deploy-token.mjs
```

Nó đúc một deploy token chỉ có scope `write_package_registry`, hết hạn sau 1 năm, và ghi ra
`win-deploy-token.txt` (chmod 600) — **không in giá trị ra màn hình**, vì in ra là để nó nằm lại
trong lịch sử terminal. GitLab chỉ cho xem giá trị token **đúng một lần** lúc tạo; mất thì đúc
lại, đừng đi tìm.

Mang file đó sang máy Windows, đổi tên thành `.env` ở gốc dự án. Thu hồi bất cứ lúc nào ở
GitLab → Settings → Repository → Deploy tokens, không ảnh hưởng gì tới khoá chính.

## Trên máy Windows

Cần: Node ≥ 20, pnpm, git. Đăng nhập git bằng tài khoản của bạn (deploy token ở trên **không**
đọc được mã nguồn — cố ý, thu hẹp được thì thu hẹp).

```powershell
git clone https://gitlab.com/toolswave/app
cd app
# đặt win-deploy-token.txt vào đây, đổi tên thành .env
powershell -ExecutionPolicy Bypass -File scripts\win-release.ps1
```

Script sẽ: cài phụ thuộc → **dựng `@larkwave/core` trước** → kiểm kiểu → `dist:win` → tải lên
GitLab, rồi in ra lệnh cần chạy ở máy chính.

> Bước dựng `core` trước là bắt buộc và không được bỏ: bản dựng desktop gói `core` từ `dist/` chứ
> không từ `src/`, và không tự dựng lại. `core` cũ ⇒ một kênh IPC thành `undefined` ⇒ **màn hình
> trắng khi mở app**. Đây là lớp lỗi đã làm hỏng bản 1.0.92, và nó không kêu thành lỗi lúc dựng.

## Trên máy chính, sau đó

Chạy đúng lệnh mà script vừa in, đại khái:

```bash
set -a; . ./.env; set +a
node scripts/push-renderer.mjs --win https://gitlab.com/api/v4/projects/83700259/packages/generic/toolswave-desktop/<phiên-bản>/Toolswave-<phiên-bản>-win.exe
```

**KHÔNG thêm `--main-change`** khi bản Windows chỉ đang bắt kịp một phiên bản đã phát hành: cờ đó
đẩy `latestVersion` lên và người dùng macOS sẽ bị nhắc cài lại đúng bản họ đang chạy.

## Cái bẫy lớn nhất: mã phải có trên GitLab trước

Máy Windows chỉ dựng được thứ nằm trên `origin`. Ngày 2026-09-16, `origin/main` còn ở desktop
**1.0.289** trong khi máy chính đã ở **1.0.309** — và 1.0.289 đúng là phiên bản Windows đang kẹt
trong manifest. Không phải thiếu khoá, mà là 75 commit chưa bao giờ rời máy chính.

Nên trước mỗi lượt phát hành Windows: `git push origin main` ở máy chính, rồi `git pull` ở máy
Windows. Kiểm nhanh hai bên khớp nhau:

```bash
node -p "require('./apps/desktop/package.json').version"
```
