# Fix report — v1.0.208 → v1.0.209

Nguồn: `bugs/bug-version-v1.0.208-to-v1.0.209.md` (11 lỗi UI/UX + 3 lỗi logic).
Kết quả: **14/14 xử lý xong, typecheck sạch** (`packages/ui` + `apps/desktop` main & renderer). logic-3 làm phần UI + chính sách + tài liệu; phần vault mã-hoá phía backend ghi rõ là "staged" (nền tảng backend đã có sẵn 90%).

Cách làm: chạy workflow map 6 cụm để lấy kế hoạch chính xác + phát hiện file dùng chung, rồi sửa mạch lạc (AppShell/HomeScreen là hotspot → tự làm 1 lượt; các lỗi độc lập file giao workflow chạy song song).

---

## Lỗi UI/UX

### UI-1 — Modal "Phiên bản & thay đổi" trắng màn ở dark mode ✅
- **Nguyên nhân:** `VersionFooter.tsx` dùng màu sáng cứng (`#F6F5FE` nền, `#3A4256`/`#9AA3B5` chữ) → không đổi theo theme, panel sáng chói trong modal tối, chữ tối tàng hình. (Không phải crash JS.)
- **Sửa:** thay 5 hex cứng bằng token theme (`V.surfaceMuted`, `V.textSub`, `V.textFaint`, `V.borderSub`). File: `packages/ui/src/components/VersionFooter.tsx`.

### UI-2 — Gom menu thành nhóm "Vibe Coding" ✅
- Nhóm "Vibe Coding" (submenu): Tổng quan · App của tôi · Khám phá · Integrations · Kỹ năng. Nhóm "Lark" giữ nguyên. File: `packages/ui/src/components/AppShell.tsx` (`VIBE_NAV`, `TOP_NAV`, build menu IIFE).

### UI-3 — Trang chủ = dashboard thống kê; gộp home/App của tôi/Mẫu ✅
- "Tổng quan" (tw-composer → view `home`) giờ render `HomeOverview` — thống kê Vibe apps + Lark + CMS, feature-gated, mỗi ô bấm nhảy tới màn tương ứng. File mới: `packages/ui/src/components/HomeOverview.tsx`.
- Composer + lưới app + Mẫu gộp vào view `apps` ("App của tôi"). Workspace (tab app đang mở) chuyển hiển thị theo view `apps` (đã đổi ĐỒNG BỘ các guard visibility + `openTab/goCompose/activateTab/reopenTab/keydown` từ `home`→`apps` để KHÔNG unmount build/preview đang chạy). File: `HomeScreen.tsx`.

### UI-4 — Trang Cài đặt full-width, lưới 2 cột xen kẽ ✅
- Bỏ cap 820px → full width (max 1280, canh giữa); header full-width trên lưới; 2 card ngắn (API Keys + SaveLocation) 1 hàng 2 cột, 2 panel cao (Runners, RemoteControl) mỗi cái 1 hàng full (`gridColumn:1/-1`); matchMedia < 900px → 1 cột. File: `SettingsScreen.tsx`.

### UI-5 — Nút "Báo lỗi" lên header ✅
- `FeedbackButton` thêm prop `variant='header'` (nút text + Tooltip) thay FAB nổi. AppShell thêm slot `headerExtra` cạnh nút sáng/tối; HomeScreen truyền FeedbackButton vào đó, bỏ FAB cũ. Files: `FeedbackButton.tsx`, `AppShell.tsx`, `HomeScreen.tsx`.

### UI-6 — "Bạn bè" vào Hồ sơ ✅
- ProfileView thêm card "Bạn bè của tôi (n)" (danh sách đã kết bạn từ `accountApi.friends()`, có Nhắn tin + Xoá). File: `account/ProfileView.tsx`.

### UI-7 — Khám phá gộp Người dùng + Xếp hạng ✅
- ExploreView thành Tabs: App cộng đồng · Người dùng (`FriendsView`) · Xếp hạng (`LeaderboardView`). Tiện thể sửa hex cứng dark-mode trong FriendsView/LeaderboardView. Files: `account/ExploreView.tsx`, `FriendsView.tsx`, `LeaderboardView.tsx`.

### UI-8 — Hồ sơ + Gói = 1 trang, lịch sử = modal ✅
- ProfileView render `PricingView` như một mục → Hồ sơ + Bạn bè + Gói là một trang. PricingView: bảng "Lịch sử thanh toán" chuyển thành **Modal** (nút "Lịch sử thanh toán"). Files: `account/ProfileView.tsx`, `account/PricingView.tsx`.

### UI-9 — Bỏ trang Quản trị khỏi desktop ✅
- Xoá toàn bộ `packages/ui/src/account/admin/` (18 file) + gỡ dây ở HomeScreen (import, AccountView union, VIEW_BY_KEY/KEY_BY_VIEW, render, prop `adminNav`) + AppShell (prop `adminNav`, nav item `tw-admin`, `SafetyOutlined`). Gate CMS (`role==='admin'` / allowlist) giữ nguyên — độc lập với admin UI.

### UI-10 — Sidebar giới hạn 5 + icon ghim ✅
- SidebarRecent thành danh sách phẳng: **ghim trước → mới nhất, cap 5** (ghim luôn hiện), mỗi dòng có nút Ghim (Pushpin), + "Xem tất cả (N) →" mở "App của tôi". Pin lưu per-máy trong `convCategories` (`pinned` + `togglePin`/`isPinned`). Thư mục/kéo-thả chuyển hẳn sang lưới "App của tôi". Files: `AppShell.tsx`, `convCategories.ts`.

### UI-11 — Thẻ Integrations lệch content ✅
- Card equal-height flex-column, mô tả `flex:1`, nút "Hướng dẫn" `marginTop:auto` (thẳng hàng); logo chip `#fff`→`V.surface` (dark-mode). File: `account/IntegrationsView.tsx`.

---

## Lỗi logic

### logic-1 — "Nhập từ thư mục" không mở được hộp chọn ✅
- **Nguyên nhân:** `pickDialogParent()` chỉ nhận cửa sổ chính khi URL là `app://` (bản đóng gói); ở dev là `http://localhost/home` nên trượt sang "cửa sổ visible đầu tiên" — có thể là cửa sổ Lark/OAuth ẩn. Bản 1.0.207 dùng dialog **không parent** → trên macOS render sau cửa sổ đang focus → "quay hoài".
- **Sửa:** `isMain` nhận thêm URL localhost kết thúc `/home`; `importLocalFolder` dùng dialog **có parent** (như `chooseAppLocation` vốn chạy được), fallback không-parent chỉ khi không tìm thấy. File: `apps/desktop/main/runtime/localAdapter.ts` (MAIN → cần .dmg mới).

### logic-2 — Skills cho cả Vibe Coding lẫn Lark ✅
- Thêm mục "Kỹ năng" riêng trong nhóm Vibe Coding (`tw-skills-vibe`, key riêng, cùng màn `SkillsScreen`); Lark giữ `tw-skills`. Sửa highlight khi 2 key cùng trỏ 1 view (`selKey`/`selectedKey`). Files: `AppShell.tsx`, `HomeScreen.tsx`.

### logic-3 — Chính sách tích hợp (làm phần UI + docs; vault backend staged) 🟡
- **Đã làm (UI + tài liệu):** IntegrationsView thêm **CHÍNH SÁCH TÍCH HỢP AN TOÀN** (Alert đầu trang + modal): dán khoá → mã hoá & lưu server (AES-256-GCM) → agent chỉ nhận **TÊN biến** (không thấy giá trị) → deploy thì server giải mã bơm vào app. Modal "Hướng dẫn" bổ sung mục "Cách kết nối" + "Dùng trong app" (tên biến env) + nhắc bảo mật. File: `account/IntegrationsView.tsx`.
- **Staged (backend vault — cần làm riêng, an ninh trọng yếu):** nền tảng đã có sẵn 90% ở `apps/api`: `common/secret-crypto.ts` (AES-256-GCM), `apps/apps.service.ts` `getSecrets/setSecrets` (App.secretsEnc), `pipeline.service.ts` giải mã & bơm env lúc deploy. Còn thiếu để thành "vault" đúng nghĩa: (1) API **write-only** (lưu xong chỉ trả 4 ký tự cuối/`connected`, không trả khoá thật — hiện `getSecrets` trả khoá cho owner); (2) **IntegrationCredential** cấp tài khoản (tái dùng cho nhiều app) hoặc dùng App.secretsEnc theo app; (3) codegen prompt truyền **tên biến** cho agent (kiểu `webhookHints`). Không gộp Settings + Integrations (khác gating: Settings desktop-only phase-gated, Integrations public + dùng chung web).

---

## Kiểm thử / phát hành
- Typecheck: `packages/ui` sạch; `apps/desktop` (main + renderer) sạch.
- Phát hành: renderer đổi nhiều → **code-push**; logic-1 là main → cần **.dmg 1.0.209** (đã build + boot harness).
- Changelog 1.0.209 đã ghi ở `packages/ui/src/changelog.ts` (mục "Phiên bản & thay đổi" trong app).

## Ghi chú
- Admin UI xoá khỏi desktop; nếu cần quản trị dùng trang CMS/web.
- Web (`apps/web`) có route riêng cho profile/pricing/explore — bản này chỉ refactor UI desktop dùng chung; đồng bộ web là việc tiếp theo nếu muốn.
