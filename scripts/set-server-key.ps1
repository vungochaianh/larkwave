# Đổi một khoá trong .env của MÁY CHỦ, không cần mở trình soạn thảo.
#
#   powershell -ExecutionPolicy Bypass -File scripts\set-server-key.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\set-server-key.ps1 -Name OPENAI_API_KEY
#
# VÌ SAO CÓ SCRIPT NÀY. Cách hiển nhiên là ssh vào rồi nano, nhưng chuỗi
# `wsl -- bash -lc "... ssh ... nano"` KHÔNG cấp terminal cho nano, nên nó chết ngay với
# "Standard input is not a terminal". Muốn nano chạy thì phải vào tay từng lớp một: mở wsl, rồi
# ssh, rồi mới nano — ba bước, và sai một bước là sửa nhầm file trên máy mình.
#
# Script này đi đường khác: KHÔNG mở trình soạn thảo. Nhận khoá qua ô nhập ẩn rồi đẩy thẳng sang
# máy chủ qua stdin, nên khoá không nằm trong lịch sử lệnh, không nằm trong dòng lệnh (nơi mọi
# tiến trình khác trên máy đều đọc được), và không hiện ra màn hình.
param(
  [string]$Name = 'ANTHROPIC_API_KEY',
  [string]$ServerHost = '100.100.164.92',
  [string]$EnvPath = '/home/app/toolswave/.env'
)

$ErrorActionPreference = 'Stop'

Write-Host "Đổi $Name trong $EnvPath trên $ServerHost" -ForegroundColor Cyan
$secure = Read-Host -Prompt "Dán giá trị mới (gõ vào sẽ KHÔNG hiện)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if ([string]::IsNullOrWhiteSpace($plain)) { Write-Host "Bỏ trống — không làm gì." -ForegroundColor Yellow; exit 1 }
if ($plain -match '\s') { Write-Host "Giá trị có khoảng trắng — gần như chắc chắn dán thiếu/thừa. Dừng." -ForegroundColor Red; exit 1 }
Write-Host ("Đã nhận {0} ký tự, bắt đầu bằng '{1}'" -f $plain.Length, $plain.Substring(0, [Math]::Min(7, $plain.Length)))

# Script chạy trên máy chủ: đọc giá trị từ stdin, thay đúng một dòng, giữ bản sao lưu.
# Dùng biến môi trường chứ không nội suy vào chuỗi sed — khoá có thể chứa / & ~ làm hỏng cú pháp,
# và không bao giờ lọt vào dòng lệnh để `ps` đọc được.
$remote = @'
set -euo pipefail
read -r NEWVAL
KEY="__KEY__"
ENVF="__ENVF__"
[ -f "$ENVF" ] || { echo "KHONG THAY $ENVF"; exit 1; }
cp -a "$ENVF" "$ENVF.bak.$(date +%Y%m%d%H%M%S)"
if grep -q "^$KEY=" "$ENVF"; then
  NEWVAL="$NEWVAL" KEY="$KEY" python3 - "$ENVF" <<'PY'
import os, sys
p = sys.argv[1]
key, val = os.environ['KEY'], os.environ['NEWVAL']
out = []
for line in open(p, encoding='utf-8'):
    out.append(f"{key}={val}\n" if line.startswith(key + '=') else line)
open(p, 'w', encoding='utf-8').writelines(out)
PY
  echo "da thay $KEY"
else
  printf '%s=%s\n' "$KEY" "$NEWVAL" >> "$ENVF"
  echo "da them $KEY"
fi
v=$(grep -m1 "^$KEY=" "$ENVF" | cut -d= -f2-)
echo "gio dai ${#v} ky tu, bat dau ${v:0:7}"
systemctl restart toolswave-api
sleep 4
systemctl is-active toolswave-api | sed 's/^/toolswave-api: /'
'@
$remote = $remote.Replace('__KEY__', $Name).Replace('__ENVF__', $EnvPath)

$tmp = Join-Path $env:TEMP "tw-setkey.sh"
# LF thuần: bash trên máy chủ gặp \r sẽ chết ở "set: pipefail: invalid option name".
[IO.File]::WriteAllText($tmp, ($remote -replace "`r`n", "`n"))
$wslTmp = "/mnt/c" + ($tmp -replace '^[A-Za-z]:', '' -replace '\', '/')

$payload = Join-Path $env:TEMP "tw-setkey.in"
[IO.File]::WriteAllText($payload, $plain + "`n")
$wslPayload = "/mnt/c" + ($payload -replace '^[A-Za-z]:', '' -replace '\', '/')

try {
  # Nối [giá trị] + [script] rồi đổ vào bash -s: dòng đầu là giá trị mà `read -r NEWVAL` đọc,
  # phần còn lại là thân script. Nhờ vậy khoá KHÔNG xuất hiện trong dòng lệnh — chỗ mà mọi tiến
  # trình khác trên máy đều đọc được bằng `ps`.
  $full = 'export PATH="$HOME/ts:$PATH"; cat ' + "'$wslPayload' '$wslTmp' | " +
          "tailscale --socket=`"`$HOME/ts/ts.sock`" ssh root@$ServerHost 'bash -s'"
  wsl -d Ubuntu-22.04 -- bash -lc $full
} finally {
  Remove-Item $tmp, $payload -ErrorAction SilentlyContinue
  $plain = $null
}
