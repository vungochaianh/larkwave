# Chuyển từ app desktop Toolswave sang Larkwave

> Từ 10/2026 Larkwave **dùng chung hệ tài khoản với Toolswave**: cùng API `https://api.toolswave.net/v1`,
> cùng user id, cùng gói (% hạn mức token tháng), cùng link đăng nhập Google/GitHub/GitLab. Khách đang
> dùng Lark trên app desktop Toolswave mở Larkwave, đăng nhập bằng chính tài khoản đó, và dữ liệu Lark
> cũ được nhập tự động.

## Tài khoản và đăng nhập

- **Địa chỉ API**: mặc định là API Toolswave (`packages/core/src/index.ts` → `APIA_BASE`). Muốn đổi thì đặt
  `LARKWAVE_API_BASE` (desktop/Node) hoặc `NEXT_PUBLIC_API_BASE` (web). Nếu đặt cả hai thì `LARKWAVE_API_BASE` được dùng.
  Bài kiểm `test/endpointCompat.cjs` chốt cả hai cách.
- **Email + mật khẩu và đăng ký**: giống hệt app Toolswave (`/auth/login`, `/auth/register`).
- **Google / GitHub / GitLab**: dùng chung OAuth client và callback với Toolswave, nên KHÔNG cần client mới.
  - **Đường chính**: mở trình duyệt thật với `?redirect=http://127.0.0.1:<cổng>/cb`. API Toolswave cho phép loopback.
  - **Đường dự phòng** khi loopback không mở được: cửa sổ đăng nhập TRONG app (`authWindow.ts`). Cửa sổ này bắt
    `https://toolswave.net|app.toolswave.net/auth/callback?token=…`.
  - **Không bao giờ** dùng `toolswave://auth`, vì hệ điều hành sẽ giao JWT cho app Toolswave.
  - Đã bỏ `larkwave://auth` khỏi OAuth: API Toolswave không chấp nhận nó và trình duyệt sẽ rơi về trang web.
- **Thiết bị**: tối đa 3 thiết bị cho mỗi tài khoản, dùng chung với Toolswave. Đăng nhập Larkwave có thể đẩy một phiên Toolswave cũ nhất ra.
  - Máy chủ tự đặt nhãn thiết bị từ User-Agent và không đọc tên do client gửi lên.
  - Larkwave gửi UA `… Electron/<v> Larkwave/<ver> (<máy>)`, nên máy chủ ghi nhận là desktop với nhãn "App Toolswave · macOS".
  - **Muốn nhãn "Larkwave · <máy>"** (sửa 1 dòng ở API Toolswave, CHƯA làm): trong `apps/api/src/auth/auth.service.ts`
    `deviceLabelFromUA`, khớp `/Larkwave\/[^ ]+ \(([^)]+)\)/` trước nhánh Electron và trả về `Larkwave · $1`.
- **Điều khiển từ xa**: tên thiết bị mặc định là `Larkwave · <máy>`, để điện thoại phân biệt được với app Toolswave chạy trên cùng máy.

## Tương thích endpoint

Bài kiểm `test/endpointCompat.cjs` đối chiếu MỌI lời gọi HTTP của desktop (`packages/ui/src/account/api.ts` và
`${APIA_BASE}/…` trong `apps/desktop/main`) với danh sách route thật của API Toolswave. Danh sách này được chụp vào
`test/fixtures/toolswave/routes.json` bằng `node scripts/toolswave-routes.mjs`; sau mỗi lần đồng bộ từ Toolswave
thì chụp lại. Hiện không thiếu route nào. Những chỗ khác hình dữ liệu đã có lớp chuyển (`packages/ui/src/account/compat.ts`):

| Endpoint | Khác biệt | Cách xử lý |
|---|---|---|
| `GET /me/overview` | Toolswave đếm app/build, không có `aiRuns/remoteTasks/…` | Chuẩn hoá về hình của Larkwave với `partial:true`; ô đếm hiện "—"; số kỹ năng đếm từ thư viện trên máy |
| `GET /me/activity` | Cùng hình, nhưng Toolswave đếm **build** | Giữ nguyên (không vỡ màn). Biểu đồ/chuỗi ngày phản ánh build của Toolswave |
| `GET /storage/usage` | Có thêm nhóm `apps/video/image` của Toolswave | Chỉ hiện `uploads` + `chat`; `storageRemove` từ chối nhóm khác để không xoá được mã nguồn app/video của Toolswave; tổng dung lượng/hạn mức giữ nguyên |
| `GET /me/subscription` | Có thêm trường (siêu tập); mô tả gói là của App Builder | Không vỡ; nội dung mô tả là của Toolswave |
| luồng `/agent/stream` | Mọi lệnh phát tới MỌI máy của tài khoản | Bỏ qua tác vụ có `appId` (lệnh dựng app gửi cho app Toolswave) |

## Ghi lên máy chủ dùng chung với Toolswave: quyết định

| Ghi | Kiểu | Quyết định |
|---|---|---|
| `PUT /me/lark-backup` | **Một ô cho mỗi tài khoản**, và app Toolswave khôi phục từ ô này | **ĐÃ GỠ.** Larkwave chỉ KÉO về rồi hợp nhất (= nhập). Xem "Thay đổi cần ở máy chủ" bên dưới |
| `POST /me/lark-runner/beat` | Một lease cho mỗi tài khoản | Giữ. Đây là thứ chặn một lịch chạy hai lần (Larkwave + Toolswave). `runnerId` của Larkwave nay nằm ở `machine-prefs.json` với tiền tố `lw-` và không bao giờ nhận từ bản sao lưu (trước đây có thể thừa hưởng id của app kia, khiến hai bên cùng `isMine` và chạy trùng) |
| `PUT/DELETE /me/lark-hosted` | Một cấu hình chạy hộ cho mỗi tài khoản (App ID/Secret) | **Chặn** (`FEATURE_HOSTED_RUNNER_WRITE=false`): chỉ hiện trạng thái, bật/tắt làm ở app Toolswave |
| `PUT /agent/chat/projects` | Thay TOÀN BỘ danh sách dự án | Cho phép, nhưng chỉ sau lần kéo-hợp-nhất đầu. Máy mới cài trước đây có thể đẩy `[]` và xoá sạch dự án bên Toolswave |
| `/agent/chat/index`, `/agent/chat/body/:id` | Theo từng hội thoại, bản mới thắng | Cho phép |
| `/me/lark-shares` | Theo từng hội thoại (`sourceId`) | Cho phép (link công khai trỏ về toolswave.net) |
| `/me/lark-grants*` | Theo từng quyền | Cho phép tạo. Cổng uỷ quyền chỉ chạy lượt của quyền có **chính sách tại máy này**; quyền của Toolswave bị bỏ qua và để nguyên trong hàng đợi (không báo `denied`), vì máy chủ không giành lượt nguyên tử. Quyền "Trợ lý AI" tạo ở Larkwave thì ghi dấu chính sách tại máy |
| `/agent/tokens*`, `/agent/telegram/*` | Theo từng token/liên kết | Cho phép |
| `/uploads` | Theo từng tệp | Cho phép |
| `/me/profile`, `/me/avatar`, `/me/password`, `/me/plan`, `/payments/*` | Hồ sơ/gói chung của tài khoản | Cho phép. Đây là dữ liệu của chính tài khoản đó |
| MAIC (`/agent/maic-*`) | Ghi nhận mức dùng | Trừ vào hạn mức gói Toolswave |
| Thư mục kỹ năng của CLI (cục bộ) | `~/.claude/skills`, `~/.grok/skills`, `~/.gemini/skills`, khối trong `~/.codex/AGENTS.md` | Larkwave chỉ tạo/xoá thư mục `larkwave-<id>` của nó. Khối Codex có dấu mốc `larkwave:skills` riêng; khối cũ thì vẫn gỡ được |

### Thay đổi cần ở máy chủ để bật lại đồng bộ sao lưu của Larkwave

1. Prisma: thêm `slot String @default("toolswave")` vào `LarkBackup`, đổi `@unique` thành `@@unique([userId, slot])`. Hoặc tạo bảng `LarkBackupSlot`.
2. `GET/PUT /v1/me/lark-backup?slot=larkwave`: không có `slot` thì mặc định là `toolswave`, để bản Toolswave cũ chạy nguyên.
3. `LarkHostedRunner` / `tw-lark-runner` cần biết đọc lịch từ ô nào.
   - **Hệ quả hiện tại:** máy chạy hộ chỉ thấy lịch trong bản sao lưu của Toolswave. Lịch tạo mới ở Larkwave chỉ chạy khi app Larkwave mở (và giữ lease).
4. Sau đó ở Larkwave: khôi phục bước PUT trong `larkBackupSync` (`larkService.ts`), thêm `?slot=larkwave`, và bật lại `FEATURE_HOSTED_RUNNER_WRITE`.

`tw-lark-runner` (`headlessRunner.ts`) vẫn đọc-sửa-ghi phần `automations` của ô sao lưu. Nó chạy trên VM, không nằm trong desktop. Nếu trỏ nó vào API Toolswave thì nó ghi đúng vào ô của Toolswave.

## Nhập dữ liệu cũ (`apps/desktop/main/runtime/migrate`)

- **Lúc chạy:** tự động một lần sau lần đăng nhập đầu của mỗi tài khoản.
  - Dấu đã nhập nằm ở `<userData>/migrations/toolswave-<userId>.json`.
  - Ngoài ra có nút **Cài đặt → "Dữ liệu từ app Toolswave" → "Chạy thử" / "Nhập lại dữ liệu từ Toolswave"**.
  - Hộp thoại hiện tiến độ và kết quả: số mục theo hạng mục, các mục bỏ qua kèm lý do, và 2 việc người dùng cần làm. Dữ liệu được nhập thì giao diện tải lại.
- **Nguồn (CHỈ ĐỌC):** `~/Library/Application Support/@toolswave/desktop`, `… (development)`, `toolswave-desktop`.
  - Trên Windows là các thư mục tương ứng trong `%APPDATA%`, trên Linux là `~/.config`.
  - Mọi lệnh ghi đi qua một chốt, chốt này từ chối mọi đích nằm trong thư mục nguồn.
  - `LARKWAVE_TOOLSWAVE_DATA_DIR` trỏ sang thư mục khác (fixture). `LARKWAVE_NO_AUTO_MIGRATE=1` tắt tự chạy.
- **Ánh xạ:** dùng CÙNG user id. `lark/*/<userId>` đi sang `lark/*/<userId>`. `_local` sang `_local`, không tự nhận vào tài khoản (bất biến chống rò rỉ). Tệp phẳng kiểu cũ cũng vào `_local`. Không nhập tài khoản khác.

| Hạng mục | Nguồn | Cách nhập |
|---|---|---|
| Hội thoại Lark | `lark/sessions/<scope>/*.json` | Mới: chép, GIỮ id phiên CLI khi nối được phiên gốc (dòng dưới), không nối được thì bỏ id. Đã có: `mergeSession` hợp item theo id, bản mới hơn quyết định thứ tự, giữ phiên CLI của Larkwave (chưa có phiên thì nhận phiên gốc). Đã xoá ở Larkwave (bia mộ): không nhập lại |
| Phiên Claude CLI ("phiên Claude đã nối lại") | `~/.claude/projects/<slug(cwd Toolswave)>/<id>.jsonl` + thư mục `<id>/` | CHÉP (không chuyển) sang `~/.claude/projects/<slug(cwd Larkwave)>/`. Xem mục "Trí nhớ của hội thoại cũ" |
| Bia mộ | `lark/deleted/<scope>/deleted.json` | Hợp lại, giữ mốc sớm nhất |
| Đặc tả | `lark/specs/<scope>/spec.json` | `mergeSpec` |
| Cài đặt Lark | `lark/accounts/<scope>/settings.json` (và `lark/settings.json` kiểu cũ) | Larkwave thắng khi trùng khoá; bỏ `runnerId` và mọi trường trông như bí mật |
| Base | `bases.json` | Hợp theo `appToken` |
| Lịch tự động hoá | `automations.json` | Hợp theo `id`, Larkwave thắng. Lease chung đảm bảo lịch chỉ chạy ở một app |
| Lịch sử đăng nhập Lark web | `lark-relogin-<scope>.json` | Hợp theo `at`, giữ 30 |
| Tệp làm việc | `lark/work/<convId>/` | Chỉ của hội thoại vừa nhập (và `sched-files`). Mỗi tệp ≤ 5 MB, tổng ≤ 200 MB. Bỏ thư mục ẩn |
| Kỹ năng | `skills/registry.json`, `skills/lib/<id>/**`, `snapshots.json`, `set-runs.json` | Thêm kỹ năng chưa có (giữ nguyên SKILL.md cùng hợp đồng kỹ năng chéo), không ghi đè kỹ năng cùng id. Sau đó dựng lại `~/.claude/skills/larkwave-<id>` |
| Plugin | `plugins/registry.json`, `plugins/<id>/**`, `trusted-keys.json` | Thêm cái chưa có |

**Cố ý KHÔNG nhập** (đều có trong báo cáo kèm lý do):
- Mọi `*.bin`: `creds/apps/bot/user.bin` (App Secret, bot, OAuth cá nhân Lark), `runners/*.bin`, `claude/*`, `account/token.bin`, `agent/token.bin`. Đây là blob safeStorage (`v10…`) hoặc `PLAIN:`, mã hoá bằng khoá Keychain/DPAPI của app Toolswave.
- `Partitions/` (cookie Lark web).
- `Local Storage` (tuỳ chọn giao diện, kể cả "Hỏi nhanh của tôi", nằm trong kho leveldb của trình duyệt app Toolswave).
- `agent/settings.json` (không tự bật điều khiển từ xa, để hai app không cùng nhận một lệnh).
- `lark/grants.json` (quyền uỷ quyền do app Toolswave tiếp tục phục vụ).
- `skills/disabled` (bố cục cũ).
- `apps/` và `apps-index.json` (App Builder).
- **Không có kho riêng trên máy, nên không có gì để nhập:** CMS sync (job nằm ở backend CMS; địa chỉ `cmsSyncBaseUrl` đi theo settings) và tunnel/webhook (cấu hình nằm trong `bot.bin`).

**Sau khi nhập, người dùng cần:**
1. Đăng nhập Lark web một lần (quét QR).
2. Nếu dùng "Lark Bot (App ID)": nhập lại App Secret ở mục **Lark Bot (App ID)**.

Bản sao lưu trên máy chủ (`GET /me/lark-backup`, cùng ô mà app Toolswave khôi phục) được kéo về và hợp nhất mỗi lần mở Lark × Agents, theo đúng luật hợp nhất và chống rò rỉ (gắn theo token, bia mộ, settings thì máy này thắng, automations thì máy này thắng).

## Trí nhớ của hội thoại cũ (phiên Claude CLI)

**Vì sao AI "quên" hội thoại chép từ Toolswave:** Claude CLI cất phiên theo THƯ MỤC LÀM VIỆC:
`<CLAUDE_CONFIG_DIR | ~/.claude>/projects/<slug(cwd)>/<sessionId>.jsonl` (+ thư mục phụ `<sessionId>/` chứa
`tool-results/`…). Larkwave chạy mỗi hội thoại ở `userData/lark/work/<convId>`, Toolswave ở
`…/@toolswave/desktop/lark/work/<convId>` → khác slug → `--resume` báo `No conversation found`. Bản nhập cũ còn
bỏ luôn id phiên, nên lượt sau mở phiên mới và chỉ được nhồi lại ~9 000 token chữ (mất kết quả công cụ).

**Luật slug** (đọc thẳng từ CLI 2.1.295, kiểm ở `test/claudeSessions.cjs` với tên thư mục thật của cả hai app):
`realpath(cwd).normalize('NFC').replace(/[^a-zA-Z0-9]/g, '-')`; dài hơn 200 ký tự thì cắt 200 + `-` + băm kiểu Java
(base36). `CLAUDE_CONFIG_DIR` đổi gốc; có thêm `CLAUDE_CODE_PROJECT_DIR_NAME` thì mọi cwd dùng chung một thư mục.
Ví dụ: `…/Application Support/@larkwave/desktop (development)/lark/work/<id>` →
`-Users-<u>-Library-Application-Support--larkwave-desktop--development--lark-work-<id>`.

**Ba lớp, theo thứ tự:**
1. **Lúc nhập** (`toolswaveMigrator.linkClaudeSession`): với phiên đang dùng (`agentSessionId || claudeSessionId`),
   tìm `<id>.jsonl` ở slug cwd Toolswave, không có thì ĐÚNG id đó ở mọi thư mục dự án (bản mới nhất), chép sang
   slug cwd Larkwave (tạo sẵn thư mục làm việc để realpath khớp). Đích mới hơn ⇒ bỏ qua; đích cũ hơn ⇒ chỉ cập nhật
   khi đích là đoạn đầu của nguồn (không xoá lượt đã chạy ở Larkwave); hai bên cùng chạy tiếp ⇒ giữ đích. Đếm ở
   hạng mục `claudeSessions` của báo cáo. Máy đã nhập bằng bản cũ: `migrationService` tự chạy MỘT lượt bổ sung chỉ
   hạng mục hội thoại (`sessionsOnly`), đánh dấu `claudeRelink` trong `migrations/toolswave-<userId>.json`; các hạng
   mục khác không chạy lại (kỹ năng/lịch đã xoá không quay về).
2. **Lúc `--resume` hụt** (`larkAgent` → `claudeSessions.rescueClaudeSession`): hội thoại chuyển thư mục / khôi phục
   từ máy khác / phiên lỡ ghi ở thư mục khác — tìm đúng id ở mọi thư mục dự án, chép sang slug cwd hiện tại, `--resume`
   lại MỘT lần. Không bao giờ đọc/chép id khác. Đo thật (CLI 2.1.295): phiên tạo ở thư mục A, `--resume` từ thư mục C
   → `No conversation found`; chép tệp sang slug của C → `--resume` nhớ đúng mã bí mật của lượt đầu.
3. **Không còn bản gốc ở đâu cả**: nhồi lại lịch sử chữ (`lark/transcript.ts`) với ngân sách theo cửa sổ của
   runner/model (`contextBudget.transcriptBudgetTokens`: ~8% cửa sổ trong [9k, 60k] — model 1M → 60k, Haiku → 16k),
   giữ tin đầu tiên của người dùng, kèm tóm KẾT QUẢ công cụ (`tool_result.memo`: id, số lượng, link, tên — lưu cùng
   thẻ công cụ) và thẻ tệp đã dựng. Áp cho cả Codex/Gemini/Grok (trí nhớ duy nhất của chúng) và đường API trực tiếp.
   Prompt dài hơn 60 000 ký tự đi qua STDIN (`claude -p` không tham số prompt, `codex exec -`, `gemini -p` nối sau
   stdin) — argv có trần của hệ điều hành.

Kèm theo: `larkSaveSession` lấy id phiên của CHÍNH hội thoại (turnState) trước `chatSessionId` của tab đang xem —
trước đây hội thoại chưa có id bị ghi id của hội thoại khác hoặc một id chưa từng chạy, mở lại app là quên.

## Kiểm

```bash
bash apps/desktop/test/run.sh        # gồm endpointCompat.cjs + toolswaveMigrate.cjs + claudeSessions.cjs + larkDeleteSync.cjs (không PUT)
node scripts/toolswave-routes.mjs    # chụp lại route của API Toolswave sau mỗi lần đồng bộ
```

Smoke ở chế độ ẩn (không bật cửa sổ). `LARKWAVE_USER_DATA` (chỉ có tác dụng ở dev + ẩn) cho app chạy trên một userData tạm:

```sh
env -u ELECTRON_RUN_AS_NODE LARKWAVE_HIDDEN=1 LARKWAVE_NO_AUTO_MIGRATE=1 LARKWAVE_USER_DATA=/tmp/lw-ud \
  npx nextron dev --renderer-port 8892 --electron-options="--remote-debugging-port=9342"
# CDP: window.toolswave.toolswaveMigrationStatus(), larkSetAccount('<id>'), toolswaveMigrate({dryRun:true})
```
