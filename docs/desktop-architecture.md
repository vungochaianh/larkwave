# Toolswave Web + Desktop — kiến trúc dùng chung & cách sync

> **Larkwave:** tài liệu này kế thừa từ Toolswave (trước khi tách). Những phần nói về dựng app
> (codegen, build, deploy app, cửa hàng, blog…) KHÔNG còn áp dụng — xem [TACH-APP.md](TACH-APP.md).

Mục tiêu: **một codebase, hai vỏ** (web + desktop), giao diện y hệt, nhưng desktop
chạy codegen bằng **Claude CLI cục bộ** (chi phí ≈ 0 cho Toolswave).

## Sơ đồ phụ thuộc

```
@larkwave/core   ← hợp đồng (RuntimeAdapter, BuildEvent, AppMode…)  [không phụ thuộc gì]
        ▲
@larkwave/ui     ← TOÀN BỘ React + AntD + Tailwind (Composer, ModeSelector, BuildProgress)
        ▲                 + WebRuntimeAdapter (tham chiếu)
   ┌────┴─────────────────────────┐
apps/web (Next 16)          apps/desktop (Nextron)
  WebRuntimeAdapter           renderer: IpcRuntimeAdapter ──IPC──► main: LocalRuntimeAdapter
  → apia.toolswave.net                                              → Claude CLI + vite preview
```

**Quy tắc vàng:** UI chỉ gọi `useRuntime()` (một `RuntimeAdapter`). Không có
`if (desktop)` trong UI. Đổi nền tảng = đổi adapter ở `_app`.

## Sync / bảo trì song song (câu trả lời chính)

- **Sửa giao diện 1 lần** trong `packages/ui` → cả web lẫn desktop đổi theo. Không
  còn cảnh lệch nhau như trước.
- **Sửa logic chung** (kiểu dữ liệu, mode) → `packages/core`.
- **Khác biệt nền tảng** bị nhốt gọn trong **2 file adapter** (web fetch vs CLI local).
  Muốn thêm tính năng mới: thêm method vào `RuntimeAdapter` (core) → cài đặt ở cả
  2 adapter → UI dùng ngay. TypeScript bắt lỗi nếu một bên quên cài đặt.
- **Phiên bản**: cùng repo, cùng PR. CI build web (như cũ) + có job riêng `pnpm
  --filter @larkwave/desktop dist` đóng gói `.dmg/.exe`.

## Chi phí (vì sao desktop rất rẻ)

`apps/desktop/main/runtime/claudeRunner.ts` spawn `claude -p … --output-format
stream-json --permission-mode <mode>`. Codegen chạy trên **máy người dùng**, dùng
**gói Claude của họ** → Toolswave **không trả tiền token**. Server chỉ còn lo deploy.

## "Modes" dễ nhận diện

`ModeSelector` (GUI) thay cho việc bấm phím cycle mode trong TUI:
| Nút | Claude permission-mode | Ý nghĩa |
|---|---|---|
| Lên kế hoạch | `plan` | đọc + đề xuất, chưa sửa |
| Hỏi trước | `default` | hỏi trước mỗi thay đổi |
| Tự build | `acceptEdits` | tự áp dụng, nhanh nhất |

## Preview app (mobile + desktop)

`main/runtime/preview.ts` chạy `vite dev` cục bộ cho app vừa sinh → nạp URL vào
Electron BrowserView. Desktop = cửa sổ thường; mobile = khung kích thước điện thoại
(responsive). Preview tức thì, không cần deploy Cloudflare.

## Chạy thử

```bash
pnpm install
# Desktop (cần đã cài + đăng nhập `claude` CLI trên máy):
pnpm --filter @larkwave/desktop dev
# Web (như cũ):
pnpm --filter web dev
```

## Migration web → dùng chung UI (làm dần, không vỡ web)

1. `apps/web/_app`/`providers`: bọc `<RuntimeProvider runtime={new WebRuntimeAdapter(API_BASE, getToken)}>`.
2. Thêm route demo (vd `/studio`) render `<Composer/>` từ `@larkwave/ui` → web chạy UI chung.
3. Rút dần các component dùng chung khác vào `packages/ui`.

### ✅ BLOCKER đã GỠ (2026-06-21) — desktop đồng bộ React 19, web share UI thật

Trước đó: desktop (React 18 / Next 14) chung pnpm workspace với web (React 19 /
Next 16) làm `next build` của web hỏng type-check (`LayoutConfig`, `Card` JSX) — chỉ
do **sự hiện diện** của desktop nhiễu resolution; `overrides`/`dedupe-peer-dependents`
KHÔNG đủ.

**Cách đã làm (option 1 — đồng bộ React):** nâng desktop lên **React 19.2.4 + Next
15.5 + antd 5.29.3** (khớp web) + thêm `@ant-design/v5-patch-for-react-19` ở renderer
`_app`. Một phiên bản React/AntD duy nhất → hết nhiễu.

**Đã kiểm chứng cả hai:**
- Web `next build` **PASS sạch** kể cả khi import `@larkwave/ui` — route `/studio`
  render `<Composer/>` chung qua `WebRuntimeAdapter` (44/44 static pages).
- Desktop `.dmg` build OK trên Next 15/React 19; cửa sổ render **0 lỗi React** (CDP).

→ Web + desktop **dùng chung code `@larkwave/ui` thật sự**.

**Đã hoàn tất (2026-06-21):** trang composer chính của web (`apps/web/src/app/(builder)`)
giờ render thẳng `<Composer/>` chung — KHÔNG còn `CreateBar` riêng. `Composer` đã đủ
control như web: model (web) / Claude modes (desktop) theo `runtime.kind`, ColorPicker,
style, sáng/tối + ngôn ngữ, nhóm tính năng, sao chép URL, **đính kèm ảnh** (qua
`RuntimeAdapter.uploadAttachment`). Hành vi cắm-được: `onResult(appId,buildId)` cho web
điều hướng vào project / desktop preview tại chỗ; `onQuota` đẩy web sang `/pricing`.
`WebRuntimeAdapter` map đủ field + upload `/uploads`; desktop `LocalRuntimeAdapter` nhét
màu/style/theme/ngôn ngữ/tính năng vào prompt Claude. Sửa Composer 1 lần ở `packages/ui`
→ cả web `/` lẫn desktop đổi theo. (`CreateBar` cũ còn trong file nhưng không dùng — xoá
sau khi yên tâm.)

## Lưu ý khi deploy

- **Đừng cài deps của desktop trên server API/web.** Dùng filter:
  `pnpm install --filter "!@larkwave/desktop"` cho deploy server (tránh tải Electron).
- Desktop build (`dist`) **không** nằm trong `pnpm -r build` (script tên `dist`,
  không phải `build`) → pipeline deploy hiện tại không bị ảnh hưởng.
- Đóng gói phát hành cần **code-signing** (macOS notarize / Windows cert).

## Cần hardening trước khi production (đã scaffold, còn TODO)

- `claudeRunner`: map stream-json kỹ hơn (tool results, lỗi, cost); cân nhắc dùng
  **Claude Agent SDK** thay spawn CLI.
- Sandbox tiến trình build app sinh ra (giống server: `--include=dev`, cách ly env).
- Phát hiện/cài Claude CLI tự động + fallback API key.
- Lưu app cục bộ (`userData/apps`) + đồng bộ tuỳ chọn lên tài khoản Toolswave.
