#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Server-Deploy Kit — deploy a full-stack project (docker compose) to a server and
# expose each service at a *.toolswave.net subdomain via nginx + a Cloudflare tunnel.
# Run from the PROJECT ROOT (the folder with docker-compose.yml + deploy.config.sh):
#   bash server-kit/deploy.sh
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"

[ -f "$ROOT/deploy.config.sh" ] || {
  echo "Missing deploy.config.sh — copy server-kit/deploy.config.example.sh to ./deploy.config.sh and edit." >&2
  exit 1
}
[ -f "$ROOT/docker-compose.yml" ] || {
  echo "Missing docker-compose.yml at project root (see server-kit/docker-compose.example.yml)." >&2
  exit 1
}
# shellcheck disable=SC1091
source "$ROOT/deploy.config.sh"

: "${SERVER:?set SERVER}" "${REMOTE_DIR:?set REMOTE_DIR}" "${PROJECT:?set PROJECT}" "${TUNNEL_ID:?set TUNNEL_ID}"
SSH=(ssh -o StrictHostKeyChecking=accept-new)

echo "==> [1/6] sync project → $SERVER:$REMOTE_DIR"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude 'dist' \
  --exclude '__pycache__' --exclude 'venv' --exclude '.DS_Store' \
  "$ROOT/" "$SERVER:$REMOTE_DIR/"

echo "==> [2/6] check host ports are free (or owned by this project)"
for r in "${ROUTES[@]}"; do
  port="${r##*:}"
  owner=$("${SSH[@]}" "$SERVER" "docker ps --format '{{.Names}} {{.Ports}}' | grep -E ':$port->' | awk '{print \$1}' | head -1" || true)
  if [ -n "$owner" ] && [[ "$owner" != ${PROJECT}* ]]; then
    echo "   ⚠ port $port is used by container '$owner' (another app). Pick a free port in deploy.config.sh." >&2
    exit 1
  fi
done

echo "==> [3/6] docker compose build + up (project: $PROJECT)"
"${SSH[@]}" "$SERVER" "cd $REMOTE_DIR && docker compose -p $PROJECT build && docker compose -p $PROJECT up -d"

echo "==> [4/6] nginx vhost per subdomain"
for r in "${ROUTES[@]}"; do
  sub="${r%%:*}"; port="${r##*:}"
  sed -e "s/__SUBDOMAIN__/$sub/g" -e "s/__PORT__/$port/g" "$KIT/nginx/app.conf.template" \
    | "${SSH[@]}" "$SERVER" "cat > /etc/nginx/sites-enabled/$sub.conf"
  echo "   • $sub.toolswave.net → 127.0.0.1:$port"
done

echo "==> [5/6] cloudflare tunnel DNS routes + reload nginx"
for r in "${ROUTES[@]}"; do
  sub="${r%%:*}"
  # Idempotent: creates the CNAME to the tunnel (uses the tunnel cert; works even
  # if the API token can't write DNS). Ignored if it already exists.
  "${SSH[@]}" "$SERVER" "cloudflared tunnel route dns $TUNNEL_ID $sub.toolswave.net" || true
done
"${SSH[@]}" "$SERVER" "nginx -t && systemctl reload nginx"

echo "==> [6/6] done — live URLs:"
for r in "${ROUTES[@]}"; do echo "   https://${r%%:*}.toolswave.net"; done
