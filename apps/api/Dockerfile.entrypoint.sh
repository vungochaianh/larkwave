#!/bin/sh
# Container entrypoint: sync schema + seed (idempotent), then run the API.
set -e
cd /app/apps/api
echo "[entrypoint] prisma db push"
pnpm exec prisma db push --skip-generate --schema=prisma/schema.prisma || echo "[entrypoint] db push skipped"
echo "[entrypoint] seed"
node dist/seed.js || echo "[entrypoint] seed skipped"
echo "[entrypoint] starting API"
exec node dist/main.js
