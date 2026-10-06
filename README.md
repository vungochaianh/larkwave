# Toolswave App Builder

Nền tảng **prompt → app**: người dùng nhập một câu mô tả, hệ thống tự phân loại, sinh code, build, và **deploy ra link công khai** — kèm quản lý người dùng, app, build, deployment ở quy mô nhiều.

- **Web app** → build (Vite + React + TS) và deploy lên **Cloudflare Pages**, trả link `https://<slug>.pages.dev` + QR.
- **Mobile app** → sinh dự án **Expo** (React Native) + hướng dẫn chạy bằng Expo Go (QR).
- **Extension / khác** → sinh source + đóng gói ZIP + `HUONG-DAN-CAI-DAT.md` đầy đủ 6 phần.

## Kiến trúc (3 bề mặt, 1 hệ thống)

| Domain | Vai trò | Stack |
|---|---|---|
| `apia.toolswave.net` | API orchestrator | **NestJS** + Prisma + PostgreSQL |
| `app.toolswave.net` | Builder (người dùng) | **Next.js** App Router + Ant Design + Tailwind |
| `aapp.toolswave.net` | Admin / CMS | cùng app Next.js, host-routed, gated theo role |

```
apps/
  api/      NestJS — auth(JWT/bcrypt/roles), users, apps, builds, deployments,
            settings, audit, health; pipeline 6 giai đoạn + SSE; engine
            (Anthropic codegen, Cloudflare Pages, build-runner, QR, GitLab)
  web/      Next.js — builder (prompt → pipeline trực tiếp → kết quả), My Apps,
            admin dashboards (users/apps/builds/deployments/settings/audit)
packages/
  shared/   Hợp đồng dùng chung (types/DTO/enums/SSE/config) cho cả API & web
deploy/     provision/deploy scripts, systemd units, tunnel + CI deploy
```

Dữ liệu (Prisma/PostgreSQL): `User → App → Build → Deployment`, `AuditLog`, `Setting`.
Mỗi user sở hữu nhiều app; mỗi app có lịch sử build; mỗi build thành công tạo một deployment có phiên bản.

## Pipeline 6 giai đoạn

`intake` (phân loại track) → `spec` (đặc tả) → `codegen` (sinh file qua tool-use, có scaffold đảm bảo build) → `build` (npm install + build, **tự sửa lỗi** tối đa N lần) → `preview` → `deploy` (Cloudflare Pages, tạo record Deployment, cập nhật app). Tiến trình stream realtime tới UI qua **SSE**.

## Chạy local (Docker)

```bash
cp deploy/.env.production.example .env   # điền secrets
DB_PASSWORD=devpass docker compose up -d --build
# web:  http://localhost:4100    api: http://localhost:4101/v1/health
```

## Chạy local (không Docker)

```bash
pnpm install
pnpm --filter @larkwave/shared build
# Postgres: docker run -d --name tw-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=toolswave -p 5433:5432 postgres:16-alpine
# .env: DATABASE_URL=postgresql://postgres:dev@127.0.0.1:5433/toolswave?schema=public + secrets
pnpm --filter api exec prisma db push && node apps/api/dist/seed.js   # sau khi build api
pnpm --filter api start:dev      # API :4101
pnpm --filter web dev            # Web :3000
```

## Deploy production

Xem [docs/OPERATIONS.md](docs/OPERATIONS.md). Tóm tắt: Postgres (container cô lập) + 2 systemd service (`toolswave-api`, `toolswave-web`) + 3 hostname qua Cloudflare Tunnel sẵn có.

## CI/CD

[.gitlab-ci.yml](.gitlab-ci.yml): `build → test → deploy(manual, main)`. Kích hoạt bằng
`GITLAB_API_TOKEN=glpat-... bash deploy/gitlab-bootstrap.sh` (cần token có scope `api`).

## Bảo mật

Helmet, CORS allowlist, rate-limit (throttler), JWT + bcrypt, RBAC (admin/user), validation (class-validator), secret chỉ ở env/CI variables — không bao giờ trong code. **Đổi (rotate) mọi token từng dán ở nơi không an toàn.**

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/OPERATIONS.md](docs/OPERATIONS.md)
