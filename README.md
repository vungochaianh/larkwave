# Larkwave

Larkwave là bản **Lark-only** tách từ Toolswave: làm việc với Lark/Feishu bằng AI, cộng Trợ lý AI,
nhưng **không có** phần dựng app (codegen/build/deploy/cửa hàng/blog/Developer API).
Chi tiết về việc tách, những gì giữ/bỏ và việc còn phải làm ở phase deploy: [docs/TACH-APP.md](docs/TACH-APP.md).

## Thành phần

```
apps/
  api/        NestJS + Prisma (Postgres) — tài khoản, gói & SePay, MAIC (Claude hosted), Trợ lý AI,
              kỹ năng, tác vụ định kỳ, artifacts, tệp, relay desktop (điều khiển từ xa), chia sẻ Lark,
              backup Lark, Larkwave chạy hộ, cộng đồng/bạn bè/tin nhắn, báo lỗi, admin
  web/        Next.js — trang công khai, /agents-chat (Trợ lý AI), /remote/* (điều khiển máy desktop,
              Lark × Agents qua relay), hồ sơ/gói/dung lượng/báo lỗi, admin (cms.)
  desktop/    Nextron (Electron) — Lark × Agents, tự động hoá, Đặc tả, kỹ năng, CMS Bitable sync,
              plugin, chạy trên CLI AI của máy (Claude/Codex/Gemini/Grok) hoặc API trực tiếp
packages/
  shared/     Hợp đồng API ↔ web (types/DTO)
  core/       Hợp đồng RuntimeAdapter + IPC cho ui ↔ desktop/web
  ui/         Giao diện dùng chung web + desktop
tw-lark-runner/  Bộ chạy lịch Lark 24/7 trên VM (bundle từ apps/desktop/main/runtime/lark)
tw-cms-keeper/   Giữ phiên Lark web cho CMS sync
tw-agent-host/   Phục vụ lượt Trợ lý AI được chia sẻ
cms-lark-sync/   Dịch vụ đồng bộ CMS ⇄ Bitable (độc lập, ngoài workspace)
```

## Kiểm tra nhanh

```bash
pnpm install
pnpm --filter @larkwave/shared build && pnpm --filter @larkwave/core build
pnpm --filter api exec prisma generate
pnpm --filter api typecheck && pnpm --filter api test -- --passWithNoTests
pnpm --filter @larkwave/ui typecheck
pnpm --filter @larkwave/desktop typecheck:desktop && bash apps/desktop/test/run.sh
(cd apps/web && npx tsc --noEmit -p .) && pnpm --filter web build
node scripts/check-duplicates.mjs
```

Các kịch bản deploy/phát hành vẫn trỏ hạ tầng Toolswave và bị chặn bằng `ALLOW_DEPLOY=1`.
