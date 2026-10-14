# Larkwave

**AI agent làm việc thật trong Lark.** Màn Lark × Agents cho bạn chat với một agent đang cầm phiên
Lark web của chính bạn. Agent đọc và ghi Base, Sheet, Doc, Drive; tạo automation/workflow (để TẮT cho
bạn tự bật); xuất tệp xlsx/docx/pdf; và chạy lịch tự động. Mỗi tab là một hội thoại kèm một trang Lark
riêng, và app hỗ trợ nhiều tài khoản Lark. Đi kèm có Trợ lý AI, Kỹ năng, điều khiển từ xa.

- **Tải bản macOS:** https://toolswave.net/larkwave (bản 0.1.3). Windows chưa có.
- **Tài khoản:** dùng chung tài khoản Toolswave. App gọi `https://api.toolswave.net/v1`. Dữ liệu Lark của
  app Toolswave cũ được nhập tự động.
- Larkwave tách từ Toolswave ngày 06/10/2026 và **không có** phần dựng app. Chi tiết:
  [docs/TACH-APP.md](docs/TACH-APP.md).

> **Làm việc với Claude Code:** mở session ngay trong thư mục này. Claude tự đọc
> [CLAUDE.md](CLAUDE.md), nơi ghi kiến trúc thật, lệnh, quy trình phát hành, **luật kiểm thử với Lark
> thật**, luật an toàn và các bẫy đã gặp.

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

Thêm `node scripts/check-toolswave-api.mjs` để kiểm mọi đường app gọi có trên API Toolswave.

## Phát hành

Bản cài lên GitLab registry (gói `larkwave-desktop`). Giao diện được code-push qua Cloudflare Pages
(`larkwave-desktop-renderer`). App và trang `/larkwave` cùng đọc `toolswave.net/api/apps-release/larkwave`.
Script phát hành chặn bằng `ALLOW_DEPLOY=1`. Từng bước: [docs/code-push.md](docs/code-push.md).

`apps/api` và `apps/web` ở đây là bản tách của máy chủ Toolswave, **không được deploy**. Desktop gọi API
Toolswave. Đừng `prisma db push` schema này vào DB Toolswave.
