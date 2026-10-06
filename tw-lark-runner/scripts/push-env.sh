#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Bơm khoá Lark + token Larkwave từ MÁY NÀY thẳng sang VM chạy lịch, rồi bật service.
#
# Vì sao có script này thay vì "gõ vào .env trên VM":
#   App Secret là khoá của bạn. Nó không nên đi qua hội thoại với AI, không nên nằm trong lịch sử
#   shell, không nên hiện trên màn hình. Ở đây nó được đọc bằng `read -s` (không hiện, không vào
#   history), ghi ra một file tạm chmod 600, scp sang, rồi xoá. Không có bước nào in nó ra.
#
# Dùng:  bash scripts/push-env.sh            # mặc định máy chủ Larkwave
#        DEPLOY_HOST=1.2.3.4 bash scripts/push-env.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-100.100.164.92}"
REMOTE=/opt/tw-lark-runner
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no"

# Mật khẩu root: lấy từ .deploy-secrets như ci-deploy.sh, hoặc hỏi nếu không có.
SECRETS="$(dirname "$0")/../../.deploy-secrets"
if [ -z "${DEPLOY_SSH_PASS:-}" ] && [ -f "$SECRETS" ]; then
  DEPLOY_SSH_PASS=$(grep '^ROOT_SSH_PASS=' "$SECRETS" | cut -d= -f2- || true)
fi
if [ -z "${DEPLOY_SSH_PASS:-}" ]; then
  read -rsp "Mật khẩu root của ${HOST}: " DEPLOY_SSH_PASS; echo
fi
export SSHPASS="$DEPLOY_SSH_PASS"

command -v sshpass >/dev/null || { echo "✗ thiếu sshpass — brew install sshpass"; exit 1; }

echo "Ba giá trị dưới đây sẽ nằm trong ${REMOTE}/.env trên ${HOST} (chmod 600, chỉ root đọc được)."
echo "Không giá trị nào được in ra hay ghi vào lịch sử lệnh."
echo

read -rp  "LARK_APP_ID      (cli_...)           : " APP_ID
read -rsp "LARK_APP_SECRET  (Lark Dev Console)  : " APP_SECRET; echo
read -rsp "LARKWAVE_TOKEN  (app → Cài đặt → Tài khoản): " TW_TOKEN; echo
read -rp  "Múi giờ [Asia/Ho_Chi_Minh]           : " TZONE
TZONE="${TZONE:-Asia/Ho_Chi_Minh}"

[ -n "$APP_ID" ] && [ -n "$APP_SECRET" ] && [ -n "$TW_TOKEN" ] || { echo "✗ thiếu giá trị — dừng."; exit 1; }
case "$APP_ID" in cli_*) ;; *) echo "! LARK_APP_ID thường bắt đầu bằng cli_ — kiểm lại nếu VM báo lỗi xác thực." ;; esac

TMP=$(mktemp); chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<ENVEOF
LARK_APP_ID=${APP_ID}
LARK_APP_SECRET=${APP_SECRET}
LARKWAVE_TOKEN=${TW_TOKEN}
LARKWAVE_API=${LARKWAVE_API:-https://api.toolswave.net/v1}
RUNNER_LABEL=${RUNNER_LABEL:-VM chạy lịch}
TZ=${TZONE}
ENVEOF

echo
echo "==> gửi sang ${HOST}"
sshpass -e scp $SSH_OPTS "$TMP" "root@${HOST}:${REMOTE}/.env"
sshpass -e ssh $SSH_OPTS "root@${HOST}" "chmod 600 ${REMOTE}/.env && systemctl daemon-reload && systemctl enable --now tw-lark-runner && sleep 4 && systemctl is-active tw-lark-runner"

echo
echo "==> nhật ký 20 dòng đầu"
sshpass -e ssh $SSH_OPTS "root@${HOST}" "journalctl -u tw-lark-runner -n 20 --no-pager -o cat"

echo
echo "Xong. Theo dõi tiếp:"
echo "  sshpass -e ssh root@${HOST} journalctl -u tw-lark-runner -f"
