# Larkwave API image. Build context = repository root:
#   docker build -f apps/api/Dockerfile -t toolswave-api .
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── deps (cached on lockfile) ────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @larkwave/shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM build AS runtime
ENV NODE_ENV=production
COPY apps/api/Dockerfile.entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 4101
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
