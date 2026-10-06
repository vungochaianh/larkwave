#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Larkwave — build & release (run as the `app` user from repo root).
# Installs deps, builds shared+api(+web), syncs the DB schema, seeds admin.
# Restarting systemd services is done separately by root (see deploy/README).
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"
echo "==> repo: $(pwd)"

# load env (DATABASE_URL etc.) without shell-expanding values
set -a; [ -f .env ] && . ./.env; set +a

corepack prepare pnpm@9.15.9 --activate 2>/dev/null || true

echo "==> pnpm install"
# .env (sourced above) sets NODE_ENV=production, which makes pnpm SKIP
# devDependencies — but the build needs them (tsc, nest CLI). --prod=false forces
# devDeps to install regardless. (This was the root cause of build: `tsc: not found`.)
# NOTE: do NOT `rm -rf node_modules` here — the live API resolves runtime deps from
# node_modules and an in-flight build can MODULE_NOT_FOUND during reinstall. pnpm's
# install is idempotent; --prod=false reconciles devDeps without wiping the tree.
pnpm install --no-frozen-lockfile --prod=false

echo "==> build shared"
pnpm --filter @larkwave/shared build

# @larkwave/core must be built too: the web bundles the shared UI (@larkwave/ui),
# whose account/api.ts imports @larkwave/core → without core's dist the web's
# `next build` fails with "Can't resolve '@larkwave/core'".
echo "==> build core"
pnpm --filter @larkwave/core build

echo "==> prisma: generate + push schema"
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma db push --skip-generate

echo "==> build api"
pnpm --filter api build

echo "==> seed admin + default config"
node apps/api/dist/seed.js

# web is optional at this stage (built once the frontend exists). Once it exists,
# a FAILED build must ABORT the deploy — do NOT swallow it: ci-deploy.sh restarts
# toolswave-web unconditionally, so a swallowed failure would restart the service
# over a stale .next bundle (rsync excludes .next) = silent UI regression/outage.
# With `set -e`, a non-zero build here stops ci-deploy BEFORE the restart, leaving
# the previous (working) deployment running.
if [ -f apps/web/package.json ] && grep -q '"build"' apps/web/package.json; then
  echo "==> build web"
  pnpm --filter web build
  # Next.js standalone needs static/public copied into the bundle
  SA=apps/web/.next/standalone/apps/web
  rm -rf "$SA/.next/static" && cp -r apps/web/.next/static "$SA/.next/static"
  [ -d apps/web/public ] && cp -r apps/web/public "$SA/public" || true
  echo "==> web standalone ready ($SA/server.js)"
fi

echo "==> deploy build complete"
