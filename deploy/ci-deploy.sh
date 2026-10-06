#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# CI deploy step: sync repo to the server, rebuild, migrate, seed, restart.
# Requires CI/CD variables: DEPLOY_HOST, DEPLOY_SSH_PASS (root). The runner must
# be able to reach DEPLOY_HOST (Tailscale-joined or self-hosted on the server).
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST}"
: "${DEPLOY_SSH_PASS:?set DEPLOY_SSH_PASS}"
export SSHPASS="$DEPLOY_SSH_PASS"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no"

# Canh các cặp file được CHÉP TAY qua ranh giới package (core↔api, api↔desktop).
# Chúng cố tình trùng nhau vì hai package không được import lẫn nhau — nhưng khi lệch
# nhau thì một bên âm thầm chạy sai mã cũ. Trước đây có script canh nhưng KHÔNG ai gọi.
echo "==> kiểm tra các cặp file nhân bản"
node scripts/check-duplicates.mjs

echo "==> rsync source to ${DEPLOY_HOST}"
rsync -az -e "sshpass -e ssh ${SSH_OPTS}" \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.next' \
  --exclude '.workspace' --exclude '.artifacts' --exclude '.env' \
  --exclude 'prompts.chat' \
  ./ "root@${DEPLOY_HOST}:/home/app/toolswave/"

echo "==> remote build + migrate + seed"
sshpass -e ssh ${SSH_OPTS} "root@${DEPLOY_HOST}" \
  "chown -R app:app /home/app/toolswave && runuser -u app -- bash -lc 'cd /home/app/toolswave && bash deploy/deploy.sh'"

# ── CỔNG CHẶN: không khởi động lại khi còn build đang chạy ────────────────────
#
# Vì sao phải chạy Ở ĐÂY, trên server, ngay trước lệnh restart: kiểm bằng tay trước khi gõ lệnh
# deploy là VÔ NGHĨA. Từ lúc kiểm tới lúc `systemctl restart` mất 5–13 phút (rsync + build web +
# build api), và người dùng bấm dựng app trong khoảng đó thì build của họ chết.
#
# Đo thật ngày 2026-09-10: năm lượt chạy MAIC bị giết đúng ở năm mốc deploy (16:14, 18:47, 20:04,
# 23:27), bốn trong số đó là một bộ site người dùng vừa bấm dựng lúc 18:41 — trong khi lần kiểm
# tay đã chạy lúc 18:30 và báo "không có build nào". Bên MAIC còn hiện "Người dùng đã huỷ", nên
# nhìn từ ngoài thì tưởng người dùng tự huỷ hoặc MAIC hỏng.
#
# DEPLOY_DRAIN_MAX: giây tối đa chờ (mặc định 1800 — dài hơn p80 của một lượt dựng thường).
# DEPLOY_FORCE=1: vẫn deploy dù còn build đang chạy (chỉ dùng khi thật sự cần, và biết là sẽ giết).
DRAIN_MAX="${DEPLOY_DRAIN_MAX:-1800}"
echo "==> chờ việc đang chạy kết thúc (build + lượt AI, tối đa ${DRAIN_MAX}s)"
sshpass -e ssh ${SSH_OPTS} "root@${DEPLOY_HOST}" 'bash -s' <<REMOTE_DRAIN
set -euo pipefail
cd /home/app/toolswave/apps/api
set -a; . /home/app/toolswave/.env; set +a
deadline=\$(( \$(date +%s) + ${DRAIN_MAX} ))
while :; do
  # Đếm CẢ hai loại việc mà một lần khởi động lại sẽ giết:
  #   • Build đang dựng/chờ.
  #   • Lượt chạy MAIC còn mở — gồm cả Trợ lý AI và deploy-lên-server, hai thứ KHÔNG nằm trong
  #     bảng Build. Chỉ đếm Build là vẫn giết việc của người đang trò chuyện với trợ lý.
  n=\$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.build.count({where:{status:{in:['running','queued']}}}),p.maicRun.count({where:{closedAt:null}})]).then(([b,m])=>{console.log(b+m);process.exit(0)}).catch(()=>{console.log(-1);process.exit(0)})")
  # -1 = không hỏi được CSDL. Đi tiếp thay vì kẹt deploy: không biết thì không được coi là "có build".
  if [ "\$n" = "0" ] || [ "\$n" = "-1" ]; then break; fi
  if [ "\$(date +%s)" -ge "\$deadline" ]; then
    if [ "${DEPLOY_FORCE:-0}" = "1" ]; then
      echo "!! vẫn còn \$n việc đang chạy — DEPLOY_FORCE=1 nên tiếp tục (chúng SẼ bị giết)"
      break
    fi
    echo "!! vẫn còn \$n việc đang chạy sau ${DRAIN_MAX}s — DỪNG deploy."
    echo "   Khởi động lại lúc này sẽ giết chúng ('máy chủ khởi động lại giữa chừng')."
    echo "   Chờ thêm rồi chạy lại, hoặc DEPLOY_FORCE=1 nếu chấp nhận giết."
    exit 1
  fi
  echo "   còn \$n việc đang chạy (build + lượt AI), chờ…"
  sleep 15
done
echo "   không còn việc nào đang chạy"
REMOTE_DRAIN

echo "==> rolling restart (zero-downtime web via nginx 4100+4102; api single-instance)"
sshpass -e ssh ${SSH_OPTS} "root@${DEPLOY_HOST}" 'bash -s' <<'REMOTE'
set -euo pipefail
# Wait until an HTTP endpoint answers (any 2xx/3xx counts as "up").
wait_up() {  # $1=url  $2=timeout_s
  local url="$1" max="${2:-40}" i code
  for ((i=0; i<max; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || echo 000)
    case "$code" in 2*|3*) return 0;; esac
    sleep 1
  done
  echo "!! timed out waiting for $url (last=$code)"; return 1
}

# API — single instance (in-process cron schedulers must not double-fire). Brief blip
# absorbed by nginx's proxy_next_upstream + client retries; keep it first so the web
# rollout below is the last thing to settle.
systemctl restart toolswave-api
wait_up http://127.0.0.1:4101/v1/health 60

# WEB — rolling: restart A, wait healthy (B still serving), then restart B (A serving).
# nginx (upstream tw_web 4100+4102) never has zero live backends → no dropped requests.
systemctl restart toolswave-web
wait_up http://127.0.0.1:4100/ 40
systemctl restart toolswave-web2
wait_up http://127.0.0.1:4102/ 40

systemctl is-active toolswave-api toolswave-web toolswave-web2
# Confirm the public-facing nginx fronts are healthy end-to-end.
echo -n "front web  4090 -> "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4090/
echo -n "front api  4091 -> "; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4091/v1/health
REMOTE

echo "==> deployed."
