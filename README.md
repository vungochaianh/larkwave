# Larkwave

**AI agent làm việc thật trong Lark.** Màn Lark × Agents cho bạn chat với một agent đang cầm phiên
Lark web của chính bạn. Agent đọc và ghi Base, Sheet, Doc, Drive; tạo automation/workflow (để TẮT cho
bạn tự bật); xuất tệp xlsx/docx/pdf; và chạy lịch tự động. Mỗi tab là một hội thoại kèm một trang Lark
riêng, và app hỗ trợ nhiều tài khoản Lark. Đi kèm có Trợ lý AI, Kỹ năng (kể cả Zalo/Gmail qua kỹ
năng), điều khiển từ xa.

## Tải và cài

| | Link |
|---|---|
| Trang tải (luôn là bản mới nhất) | <https://toolswave.net/larkwave> |
| macOS 0.1.22 (universal, tải thẳng) | <https://gitlab.com/api/v4/projects/83700259/packages/generic/larkwave-desktop/0.1.22/Larkwave-0.1.22-universal.dmg> |
| Windows | **chưa có**: máy Windows đang được bàn giao, xem [docs/may-phat-hanh-windows.md](docs/may-phat-hanh-windows.md) |
| Manifest phát hành (app và trang tải cùng đọc) | <https://toolswave.net/api/apps-release/larkwave> |
| Mọi bản cũ (registry) | <https://gitlab.com/deveris.vu/toolswave-desktop-release/-/packages> |

- **Cài lần đầu trên macOS:** bản cài ký ad-hoc, chưa notarize. Lần mở đầu macOS sẽ chặn: vào
  **Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Vẫn mở**.
- **Tài khoản:** dùng chung tài khoản Toolswave. App gọi `https://api.toolswave.net/v1`. Dữ liệu Lark
  của app Toolswave cũ được nhập tự động.
- **Cập nhật:** giao diện tự cập nhật (code-push) khi mở app. Đổi lõi thì app nhắc tải bản cài mới.

Larkwave tách từ Toolswave ngày 06/10/2026 và **không có** phần dựng app (phần đó ở Appwave). Chi
tiết: [docs/TACH-APP.md](docs/TACH-APP.md).

> **Làm việc với Claude Code:** mở session ngay trong thư mục này. Claude tự đọc
> [CLAUDE.md](CLAUDE.md), nơi ghi kiến trúc thật, lệnh, quy trình phát hành, **luật kiểm thử với Lark
> thật**, luật an toàn và các bẫy đã gặp. Mở lại phiên thì đọc
> [docs/ban-giao-phien.md](docs/ban-giao-phien.md) trước.

## Mã nguồn

- Mã nguồn mở, giấy phép [MIT](LICENSE): <https://github.com/vungochaianh/larkwave>.
- Bản làm việc chính (máy Mac ↔ Windows bàn giao qua đây): `https://gitlab.com/toolswave/larkwave` (riêng tư).
- Máy chủ (API + trang web) **không** nằm ở đây mà ở repo Toolswave `gitlab.com/toolswave/app`.

## Thành phần

```text
apps/
  desktop/    Nextron (Electron) — Lark × Agents, tự động hoá, kỹ năng, kết nối Zalo/Gmail, CMS Bitable
              sync, plugin; chạy trên CLI AI của máy (Claude/Codex/Gemini/Grok) hoặc API trực tiếp
packages/
  shared/     Kiểu dữ liệu dùng chung với API Toolswave
  core/       Hợp đồng RuntimeAdapter + kênh IPC + logic thuần
  ui/         Giao diện (LarkScreen, LarkChatShell, ZaloSyncPanel…)
scripts/      Phát hành (push-installers, push-renderer, win-release.ps1), kiểm thử khói, bàn giao
tw-lark-runner/  Bộ chạy lịch Lark 24/7 trên VM — CHƯA deploy từ repo này
tw-cms-keeper/   Giữ phiên Lark web cho CMS sync — CHƯA deploy từ repo này
tw-agent-host/   Phục vụ lượt Trợ lý AI được chia sẻ — CHƯA deploy từ repo này
cms-lark-sync/   Dịch vụ đồng bộ CMS ⇄ Bitable (độc lập, ngoài workspace)
deploy/          Script máy chủ thời Toolswave — KHÔNG dùng; máy chủ deploy từ toolswave/app
```

`apps/api` và `apps/web` (bản sao máy chủ Toolswave) đã gỡ khỏi repo ngày 19/10/2026.

## Kiểm tra nhanh

```bash
pnpm install
pnpm --filter @larkwave/shared build && pnpm --filter @larkwave/core build   # LUÔN trước desktop
pnpm --filter @larkwave/ui typecheck
pnpm --filter @larkwave/desktop typecheck:desktop
bash apps/desktop/test/run.sh
node scripts/check-duplicates.mjs
node scripts/check-toolswave-api.mjs      # mọi đường app gọi phải có trên API Toolswave
node scripts/handoff.mjs                  # đầu phiên: git / phiên bản / bản đang phát hành
```

## Phát hành

- **macOS** (chỉ máy Mac): bản cài lên GitLab registry (gói `larkwave-desktop`, project 83700259).
  Giao diện code-push qua Cloudflare Pages (`larkwave-desktop-renderer`). Từng bước ở
  [CLAUDE.md](CLAUDE.md) § Phát hành và [docs/code-push.md](docs/code-push.md).
- **Windows** (chỉ máy Windows): `scripts\win-release.ps1`, xem
  [docs/may-phat-hanh-windows.md](docs/may-phat-hanh-windows.md).
- Mọi script phát hành bị chặn bằng `ALLOW_DEPLOY=1`. Khoá không nằm trong repo.
