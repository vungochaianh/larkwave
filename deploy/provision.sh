#!/usr/bin/env bash
# Toolswave App Builder — one-time server provisioning (run as root).
# Creates a non-privileged `app` user, an ISOLATED Postgres container, and the
# working directories. Does NOT touch any existing service, port, or vhost.
#
#   TW_DB_PASSWORD=... bash deploy/provision.sh
set -euo pipefail

APP_USER=app
APP_HOME=/home/${APP_USER}
APP_DIR=${APP_HOME}/toolswave
PG_PORT=5433
PG_PASS="${TW_DB_PASSWORD:?set TW_DB_PASSWORD}"

echo "==> 1) app user (no sudo)"
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  echo "created user $APP_USER"
fi
mkdir -p "$APP_DIR" "$APP_DIR/.workspace" "$APP_DIR/.artifacts"
chown -R "$APP_USER:$APP_USER" "$APP_HOME"

echo "==> 2) corepack / pnpm"
corepack enable 2>/dev/null || true

echo "==> 3) isolated Postgres container (127.0.0.1:${PG_PORT}, separate from any existing db)"
if ! docker ps -a --format '{{.Names}}' | grep -qx 'tw-postgres'; then
  docker run -d --name tw-postgres --restart unless-stopped \
    -e POSTGRES_USER=toolswave \
    -e POSTGRES_PASSWORD="$PG_PASS" \
    -e POSTGRES_DB=toolswave \
    -v tw-pgdata:/var/lib/postgresql/data \
    -p 127.0.0.1:${PG_PORT}:5432 \
    postgres:16-alpine
  echo "started tw-postgres"
else
  echo "tw-postgres already exists"
fi

echo "==> provision complete. App dir: $APP_DIR"
