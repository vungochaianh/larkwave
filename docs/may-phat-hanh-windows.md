# Bàn giao sang máy Windows — dựng và phát hành Larkwave cho Windows

**Trạng thái (28/10/2026):** Larkwave **chưa có bản Windows nào**. Bản đang phát hành là 0.1.22, chỉ
có macOS. Mã nằm ở `gitlab.com/toolswave/larkwave` (**riêng tư**). Tài liệu này dành cho người ngồi
máy Windows, kể cả một phiên Claude Code mở trên máy đó.

> Tài liệu Windows cũ của Toolswave (WSL2, Tailscale, mang 49 khoá máy chủ sang) **không áp dụng**
> cho Larkwave. Larkwave không deploy máy chủ nào, nên máy Windows chỉ cần đúng một khoá hẹp.

## Ai làm việc gì

| Việc | Máy Windows | Máy Mac |
|---|---|---|
| Dựng `.exe` (NSIS) | ✓ (chỉ Windows làm được) | — |
| Tải `.exe` lên registry | ✓ | — |
| Dựng `.dmg` | — | ✓ (chỉ Mac làm được) |
| Code-push giao diện (Cloudflare) | — | ✓ |
| Cập nhật manifest | **không cần** | **không cần** |

Không có bước manifest: `toolswave.net/api/apps-release/larkwave` và trang `/larkwave` đọc thẳng
package registry (gói `larkwave-desktop`, project 83700259). Tải `.exe` lên là khoảng 5 phút sau
trang tải tự có nút Windows, và app trên Windows tự nhận bản mới.

## Làm một lần trên máy Windows

### 1. Chọn thư mục KHÔNG có dấu cách

Dùng `C:\lw\larkwave`, đừng dùng `C:\Work Space\…`. `electron-builder`, `node-gyp` và vài script npm
vẫn hỏng với đường dẫn có dấu cách, và báo lỗi rất khó lần ra.

### 2. Cài nền

- **Node.js ≥ 20** (bản LTS), rồi `npm i -g pnpm`.
- **Git for Windows**: có sẵn Git Credential Manager để đăng nhập GitLab qua trình duyệt.
- Không cần WSL2, không cần Tailscale.

> PowerShell 5.1 (bản đi kèm Windows) **không hiểu `&&`**. Nối lệnh bằng `;` hoặc xuống dòng. Gõ
> `&&` là lỗi cú pháp, và **cả dòng** không chạy, kể cả phần trước dấu `&&`.

### 3. Lấy mã

```powershell
git config --global credential.helper manager
git clone https://gitlab.com/toolswave/larkwave C:\lw\larkwave
cd C:\lw\larkwave
pnpm install
```

Trình duyệt bật lên để đăng nhập GitLab, bằng tài khoản có quyền vào nhóm `toolswave`. Nếu nó không
bật mà báo `HTTP Basic: Access denied`, máy đang giữ thông tin đăng nhập cũ: chạy
`cmdkey /delete:git:https://gitlab.com` rồi thử lại.

### 4. Mang khoá hẹp sang

Trên **máy Mac** (một lần):

```bash
cd /Users/deveris/larkwave
set -a; . /Users/deveris/app/.env; set +a
node scripts/make-win-deploy-token.mjs      # → win-deploy-token.txt, KHÔNG in giá trị ra màn hình
```

Token này chỉ có quyền `write_package_registry` trên project 83700259, hết hạn sau 1 năm, thu hồi
riêng được (GitLab → project → Settings → Repository → Deploy tokens). Chép file sang máy Windows,
đổi tên thành `.env` ở gốc repo (`C:\lw\larkwave\.env`). `.env` đã nằm trong `.gitignore`.

- Máy Windows **đã từng phát hành Toolswave** thì `.env` cũ ở `C:\tw\app` có deploy token của
  **cùng project 83700259**, nên dùng lại được: chỉ cần chép đúng dòng `GITLAB_TOKEN=…` sang.
- **KHÔNG BAO GIỜ** chép `GITLAB_TOKEN` trong `/Users/deveris/app/.env` của máy Mac sang. Đó là
  token `glpat-` toàn quyền: đọc/ghi mọi dự án của tài khoản.

## Mỗi lần phát hành bản Windows

Máy Mac phát hành bản macOS trước, rồi `git push origin main`. Sau đó trên máy Windows:

```powershell
cd C:\lw\larkwave
git pull
node -p "require('./apps/desktop/package.json').version"   # phải BẰNG bản đang phát hành
powershell -ExecutionPolicy Bypass -File scripts\win-release.ps1
```

`win-release.ps1` làm theo thứ tự:

1. Kiểm Node/pnpm/`.env`.
2. `pnpm install --frozen-lockfile`.
3. **Dựng `@larkwave/shared` + `@larkwave/core`.** Bỏ bước này là bản cài trắng màn hình, mà lúc
   dựng không báo lỗi gì.
4. Typecheck, rồi `dist:win`.
5. Tải `Larkwave-<bản>-win.exe` lên registry, rồi **hỏi thẳng registry** xem tệp đã lên chưa. Không
   tin mã thoát, vì mã thoát của node trên Windows từng nói dối theo cả hai chiều.

Kiểm sau khi xong, khoảng 5 phút sau (máy chủ đệm 300 giây và chạy hai tiến trình):

```powershell
1..8 | % { (Invoke-RestMethod https://toolswave.net/api/apps-release/larkwave).downloads.win }
```

Cả 8 dòng phải ra link `Larkwave-<bản>-win.exe`.

Bản Windows chỉ **bắt kịp** phiên bản Mac đã phát hành thì **không làm gì thêm**. Đặc biệt đừng chạy
`push-renderer --main-change` vì một bản Windows: cờ đó đẩy `latestVersion` lên và người dùng macOS
bị nhắc cài lại đúng bản họ đang chạy.

## Lần đầu tiên: thử tay trước khi báo người dùng

Larkwave chưa từng chạy trên Windows. Toolswave thì có bản Windows chạy tốt tới 1.0.310, và Larkwave
tách từ đó, nên phần lớn mã đã quen Windows. Phần thêm sau khi tách (Zalo/Gmail, cửa sổ Zalo Web)
thì chưa ai chạy trên Windows. Cài `.exe` vừa dựng lên chính máy đó và thử:

- [ ] Mở app không trắng màn hình. Windows SmartScreen sẽ chặn vì `.exe` chưa ký: bấm **More info →
      Run anyway**.
- [ ] Đăng nhập tài khoản Toolswave.
- [ ] Lark × Agents: mở được trang Lark, đăng nhập Lark bằng QR, chat một câu.
- [ ] CLI AI (Claude/Codex/Gemini) cài trên Windows được app nhận ra.
- [ ] Cài đặt → Đồng bộ tin Zalo → mở cửa sổ Zalo Web: ra mã QR.
- [ ] Xuất một tệp xlsx/docx: mở được, đúng thư mục.

Hỏng ở đâu thì ghi vào [ban-giao-phien.md](ban-giao-phien.md) mục "CÒN TREO", sửa trên máy Windows,
rồi commit + push để máy Mac kéo về.

## Đừng chạy trên máy Windows

Repo còn vài script thời Toolswave trỏ vào **máy chủ production của Toolswave**:
`scripts/deploy-from-windows.sh`, `wsl-tailscale.sh`, `set-server-key.ps1`,
`push-installer-server.mjs`, `bundle-secrets.sh`. Chúng bị chặn bằng `ALLOW_DEPLOY=1`, và máy
Windows của Larkwave không có (và không được có) khoá máy chủ. Máy chủ chỉ deploy từ repo
`toolswave/app`.

## Bẫy đã biết

- **Mã phải có trên `origin` trước.** Máy Windows chỉ dựng được thứ đã push. Thời Toolswave từng có
  75 commit nằm lì trên máy Mac và bản Windows kẹt ở bản cũ nhiều ngày. Mở phiên là chạy
  `node scripts/handoff.mjs`: nó so máy này với `origin` và với bản đang phát hành.
- **`ELECTRON_RUN_AS_NODE=1`** trong terminal của VS Code làm Electron chết lặng với mã 0.
  `win-release.ps1` tự gỡ biến này; lệnh tay thì gỡ trước:
  `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`.
- **Đường dẫn có dấu cách** làm hỏng bản dựng (xem mục 1).
- **Bản cài chưa ký**: SmartScreen cảnh báo ở lần mở đầu. Ký thật cần chứng chỉ code signing; chưa có.
