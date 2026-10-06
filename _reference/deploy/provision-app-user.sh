#!/usr/bin/env bash
# deploy/provision-app-user.sh
# Tạo user 'app' quyền giới hạn để chạy build/deploy, KHÔNG ảnh hưởng dịch vụ khác.
# Chạy MỘT LẦN trên server với quyền root:  sudo bash provision-app-user.sh
set -euo pipefail

APP_USER="${DEPLOY_USER:-app}"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/apps"          # chỉ được làm việc trong đây

# 1) Tạo user không có quyền sudo
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  echo "Đã tạo user $APP_USER"
fi

# 2) Thư mục làm việc riêng
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_HOME"
chmod 750 "$APP_HOME"

# 3) SSH key riêng cho user app (dán public key của bạn vào authorized_keys)
mkdir -p "$APP_HOME/.ssh"
touch "$APP_HOME/.ssh/authorized_keys"
chmod 700 "$APP_HOME/.ssh"
chmod 600 "$APP_HOME/.ssh/authorized_keys"
chown -R "$APP_USER:$APP_USER" "$APP_HOME/.ssh"
echo ">> Dán PUBLIC KEY của bạn vào: $APP_HOME/.ssh/authorized_keys"

# 4) Giới hạn: user app KHÔNG được sudo, KHÔNG bind port <1024.
#    Các app chạy ở dải port cao riêng để không đụng dịch vụ dev khác.
cat > /etc/security/limits.d/${APP_USER}.conf <<EOF
${APP_USER} hard nproc 200
EOF

# 5) (tuỳ chọn) Chỉ cho phép app dùng dải port 20000-29999 bằng firewall.
#    Bỏ comment nếu dùng ufw:
# ufw allow 20000:29999/tcp comment 'toolswave app builder'

echo "Xong. User '$APP_USER' đã sẵn sàng, không có sudo, làm việc trong $APP_DIR."
echo "Kiểm tra: sudo -l -U $APP_USER  (phải báo không có quyền sudo)"
