# Larkwave — đọc trước khi làm

Larkwave là app **desktop** (Electron/Nextron) để làm việc với Lark/Feishu bằng AI, tách từ
Toolswave ngày 06/10/2026. Màn chính là **Lark × Agents**: chat với một AI agent đang cầm phiên Lark
web thật của người dùng. Agent đọc/ghi Base, Sheet, Doc, Drive, tạo automation/workflow (luôn để
TẮT), xuất tệp, và chạy lịch tự động. Đi kèm có Trợ lý AI chung, Kỹ năng, điều khiển từ xa.
Larkwave **không có phần dựng app**, phần đó nằm ở `/Users/deveris/appwave`.

**Trạng thái (13/10/2026):**
- Bản **0.1.3 macOS đã phát hành**: https://toolswave.net/larkwave.
- Code-push giao diện đang bật.
- Chưa có bản Windows.
- Bản cài ký ad-hoc, chưa notarize.

## Kiến trúc thật (khác những gì cây thư mục gợi ý)

- **Dùng CHUNG tài khoản + API với Toolswave**: `https://api.toolswave.net/v1`. Đó là
  `APIA_BASE` trong `packages/core/src/index.ts`, đổi được bằng `LARKWAVE_API_BASE`. App dùng cùng
  user, cùng gói %, cùng OAuth, cùng hạn mức 3 thiết bị.
- Dữ liệu Lark cũ của app Toolswave được nhập một lần, chỉ ĐỌC thư mục của Toolswave. Xem
  [docs/migrate-from-toolswave.md](docs/migrate-from-toolswave.md).
- `apps/api` và `apps/web` của repo này **KHÔNG được deploy**. Vẫn giữ typecheck/test xanh, nhưng
  desktop không gọi tới chúng.
- `test-accounts.local.md` (gitignored) là tài khoản của DB local `larkwave`. Chúng **không** đăng
  nhập được vào API thật.
- Máy chủ thật là repo Toolswave **`/Users/deveris/app`**: `apps/api` + `apps/web`. Ở đó có route
  phát hành `apps/web/src/lib/appsRelease.ts` → `/api/apps-release/larkwave`, trang `/larkwave`, và
  các chốt relay. Cần đổi phía máy chủ thì sửa ở đó rồi deploy nó.

```
apps/desktop/main/runtime/lark/   lõi Lark: larkService.ts (lượt chat, hội thoại, lịch), larkWebSession.ts
                                  (trang Lark web + CDP), systemPrompt.ts, tools/ (công cụ của agent)
apps/desktop/main/                tiến trình Electron (IPC, codePush.ts, hiddenMode.ts, migrate/)
packages/ui/                      giao diện dùng chung — LarkScreen / LarkChatShell / LarkFramePane …
packages/core/                    hợp đồng RuntimeAdapter + kênh IPC + logic thuần
tw-lark-runner/, tw-cms-keeper/,  dịch vụ chạy trên VM — CHƯA deploy từ repo này; hỏi trước khi đụng
tw-agent-host/, cms-lark-sync/
```

## Lệnh

```bash
pnpm install
pnpm --filter @larkwave/shared build && pnpm --filter @larkwave/core build   # LUÔN trước desktop
pnpm --filter @larkwave/ui typecheck
pnpm --filter @larkwave/desktop typecheck:desktop
bash apps/desktop/test/run.sh                  # test desktop/core (node, không mở cửa sổ)
(cd apps/api && npx jest)
node scripts/check-duplicates.mjs              # các cặp tệp chép nguyên văn phải khớp
node scripts/check-toolswave-api.mjs           # mọi đường app gọi phải có trên API Toolswave
node scripts/handoff.mjs                       # đầu phiên: git/phiên bản/bản đang phát hành
```

**Chạy app để kiểm, không bật cửa sổ:**

```bash
cd apps/desktop
env -u ELECTRON_RUN_AS_NODE LARKWAVE_HIDDEN=1 LARKWAVE_USER_DATA=<thư mục tạm> \
  npx nextron dev --renderer-port 8892 --electron-options="--remote-debugging-port=9342"
# lái/chụp qua CDP ở http://127.0.0.1:9342/json · xong việc:
pkill -f "nextron-dev.js --renderer-port 8892"; pkill -f "remote-debugging-port=9342"; pkill -f "next dev -p 8892"
```

- Cửa sổ được tạo nhưng không bao giờ hiện, kể cả cửa sổ Lark và SSO.
- Trước khi `connectOverCDP`, đóng target `devtools://`, nếu không sẽ treo.
- `LARKWAVE_USER_DATA` giữ dữ liệu dev thật không bị đụng. `LARKWAVE_NO_AUTO_MIGRATE=1` tắt việc tự
  nhập dữ liệu Toolswave.
- Chi tiết: [docs/lark-browser.md](docs/lark-browser.md) § "Chế độ ẩn cho dev".

## Phát hành (chỉ máy Mac dựng được .dmg)

**Chỉ đổi giao diện** (`packages/ui`, `renderer/`): dùng code-push.

```bash
set -a; . /Users/deveris/app/.env; set +a      # CF_API_TOKEN, CF_ACCOUNT_ID — KHÔNG in ra
CLOUDFLARE_API_TOKEN=$CF_API_TOKEN CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID ALLOW_DEPLOY=1 \
  node scripts/push-renderer.mjs --min-main 0.1.0      # thử trước: --dry-run
```

- Pages project là `larkwave-desktop-renderer`.
- Giao diện mới phải chạy được trên **lõi 0.1.0**, vì `minMain` = 0.1.0. Gọi IPC mới thì dò xem lõi
  có kênh đó không (`runtime.larkWebAccounts ? … : …`); không có thì lùi về hành vi cũ.
- Ví dụ thật: QR đăng nhập trên lõi 0.1.0 đi bằng tham số URL.

**Đổi main process / IPC**: phải ra bản cài mới.

1. Tăng `version` trong `apps/desktop/package.json`.
2. Thêm một mục vào `packages/ui/src/changelog.ts`.
3. Dựng shared + core. Bỏ bước này là bản dựng gói core cũ: app trắng màn hình, mà lúc dựng không có
   lỗi nào báo.
4. `cd apps/desktop && env -u ELECTRON_RUN_AS_NODE CSC_IDENTITY_AUTO_DISCOVERY=false pnpm dist:mac`
   (chạy nền).
5. `node scripts/check-dist-mac.mjs`.
6. `env -u ELECTRON_RUN_AS_NODE node scripts/boot-smoke.mjs` (≥150 kênh).
   Rồi `env -u ELECTRON_RUN_AS_NODE node scripts/connectors-smoke.mjs`: kiểm Zalo (QR thật) và Gmail (Google từ chối
   tài khoản giả) trên ĐÚNG bản đã gom, vì zca-js, nodemailer và imapflow chỉ lộ lỗi gom ở đây. Cần mạng.
7. `ALLOW_DEPLOY=1 GITLAB_TOKEN=… node scripts/push-installers.mjs` (`--dry-run` trước). Tệp lên gói
   `larkwave-desktop` của registry, project 83700259.
8. `push-renderer.mjs --min-main 0.1.0 --main-change`.

Sau khi tải lên:
- Máy chủ chạy **hai** tiến trình web (cổng 4100 và 4102), mỗi tiến trình một bộ đệm. Sau khi phát hành,
  một lượt gọi có thể ra bản mới trong khi lượt khác vẫn ra bản cũ. Gọi trang 8 lần liền; chỉ khi cả 8
  đều ra bản mới thì mới coi là xong.
- `/api/apps-release/larkwave` đệm 300 giây, nên có thể mất vài phút mới thấy bản mới.
- Kiểm lại bằng `curl`, và kiểm trang `/larkwave` bằng Playwright headless.

Chi tiết: [docs/code-push.md](docs/code-push.md). Bản Windows:
[docs/may-phat-hanh-windows.md](docs/may-phat-hanh-windows.md).

## Kết nối Zalo / Gmail cho kỹ năng (từ 0.1.5)

- Người dùng muốn: **agent không tự thao tác Zalo/Gmail, chỉ dùng qua kỹ năng** — giống Social Wave
  (`/Users/deveris/Fbinbox_Workspace/fbinbox-sender`), nơi AI không bao giờ cầm kênh.
- Phiên Zalo chép nguyên từ Social Wave: `apps/desktop/main/runtime/connectors/zalo/session.ts`, kèm bộ test gốc
  `session.test.ts`. Chỉ thêm phần đọc tin, nhóm và gửi vào nhóm; đừng sửa máy trạng thái QR hay kho khoá.
- Tin Zalo chỉ giữ trong bộ nhớ (`messages.ts`). Gmail dùng mật khẩu ứng dụng: gửi qua SMTP, đọc qua IMAP ở chế
  độ `readOnly`.
- **Cái chốt duy nhất** là `connectorGate` trong `lark/tools/connectors.ts`. Một công cụ `zalo_*` / `gmail_*` chạy khi:
  - lượt đó có `connectors` trong ngữ cảnh. Chỉ `larkService.chat` (lượt của chính chủ máy) gắn trường này. Bot
    Lark, lịch tự động và lượt chia sẻ đều KHÔNG có. Thiếu chốt này, người lạ nhắn bot là đọc được Zalo của chủ máy;
  - và một kỹ năng đã nạp vào lượt nhắc ĐÚNG TÊN công cụ đó (lệnh "/", khớp từ khoá, hoặc `skill_get`).
- Gửi (`zalo_send_text`, `gmail_send`) mang cờ `alwaysConfirm`: luôn hỏi, thắng cả "Tự động duyệt". Hộp xác nhận
  không cho "luôn cho phép". Nhịp gửi: Zalo sàn 8 giây và trần 30 tin/giờ; Gmail 10 người nhận/thư và 40 thư/giờ.
  Đừng hạ các ngưỡng này.
- Bộ kỹ năng dựng sẵn "Zalo & Gmail" nằm ở `skills/builtinSkills.ts` (`CONNECTOR_TAGS`). Phải có hợp đồng, mục
  "## Khi lỗi", và chỉ nhắc công cụ có thật; `test/skillsBuiltin.cjs` canh những điều này.
- Chưa kiểm với tài khoản Zalo/Gmail thật (17/10/2026): chỉ có test với client giả và `connectors-smoke`.

## Luật kiểm thử với Lark thật (không thương lượng)

- Chỉ **ghi** vào **Base Test**, và chỉ lên mục **tạo ra để thử** (bảng/bản ghi/khối mang tên thử).
  Thử xong thì dọn sạch.
  - Hai khối DEMO `wkfNuhRu4HS3KiKO` và `wkfaj244hiPGAKJC` cố ý để lại; đừng xoá.
- **Không bao giờ bật workflow/automation.** Tạo ra luôn ở trạng thái TẮT; bật là việc của người dùng.
- **Không gửi tin nhắn chat** trong lúc thử. Gửi tin là tin thật tới người thật.
- **Không đăng xuất khe tài khoản gốc** (slot `''`). Muốn thử đăng xuất / thêm tài khoản thì dùng một
  khe trống, kẻo xoá phiên Lark thật của người dùng.
- Công cụ xoá (`lark_web_delete`) luôn phải hỏi người dùng. Không bao giờ có mặt trong lượt chạy không
  người trông.

## Luật an toàn chung

- **Không in khoá ra màn hình hay log.**
  - Khoá phát hành: `/Users/deveris/app/.env`.
  - Khoá máy chủ: `/Users/deveris/app/.deploy-secrets`.
  - App Secret và cookie Lark của người dùng không bao giờ được rời khỏi máy.
- Script phát hành bị chặn bằng `ALLOW_DEPLOY=1`. Bản đẩy lên tới mọi máy đã cài.
- **Không** deploy `apps/api`/`apps/web` của repo này. **Không** `prisma db push` vào DB Toolswave.
- Deploy máy chủ Toolswave (khi cần đổi API): chạy `deploy/ci-deploy.sh` ở `/Users/deveris/app`.
  - Script rsync cả cây làm việc, nên phải `git status` trước.
  - Gặp link "Tailscale SSH requires an additional check": chuyển link cho người dùng duyệt và để lệnh
    tiếp tục chờ.
- **Không mở cửa sổ app lên màn hình người dùng.** Dùng chế độ ẩn ở trên. Tắt app dev trước khi sửa
  mã.
- Shell của VS Code có `ELECTRON_RUN_AS_NODE=1`: luôn chạy `env -u ELECTRON_RUN_AS_NODE …`.
- Thư mục dữ liệu của app Toolswave đã cài chỉ được ĐỌC. Không giải mã Keychain.

## Bẫy đã gặp

- **Kiểm API key: 400 từ `/v1/messages` KHÔNG có nghĩa là key sai.** Với key mới tạo, đó gần như luôn là "credit
  balance is too low" (tài khoản chưa nạp tiền). Dùng `checkAnthropicKey` (`@larkwave/core`): kiểm đăng nhập bằng
  `GET /v1/models` (chỉ 401/403 mới là key sai), rồi thử dùng; lỗi ở bước thử thì trả `warning` kèm câu của Anthropic.
- **API key Anthropic không chỉ có dạng `sk-ant-api…`.** Từ 10/2026 Console cấp cả `sk-ant-usr-…`.
  Nhận diện khoá bằng `apps/desktop/main/runtime/claudeKeyKind.ts`, đừng viết regex tiền tố mới. Hàm đó
  chỉ loại những dạng biết chắc không phải API key (token đăng nhập `oat`, admin key…), còn lại để lần
  gọi thử API (`validateKey`) quyết định.
- **Claude CLI đóng băng lời nhắc hệ thống và danh sách công cụ ở lượt đầu.** `--resume` và
  `--fork-session` dùng lại đúng ảnh chụp ấy (`prompt_snapshot` trong jsonl của phiên).
  - Thứ đổi theo lượt (Base, công tắc Tự động, kỹ năng) phải đi qua `buildTurnContextBlock`
    (`systemPrompt.ts`).
  - Đổi luật hoặc công cụ thì `promptFingerprint` (`systemPrompt.ts`) đổi, và `larkService.chat` xoay
    sang phiên mới rồi mồi lại lịch sử.
  - Triệu chứng: "AI cứ làm theo luật cũ / nhắc chế độ Hỏi đáp không tồn tại".
- **Ba đường chạy một lượt Lark** (`runLarkAgent` trong `larkAgent.ts`):
  - Claude: `runLarkChat`, đi cầu MCP.
  - Gemini: `runLarkGemini` (`larkGeminiAgent.ts`), đi CÙNG cầu MCP, từ 0.1.4.
  - Grok/Codex: `larkOrchestrator.ts`, vòng `<tool_call>` dạng chữ. CLI ở đường này chạy chế độ tự duyệt
    mọi công cụ dựng sẵn (`--always-approve` / `--dangerously-bypass…`). Đừng cho lượt của người lạ
    (bot Lark trong nhóm) đi đường này.
- **Gemini CLI** — mọi sự thật đo được nằm ở đầu `geminiCli.ts`; nâng bản CLI thì đo lại.
  - Khi chạy headless, quyết định "ask_user" bị coi là từ chối, nên KHÔNG dùng `--yolo`.
  - `tools.core: []` nghĩa là không có công cụ dựng sẵn nào.
  - `GEMINI_SYSTEM_MD` thay hẳn lời nhắc hệ thống, dựng lại mỗi lần chạy, nên không đóng băng như Claude.
  - Không tự đặt được id phiên: lấy id từ sự kiện `init`.
  - `--resume` vào một dự án chưa có phiên nào thì CLI **lặng lẽ mở phiên mới**, nên phải tự kiểm phiên
    còn trước (`geminiSessionExists`).
  - Thử không cần đăng nhập: đặt `GEMINI_API_KEY=<khoá giả>`. Cách này kiểm được MCP, policy và
    stream-json; model trả 400.
  - Đừng dùng `spawnSync` khi cầu MCP chạy cùng tiến trình: nó chặn vòng sự kiện, khiến Gemini báo
    "Disconnected".
- **Mỗi hội thoại (tab) có một trang Lark riêng, gọi là "làn".**
  - `LarkWebSession.win` / `.cdp` là getter theo `currentLane()`.
  - Getter `win` **TẠO** trang cho làn. Chỗ nào chỉ hỏi trạng thái phải dùng `pageFor(lane, false)`,
    nếu không mỗi lần poll lại đẻ thêm một trang.
  - Tối đa 4 trang. Khi đầy, đóng trang ít dùng nhất, trừ trang đang hiện và trang đang có lượt chạy.
- **Nhiều tài khoản Lark.**
  - Mỗi tài khoản là một khe cookie `persist:tw-lark-web-<scope>~<slot>`, lưu ở machine-prefs.
  - Đổi tài khoản áp dụng cho mọi tab.
- **Trang đăng nhập Lark giấu nút QR khi khung hẹp.** Nút đổi QR là **công tắc**: chỉ bấm khi chế độ
  hiện tại khác chế độ muốn. Đo chế độ bằng `elementFromPoint`, không theo cỡ canvas, vì QR vẫn còn
  trong DOM khi bị che.
- **Lượt chạy không người trông.**
  - Đặt trần thời gian bằng `AbortSignal`, vì cờ `timedOut` không cắt được lời gọi đang treo.
  - Lượt chạy theo lịch không được cầm công cụ tạo lịch, nếu không nó tự nhân bản mỗi lần chạy.
- **Xuất tệp** (`create_file` / `send_file`). Thư mục ghi phải nối ở ba đường: chat, lịch,
  headlessRunner. Hai chốt đường dẫn có test giữ (`apps/desktop/test/fileGuards.cjs`); so tiền tố bằng `sep`,
  không bằng `/`.
- **Nhiều desktop cùng một tài khoản.** Lệnh relay phát cho mọi desktop. Máy chủ chỉ cho một máy nhận
  mỗi lượt: chat gửi `deviceId` và dừng khi nhận `{claimed:true}`; lượt chia sẻ thua thì nhận 409
  `LUOT_DA_CO_MAY_NHAN`.
- `apps/web` dùng một bản Next.js có thay đổi phá vỡ; đọc `apps/web/AGENTS.md` trước khi sửa.

## Tài liệu

- [docs/lark-web-api.md](docs/lark-web-api.md): API nội bộ của Lark web (ghi bản ghi, đính tệp,
  workflow…), đã đo trên Lark thật.
- [docs/lark-browser.md](docs/lark-browser.md): trang Lark web, CDP, chế độ ẩn.
- [docs/lark-automations-files.md](docs/lark-automations-files.md): tự động hoá đọc tệp → ghi Lark.
- [docs/TACH-APP.md](docs/TACH-APP.md): đã gỡ/đổi gì khi tách, đồng bộ từ Toolswave
  (`node scripts/sync-from-toolswave.mjs --dry`).
- [docs/migrate-from-toolswave.md](docs/migrate-from-toolswave.md), [docs/code-push.md](docs/code-push.md),
  [docs/desktop-architecture.md](docs/desktop-architecture.md).
- Skill `ban-giao` (`.claude/skills/ban-giao`): bàn giao Mac ↔ Windows. **Hiện repo chưa có remote
  `origin`**, nên mã chỉ nằm trên máy Mac này. Đừng tự tạo remote; hỏi người dùng nơi đặt repo.
