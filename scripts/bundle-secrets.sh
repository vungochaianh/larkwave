#!/usr/bin/env bash
# Gói `.env` + `.deploy-secrets` thành MỘT file đã mã hoá để mang sang máy khác.
#
# Vì sao không chép thẳng hai file đó qua USB/Drive/chat:
#   Chúng là 49 khoá, trong đó có mật khẩu root của máy chủ production và JWT_SECRET (thứ ký
#   token của MỌI người dùng). Một file .env dạng thô nằm trong Downloads, trong thùng rác, trong
#   lịch sử Drive, hay trong một đoạn chat là thứ không lấy lại được. Mã hoá bằng mật khẩu ở đây
#   thì kể cả file lọt ra ngoài vẫn còn một lớp nữa.
#
# Dùng:
#   bash scripts/bundle-secrets.sh                  # → toolswave-secrets.enc
#   bash scripts/bundle-secrets.sh --out /đường/dẫn
#
# Mở ở máy kia:
#   bash scripts/bundle-secrets.sh --open toolswave-secrets.enc
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

OUT="toolswave-secrets.enc"
MODE="pack"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --open) MODE="open"; OUT="$2"; shift 2 ;;
    *) echo "✗ tham số lạ: $1"; exit 1 ;;
  esac
done

command -v openssl >/dev/null || { echo "✗ thiếu openssl"; exit 1; }

if [ "$MODE" = "open" ]; then
  [ -f "$OUT" ] || { echo "✗ không thấy $OUT"; exit 1; }
  # Bung vào ĐÚNG thư mục dự án, quyền 600. Không in nội dung ra màn hình.
  read -rsp "Mật khẩu để mở: " PASS; echo
  TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$OUT" -out "$TMP" -pass pass:"$PASS" 2>/dev/null \
    || { echo "✗ sai mật khẩu, hoặc file hỏng."; exit 1; }
  tar -xf "$TMP" -C .
  chmod 600 .env .deploy-secrets 2>/dev/null || true
  echo "✓ đã bung .env và .deploy-secrets (chmod 600)."
  echo "  XOÁ file $OUT sau khi xong — nó vẫn là toàn bộ khoá, chỉ là đang khoá lại."
  exit 0
fi

for f in .env .deploy-secrets; do
  [ -f "$f" ] || { echo "✗ không thấy $f — chạy ở gốc dự án."; exit 1; }
done

echo "Sẽ gói: .env ($(grep -cE '^[A-Z_]+=' .env) khoá) + .deploy-secrets ($(grep -cE '^[A-Z_]+=' .deploy-secrets) khoá)"
echo "Trong đó có mật khẩu root máy chủ production và JWT_SECRET. Đặt mật khẩu MẠNH."
read -rsp "Mật khẩu: " P1; echo
read -rsp "Nhập lại : " P2; echo
[ "$P1" = "$P2" ] || { echo "✗ hai lần nhập khác nhau."; exit 1; }
[ ${#P1} -ge 12 ] || { echo "✗ mật khẩu phải từ 12 ký tự — file này mở ra là mất sạch."; exit 1; }

TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
tar -cf "$TMP" .env .deploy-secrets
# pbkdf2 + 200k vòng: chống dò mật khẩu ngoại tuyến. Mặc định của openssl (không pbkdf2) yếu.
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$TMP" -out "$OUT" -pass pass:"$P1"
chmod 600 "$OUT"

echo
echo "✓ Đã gói → $OUT ($(wc -c < "$OUT") byte, chmod 600)"
echo "  Mang sang máy kia rồi chạy:  bash scripts/bundle-secrets.sh --open $OUT"
echo "  Mật khẩu đọc qua ĐƯỜNG KHÁC với file (gọi điện, nhắn riêng) — gửi chung một chỗ là vô nghĩa."
echo "  Xong thì XOÁ $OUT ở cả hai máy."
