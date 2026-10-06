# Roadmap — kéo các tính năng kiểu Claude về Toolswave

> **Larkwave:** tài liệu này kế thừa từ Toolswave (trước khi tách). Những phần nói về dựng app
> (codegen, build, deploy app, cửa hàng, blog…) KHÔNG còn áp dụng — xem [TACH-APP.md](TACH-APP.md).

> **✅ ĐÃ HOÀN TẤT CẢ 3 (2026-08-28) — đều kiểm chứng E2E:**
> - #1 Tác vụ định kỳ (Scheduled) → 1.0.270 — `/scheduled`, model `ScheduledTask`, in-process cron runner.
> - #2 Dự án (Projects) → 1.0.271 — `/projects`, `AgentChatProject.instructions` inject vào Trợ lý AI.
> - #3 Artifacts → 1.0.272 — `/artifacts` + public `/a/<slug>`, model `Artifact`.
> Nâng cấp còn để ngỏ: lưu artifact TRỰC TIẾP từ khung chat; tab "Được chia sẻ với tôi"; deliver
> Scheduled qua Telegram (hiện chỉ notification).
>
> Ghi lại 2026-08-27. Ba tính năng lớn muốn "kéo về" từ claude.ai: **Scheduled tasks**, **Projects**,
> **Artifacts**. Mỗi tính năng là một phiên làm riêng. Bản này ghi rõ hạ tầng ĐÃ CÓ để phiên sau bắt
> đầu nhanh, cùng kế hoạch theo giai đoạn + ước lượng công.
>
> Bối cảnh chung: Trợ lý AI hosted chạy qua **MAIC** (`GET /agent/maic/status` = {enabled:true};
> one-shot `POST /agent/maic-ask`; stream `POST /agent/maic-chat/run`). Skills server-side đã xong
> (xem `memory/toolswave-web-skills`). Có sẵn hệ **thông báo** (SSE, model `Notification`,
> `NotificationsService.notify`, @Global) + **Telegram report** + relay điều khiển từ xa.

---

## 1) Scheduled tasks — LÀM TRƯỚC (dễ nhất, tận dụng nhiều hạ tầng)

Giống claude.ai/scheduled-task: chạy Trợ lý AI theo lịch (cron) rồi giao kết quả. Mẫu Claude có:
Daily briefing, Inbox triage, Meeting prep, Weekly review, Content ideas, Monitor a topic.

**Hạ tầng đã có:**
- MAIC chạy AI server-side (không cần desktop) — `AgentService.maicAsk`.
- `NotificationsService.notify(userId, 'system', title, body, link)` (real-time SSE) để giao kết quả.
- Telegram report ([[toolswave-telegram-reports]]) nếu muốn đẩy ra nhóm.
- Cơ chế lịch đã từng làm cho Lark (time-schedule automation trigger, xem
  [[toolswave-lark-push-automation-0805]]) — tham khảo cách chạy định kỳ.

**Cần làm:**
- Model `ScheduledTask`: id, userId, name, prompt, schedule (cron string / preset), timezone,
  nextRunAt, lastRunAt, enabled, deliver ('notification' | 'telegram'), createdAt. (additive db push)
- Bộ chạy định kỳ trong api (một `@Interval`/cron trong Nest, hoặc scheduler service) quét
  `nextRunAt <= now && enabled` → gọi `maicAsk` với prompt → `notify()` (hoặc Telegram) → cập nhật
  next/lastRunAt. Chống chạy trùng (lock theo id).
- API CRUD `/scheduled-tasks` (+ "chạy ngay").
- Web: trang `/scheduled` (danh sách + "New task" + bộ mẫu giống Claude) + nav item.
- Lưu ý quota: mỗi lần chạy tốn token → meter qua `MaicUsageService`; tôn trọng gói (free giới hạn số task).

**Ước lượng:** ~1 phiên. **Rủi ro:** scheduler chạy trùng/timezone; cần test kỹ next-run.

---

## 2) Projects — VỪA (đã có sẵn model)

Giống claude.ai Projects: gom hội thoại + hướng dẫn riêng + file kiến thức cho từng dự án; Trợ lý AI
dùng ngữ cảnh của project.

**Hạ tầng đã có:**
- DB ĐÃ CÓ `AgentChatProject` + `AgentChatConversation` (quan hệ trên User: `agentChatProjects`,
  `agentChatConversations`). → Nền tảng gom hội thoại theo project đã có sẵn một phần.
- Skills server-side (có thể tái dùng làm "hướng dẫn/kiến thức" cấp project) + attachments.

**Cần làm:**
- Mở rộng `AgentChatProject`: thêm `instructions` (chỉ dẫn riêng), `knowledge`/attachments (file kiến
  thức, tái dùng shape của Skill.attachments).
- Khi chat trong 1 project → chèn instructions + knowledge của project vào system prompt (giống
  `enabledPromptBlock` của Skills).
- Web: trang `/projects` (danh sách) + trang project (hội thoại trong project + cài đặt chỉ dẫn + file).
- Nav item "Projects".

**Ước lượng:** ~1–1.5 phiên. **Rủi ro:** wiring ngữ cảnh project vào cả 2 đường (maicAsk + relay).

---

## 3) Artifacts — VỪA→LỚN

Giống claude.ai/artifacts: lưu lại các sản phẩm (code/HTML/tài liệu) Trợ lý AI tạo ra thành thư viện
(All / Của tôi / Được chia sẻ), xem lại + chia sẻ link + "New artifact".

**Hạ tầng đã có:**
- Trợ lý AI ĐÃ render artifact trong chat (khối ```html/svg/mermaid chạy trong iframe cách ly — xem
  AgentChat). → Nội dung artifact đã sinh ra; chỉ cần LƯU + quản lý.
- Cơ chế chia sẻ (LarkGrant/agentchat share, public routes + proxy PUBLIC_PATHS) để làm link công khai.

**Cần làm:**
- Model `Artifact`: id, userId, title, kind (html|code|markdown|svg), content, sourceConversationId?,
  visibility (private|shared|public), slug, createdAt, updatedAt.
- Lưu artifact: nút "Lưu" trên khối artifact trong chat → POST `/artifacts`.
- API CRUD + trang công khai `/a/[slug]` (thêm vào proxy PUBLIC_PATHS — nhớ gotcha
  [[toolswave-public-routes-blog]]).
- Web: trang `/artifacts` (lưới thẻ + tab All/Của tôi/Được chia sẻ + "New artifact") + nav item.

**Ước lượng:** ~1.5 phiên. **Rủi ro:** an toàn khi render HTML người dùng (đã có mẫu iframe sandbox
trong chat — tái dùng); phân quyền chia sẻ.

---

## Thứ tự đề xuất
1. **Scheduled tasks** (tận dụng MAIC + notifications + lịch sẵn có).
2. **Projects** (đã có model, gắn skills/knowledge).
3. **Artifacts** (lưu + thư viện + chia sẻ).

## Việc còn treo khác (đã ghi ở memory, không thuộc 3 cái trên)
- Build **installer Windows mới** (đang kẹt 1.0.207) — cần máy/CI Windows.
- **API giá công khai** để trang /pricing khách vãng lai không dùng catalog tĩnh (tránh lệch giá).
- Đồng bộ **Skills web ↔ desktop** (hiện desktop dùng SKILL.md cục bộ, web dùng server-side).
- i18n long-tail (admin screens, một số nav desktop).
