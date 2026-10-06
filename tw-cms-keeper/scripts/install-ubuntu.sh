#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# install-ubuntu.sh — one-shot setup for tw-cms-keeper on Ubuntu 22.04 / 24.04.
# Run as root (or with sudo) from the project root:  sudo bash scripts/install-ubuntu.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_MAJOR=20

echo "==> tw-cms-keeper install (dir: $APP_DIR)"

# 1. Node.js 20 (via NodeSource) if not already present at >=20 --------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  echo "==> Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  echo "==> Node $(node -v) already present"
fi

# 2. Node deps + Chromium + its system libraries -----------------------------
cd "$APP_DIR"
echo "==> npm install"
npm install --omit=dev

echo "==> Installing Chromium + system deps for Playwright"
# --with-deps installs the apt packages headless Chromium needs (libnss3, etc.)
npx playwright install --with-deps chromium

# 3. Optional: dedicated service user + systemd unit -------------------------
echo
echo "Xong phần cài đặt. Bước tiếp theo (thủ công):"
echo "  1) cp .env.example .env   &&  chỉnh LARK_HOST cho đúng tenant của bạn"
echo "  2) Đăng nhập Lark lần đầu:"
echo "       - Có màn hình/VNC:  HEADLESS=false node src/index.js login"
echo "       - Hoặc nạp cookie:  node src/index.js seed-cookies \"cookie1=val; cookie2=val\""
echo "  3) Kiểm thử:            node src/index.js once"
echo "  4) Chạy nền (systemd):"
echo "       sudo useradd -r -s /usr/sbin/nologin -d $APP_DIR cmskeeper 2>/dev/null || true"
echo "       sudo chown -R cmskeeper:cmskeeper $APP_DIR"
echo "       sudo cp systemd/tw-cms-keeper.service /etc/systemd/system/"
echo "       # sửa WorkingDirectory/EnvironmentFile trong unit nếu APP_DIR khác /opt/tw-cms-keeper"
echo "       sudo systemctl daemon-reload && sudo systemctl enable --now tw-cms-keeper"
echo "       journalctl -u tw-cms-keeper -f    # xem log"
