# Tách Larkwave khỏi Toolswave

> Ngày tách: 06/10/2026, từ Toolswave @06680ca. Repo này KHÔNG chia sẻ mã nguồn với `/Users/deveris/app`
> (Toolswave) hay `/Users/deveris/appwave` (bản chỉ có phần dựng app) — mỗi bên tự sống.

## Larkwave là gì

Sản phẩm làm việc với Lark/Feishu bằng AI + Trợ lý AI, cùng màu sắc và giao diện với Toolswave:

- **Lark × Agents** (desktop): đăng nhập QR / custom app, chat AI đọc–ghi Bitable, Docs, Sheets, Wiki,
  Drive, Lịch, tin nhắn; đính kèm; xuất xlsx/docx/pdf/csv; mọi thao tác ghi hỏi xác nhận.
- Tự động hoá (lịch, bot/webhook, tunnel), **Larkwave chạy hộ** (`tw-lark-runner` + `LarkHostedRunner`),
  **Đặc tả**, kỹ năng + kỹ năng chéo + lệnh `/`, **CMS Bitable sync** nhiều tài khoản (`tw-cms-keeper`,
  `cms-lark-sync`), plugin, chia sẻ quyền (lark-grant) + hội thoại dùng chung, trang chia sẻ `/lark/s`,
  backup Lark.
- **Chung**: tài khoản/thiết bị/phiên, gói (% hạn mức token tháng) + SePay, MAIC, Trợ lý AI (`/agents-chat`:
  chat, dự án, artifacts `/a/<slug>`, tác vụ định kỳ, kỹ năng, kho tệp), chia sẻ hội thoại `/s/<slug>`,
  trợ lý công khai `/g/<slug>`, điều khiển từ xa (`/remote/*`, webhook, Telegram), `tw-agent-host`,
  cộng đồng/bạn bè/tin nhắn, thông báo, báo lỗi + thưởng tester, dung lượng, admin, telemetry runner,
  i18n VI/EN, tự cập nhật desktop (code-push), runner CLI cục bộ + API trực tiếp, quản lý key Claude.

## Đã gỡ

- **API**: module apps, builds, git, deployments, pipeline, engine (codegen), server-deploy, templates,
  store, public (showcase app + hồ sơ maker), automations (cron HTTP theo app — KHÔNG phải tự động hoá
  Lark), analytics, suggestions, api-keys (Developer API), leaderboard, video, picture, makeblog,
  marketing, delivery, media, category, blog, settings (cấu hình prompt/track codegen); model Prisma
  tương ứng + `Follow`; biến môi trường Cloudflare/GitLab/Docker-deploy/portal/ElevenLabs/Playwright.
- **Desktop main**: apiBuilder, appDb (sql.js), appShot, detectApp, preview, renderGuard, siteCapture,
  codegraph, promptCompose, slug; mọi kênh IPC builder; lệnh bot Lark `/run` (dựng app trên máy).
- **UI**: AppWorkspace, Composer, AppsGrid, các pane Preview/Code/DB/API, Workspace*, mẫu prompt, nhập
  Git/thư mục, đồng bộ app lên điện thoại, Khám phá, Xếp hạng, Integrations, console app; nút "Dựng app
  từ phân tích" trong Lark; nút "Tạo ảnh PNG" (render máy chủ bằng Playwright); gợi ý CodeGraph.
- **Web**: create-website, apps, templates, import, integrations, studio, explore, app/[slug], store,
  api (console), leaderboard, blog, u/[handle]; admin apps/builds/build-errors/deployments/store/
  suggestions/blog/settings/moderation; component builder tương ứng.
- **Gốc repo**: `_reference/`, `content/`, blog-brand/topics, bugs/fix-bugs, kịch bản blog/SEO/video/
  store/app-deploy/diagnose-build/site-check/đổi tên miền, `deploy/app-proxy`, apps-tunnel, server-kit,
  tài liệu builder; `background.js`/`preload.js` build cũ commit nhầm trong `apps/desktop`.

## Quyết định khi cắt

- **AnthropicService** → `apps/api/src/ai-keys/anthropic.service.ts`, chỉ giữ `complete()` (trợ lý trợ
  giúp dự phòng + phân loại báo lỗi). `ANTHROPIC_API_KEY` nay tuỳ chọn.
- **Đăng nhập GitLab/GitHub** → `apps/api/src/auth/oauth-providers.service.ts` (chỉ consent/đổi code/hồ
  sơ). KHÔNG lưu token provider nữa (bỏ cột `gitlabToken`, `githubToken`, refresh). GitLab vẫn xin scope
  `api` vì app OAuth dùng chung chỉ được cấp scope đó — đổi sang `read_user` khi Larkwave có app OAuth
  riêng. GitHub chỉ xin `read:user user:email`. Callback trả về `/auth/callback` (không còn `/import`).
- **Tác vụ từ xa** (điện thoại/webhook/Telegram): trước là build app; nay desktop chạy MỘT lượt Trợ lý AI
  `scope:'general'`, chế độ **chỉ đọc** (`ask`); thao tác ghi bị từ chối tự động, câu hỏi `ask_user` được
  trả lời mặc định. Bỏ `appId`, đồng bộ danh sách app.
- **Gamification**: bỏ XP/cấp độ/bảng xếp hạng (tính từ app/build). Huy hiệu thành tựu dựng lại trên
  hoạt động AI (lượt AI, kỹ năng, artifacts, tác vụ từ xa/định kỳ, chuỗi ngày) + giữ huy hiệu tester.
  Web dùng `AchievementsCard` của `@larkwave/ui`.
- **Thống kê**: `MeOverview`, biểu đồ hoạt động, báo cáo admin (`AdminReport.byKind`), tóm tắt hỗ trợ
  người dùng, dung lượng (chỉ còn tệp tải lên + hội thoại) tính từ `MaicUsage`/`RemoteTask`.
- **Thưởng giới thiệu**: trước trả khi người được giới thiệu build thành công; nay trả một lần khi họ
  kích hoạt gói trả phí đầu tiên (`PaymentsService.settle` → `rewardReferrerOnce`).
- **Gói**: viết lại theo Lark/AI; bỏ `maxLiveApps`, `serverDeploy`, `maxServerServices`, `modelCredits`.
- **`/a/[slug]`** (Artifacts công khai), **`/s/[slug]`**, **`/g/[slug]`** là COMMON — giữ. **Integrations**
  (danh mục tích hợp cho app sinh ra + nhập Git) là APP — gỡ. **Module `public`** chỉ phục vụ showcase app
  và hồ sơ maker — gỡ cả `u/[handle]` và Follow. **AntiClone** (chống sao chép website) là COMMON — giữ.
- `larkBaseSnapshot` (đọc nhanh cấu trúc Base) vẫn giữ trong runtime/relay dù nút "Dựng app từ phân tích"
  đã gỡ — là năng lực đọc Lark, không phải builder.
- Tên nội bộ còn mang dấu vết lịch sử nhưng không phải builder: kiểu `BuildEvent`/`BuildStatus` (luồng sự
  kiện của runner CLI), chế độ Lark `'ask' | 'build'` (= được ghi), `window.toolswave` (bridge preload),
  nhóm route `(builder)` của Next.js, kênh IPC tiền tố `tw:`.
- i18n: thêm khoá `.lw` cho câu viết lại; dọn 1515 khoá không còn được tham chiếu. changelog lọc bỏ mục
  chỉ nói về dựng app (giữ số phiên bản 1.0.348).

## Chưa kiểm được khi không chạy app

- Chưa chạy Electron, API thật, DB thật hay trình duyệt: mọi kiểm chỉ là typecheck, build, unit test.
- Tác vụ từ xa chạy bằng `larkChat` chưa thử end-to-end (relay → desktop → kết quả về điện thoại).
- Trang công khai/landing viết lại chưa xem bằng mắt; `/public/og.png` tĩnh có thể vẫn là ảnh cũ
  (`opengraph-image.tsx` đã đổi).
- `tw-lark-runner` bundle dựng được bằng esbuild 0.17 có sẵn trong workspace (package khai ^0.24, chưa
  `npm install` riêng); đầu ra để ngoài repo.
- Schema Prisma đã đổi mạnh (bỏ bảng, bỏ cột) — dùng DB MỚI, không `db push` lên DB Toolswave.

## Phase deploy còn phải làm

1. **Tên miền**: `lark.toolswave.net` (web), API (vd `api.lark.toolswave.net`), admin (`cms.` tương ứng);
   sửa `APIA_BASE` mặc định (`packages/core/src/index.ts`), `NEXT_PUBLIC_API_BASE`, `CORS_ORIGINS`,
   `WEB_PUBLIC_URL`, `PUBLIC_API_URL`, `SITE` trong trang công khai, `ALLOWED_HOSTS` (proxy.ts), AntiClone.
2. **DB mới** Postgres `larkwave` + `prisma db push` + `db:seed`; secrets mới (`JWT_SECRET`, `LARK_CREDS_KEY`,
   `LARK_RUNNER_SERVICE_KEY`, MAIC token riêng nếu có).
3. **Kênh phát hành desktop**: `LARKWAVE_RELEASE_URL` + project Pages renderer riêng; appId
   `net.toolswave.larkwave`, scheme `larkwave://`; ký/notarize macOS, bản Windows.
4. **OAuth**: đăng ký callback Google/GitLab/GitHub cho domain API mới (hoặc app OAuth riêng); SePay
   webhook trỏ API mới; Telegram bot riêng (hoặc gỡ webhook khỏi bot Toolswave).
5. **Kịch bản đã chặn bằng `ALLOW_DEPLOY=1`** (deploy.sh, ci-deploy.sh, provision.sh, push-renderer,
   push-installers…): đổi đích (đường dẫn `/home/app/toolswave`, tên service) trước khi bỏ chặn.
6. **systemd/nginx**: đổi tên `toolswave-api/web` → `larkwave-*`, port riêng, file nginx riêng, ingress
   cloudflared (nhớ restart, không SIGHUP).
7. **tw-lark-runner / tw-cms-keeper**: trỏ `.env` về API Larkwave, service riêng trên VM, khoá runner mới.
8. CI: thêm lại stage deploy khi hạ tầng sẵn sàng (`.gitlab-ci.yml`).

## Đồng bộ thay đổi từ Toolswave gốc

Toolswave (`/Users/deveris/app`) vẫn được phát triển tiếp. Repo này kéo thay đổi về bằng:

```bash
node scripts/sync-from-toolswave.mjs --dry   # xem trước: file nào vào, file nào bỏ qua, chỗ nào xung đột
node scripts/sync-from-toolswave.mjs         # đồng bộ từng commit, mỗi commit gốc = 1 commit ở đây
```

- Mốc đã đồng bộ, đường dẫn repo gốc và danh sách loại trừ nằm trong `.toolswave-sync.json`.
- Script chỉ ĐỌC repo gốc qua `git show` / `diff-tree`. Nó không bao giờ đổi cây làm việc hay nhánh bên đó, nên phiên khác đang làm trên Toolswave vẫn an toàn.
- Mỗi file được gộp 3 chiều: base là gốc trước commit, theirs là gốc sau commit (cả hai đều đã đi qua đúng phép đổi tên lúc tách), ours là file ở đây.
- File của app kia, hoặc file đã bị cắt hay đổi chỗ ở đây, sẽ bị **bỏ qua và liệt kê ra**.
- Danh sách "bỏ qua … (không có ở repo này)" cần được đọc. Nếu đó là thay đổi phần chung mà ở đây đã chuyển chỗ (ví dụ bộ máy chat trong appwave nằm ở `runtime/chat/`), phải port tay.
- Dòng `⚠ … khớp /…/` nghĩa là dòng được thêm vào có dấu hiệu thuộc về app kia. Phải kiểm tra trước khi giữ.
- Số phiên bản desktop đi đường riêng: `apps/desktop/package.json` được ghim theo bản ở đây.

**Khi gặp xung đột**, script dừng lại và để dấu `<<<<<<< repo này / ======= / >>>>>>> Toolswave` trong file:

1. Gỡ xung đột.
2. Chạy `git add -A && git commit -F .git/TW_SYNC_MSG`.
3. Chạy `node scripts/sync-from-toolswave.mjs --continue`.
4. Chạy lại script không kèm cờ để đi tiếp.

**Commit gốc không thuộc repo này** nhưng vẫn chạm vào file chung: `git checkout --` các file đó, commit, rồi chạy `--continue`.

**Sau mỗi đợt đồng bộ:** chạy lại typecheck và test (lệnh ở phần kiểm tra phía trên).
