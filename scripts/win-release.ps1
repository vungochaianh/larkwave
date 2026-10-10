# Dựng và tải bản cài Windows, chạy TRÊN MÁY WINDOWS.
#
# Nó làm đúng một việc: dựng .exe rồi tải lên GitLab package registry (gói larkwave-desktop).
# Không có bước manifest: toolswave.net/api/apps-release/larkwave đọc thẳng registry, nên trang
# tải tự nhận bản mới. Máy Windows chỉ cần một khoá hẹp (write_package_registry), thu hồi riêng được.
#
# Dùng:
#   powershell -ExecutionPolicy Bypass -File scripts\win-release.ps1
#
# Cần trước: Node >= 20, pnpm, git; file .env ở gốc dự án chứa GITLAB_TOKEN (deploy token do
# scripts/make-win-deploy-token.mjs đúc ra trên máy chính).

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host '==> kiểm tra môi trường' -ForegroundColor Cyan
$nodeMajor = (node -p "process.versions.node.split('.')[0]")
if ([int]$nodeMajor -lt 20) { throw "Cần Node >= 20, máy này đang $nodeMajor" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Chưa có pnpm — chạy: npm i -g pnpm' }

if (-not (Test-Path '.env')) { throw 'Thiếu .env (chỉ cần dòng GITLAB_TOKEN=...) — xem README phần Windows.' }
# Nạp .env: chỉ lấy GITLAB_TOKEN, bỏ qua mọi dòng khác. Máy này không cần biết khoá nào khác.
Get-Content '.env' | ForEach-Object {
  if ($_ -match '^\s*GITLAB_TOKEN\s*=\s*(.+)\s*$') { $env:GITLAB_TOKEN = $Matches[1].Trim() }
}
if (-not $env:GITLAB_TOKEN) { throw 'Trong .env không thấy GITLAB_TOKEN.' }

$version = (node -p "require('./apps/desktop/package.json').version")
Write-Host "==> phiên bản desktop: $version" -ForegroundColor Cyan

Write-Host '==> cài phụ thuộc' -ForegroundColor Cyan
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Bước thất bại: pnpm install --frozen-lockfile (mã $LASTEXITCODE)" }

# @toolswave/core PHẢI dựng trước: bản dựng desktop gói core từ dist/ chứ không từ src/ và không
# tự dựng lại. Core cũ ⇒ một kênh IPC thành undefined ⇒ màn hình trắng khi mở app. Đây là lớp lỗi
# đã làm hỏng bản 1.0.92, và nó không kêu thành lỗi lúc dựng.
#
# @toolswave/shared cũng vậy, và chỗ này trước đây BỎ SÓT. Kiểm main của từng gói thì rõ:
#   core   main=dist/index.js   → phải dựng
#   shared main=dist/index.js   → phải dựng   ← thiếu
#   ui     main=src/index.ts    → gói từ nguồn, không cần
# Desktop không phụ thuộc shared trực tiếp, nhưng @toolswave/ui thì có — nên shared cũ đi vào bản
# cài qua đường ui, đúng lớp lỗi của core và cũng im lặng y như vậy.
Write-Host '==> dựng @toolswave/shared + @toolswave/core (BẮT BUỘC trước khi đóng gói)' -ForegroundColor Cyan
pnpm --filter @toolswave/shared build
if ($LASTEXITCODE -ne 0) { throw "Bước thất bại: pnpm --filter @toolswave/shared build (mã $LASTEXITCODE)" }
pnpm --filter @toolswave/core build
if ($LASTEXITCODE -ne 0) { throw "Bước thất bại: pnpm --filter @toolswave/core build (mã $LASTEXITCODE)" }

Write-Host '==> kiểm kiểu' -ForegroundColor Cyan
pnpm --filter desktop exec tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "Bước thất bại: pnpm --filter desktop exec tsc --noEmit (mã $LASTEXITCODE)" }

Write-Host '==> đóng gói bản Windows' -ForegroundColor Cyan
pnpm --filter desktop dist:win
if ($LASTEXITCODE -ne 0) { throw "Bước thất bại: pnpm --filter desktop dist:win (mã $LASTEXITCODE)" }

Write-Host '==> tải lên GitLab' -ForegroundColor Cyan
# push-installers chặn mặc định (nó PHÁT HÀNH lên registry công khai); chạy script này là đã chủ ý phát hành.
$env:ALLOW_DEPLOY = '1'
node scripts/push-installers.mjs --upload-only
$uploadExit = $LASTEXITCODE

# KIỂM KẾT QUẢ THẬT, không tin mã thoát.
#
# Hai lý do, cả hai đều đã cắn:
#
#  1. $ErrorActionPreference='Stop' KHÔNG bắt lệnh native thoát với mã lỗi trên PowerShell 5.1 —
#     nó chỉ bắt lỗi cmdlet. Lần chạy 1.0.310 đầu, bước này trả 401 rồi thoát 1, PowerShell đi
#     tiếp và in "Xong phần máy Windows" như thường.
#
#  2. Ngược lại, node 24 trên Windows SẬP lúc dọn dẹp sau khi đã tải lên xong:
#         Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\winsync.c, line 76
#     Mã thoát thành 0xC0000409 trong khi file đã nằm trên registry. Đây là lỗi của libuv, không
#     phải của mình, và không vá được từ phía script.
#
# Mã thoát nói dối theo cả hai chiều. Thứ duy nhất đáng tin là hỏi thẳng registry.
$ver = (node -p "require('./apps/desktop/package.json').version")
$pkgUrl = "https://gitlab.com/api/v4/projects/83700259/packages/generic/larkwave-desktop/$ver/Larkwave-$ver-win.exe"
Write-Host "==> xác minh trên registry: $pkgUrl" -ForegroundColor Cyan
try {
  $head = Invoke-WebRequest -Uri $pkgUrl -Method Head -UseBasicParsing -TimeoutSec 120
  $len = [int64]$head.Headers['Content-Length']
  if ($len -lt 1000000) { throw "File trên registry chỉ $len byte — không phải bản cài." }
  Write-Host ("    OK: {0:N0} byte" -f $len) -ForegroundColor Green
  if ($uploadExit -ne 0) {
    Write-Host "    (lệnh tải lên thoát với mã $uploadExit, nhưng file CÓ trên registry — bỏ qua mã đó)" -ForegroundColor Yellow
  }
} catch {
  throw "KHÔNG thấy bản cài trên registry ($pkgUrl). Mã thoát của bước tải lên: $uploadExit."
}

Write-Host ''
Write-Host 'Xong. toolswave.net/larkwave tự nhận bản này trong vòng ~5 phút (route đọc thẳng registry).' -ForegroundColor Green
