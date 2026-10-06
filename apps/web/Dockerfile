# Larkwave Web image (Next.js standalone). Build context = repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE=... -t toolswave-web .
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE=https://apia.toolswave.net/v1
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm --filter @larkwave/shared build \
 && pnpm --filter web build

# Next.js standalone output (monorepo layout)
FROM base AS runtime
ENV NODE_ENV=production PORT=4100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 4100
CMD ["node", "apps/web/server.js"]
