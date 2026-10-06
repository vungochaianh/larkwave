#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Cài tw-lark-runner lên Ubuntu 22.04/24.04. Chạy từ trong thư mục đã copy lên VM.
set -euo pipefail

if [ ! -f dist/runner.js ]; then
  echo "✗ Thiếu dist/runner.js — chạy 'npm run build' ở MÁY DEV rồi copy cả thư mục lên VM."
  echo "  (VM không cần mã nguồn Larkwave, chỉ cần file đã đóng gói.)"
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "==> cài Node 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

[ -f .env ] || { cp .env.example .env; echo "==> đã tạo .env — SỬA NÓ rồi chạy lại"; exit 1; }

install -d /opt/tw-lark-runner
cp -r dist .env /opt/tw-lark-runner/
cp systemd/tw-lark-runner.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tw-lark-runner
sleep 2
systemctl --no-pager --lines=15 status tw-lark-runner || true
echo
echo "==> xong. Xem nhật ký:  journalctl -u tw-lark-runner -f"
