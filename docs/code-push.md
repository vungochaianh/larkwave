# Phát hành desktop: bản cài + code-push giao diện

Larkwave có **hai kênh phát hành**, ở hai nơi khác nhau. Cả hai đều do app đọc qua **một** route trên
toolswave.net.

| Kênh | Nằm ở đâu | Khi nào dùng |
|---|---|---|
| Bản cài (`.dmg`, sau này `.exe`) | GitLab generic registry, project 83700259, gói `larkwave-desktop/<ver>/Larkwave-<ver>-universal.dmg` | đổi main process / IPC / native |
| Giao diện (code-push) | Cloudflare Pages `larkwave-desktop-renderer` → `https://larkwave-desktop-renderer.pages.dev` | chỉ đổi `packages/ui` / `renderer/` |

> Trước 10/2026 tài liệu này tả kênh của Toolswave (`twd-desktop-renderer`, `pnpm push:renderer`).
> Kênh đó **không** phải của Larkwave: trỏ vào nó thì app tải giao diện Toolswave về đè lên.
> `package.json` gốc cũng không có script nào, nên mọi lệnh dưới đây gọi thẳng `node scripts/…`.

## App đọc gì

`apps/desktop/main/codePush.ts` (`manifestUrl()`) và `packages/ui/src/useUpdateStatus.ts`
(`RELEASE_URL`) cùng đọc:

```
https://toolswave.net/api/apps-release/larkwave      (đổi được bằng LARKWAVE_RELEASE_URL)
```

Route nằm ở **repo Toolswave**, `apps/web/src/lib/appsRelease.ts`. Nó làm hai việc:

- Hỏi registry để lấy bản cài mới nhất của mỗi nền tảng: `latestVersion` và `downloads`. Trang
  `/larkwave` cũng lấy link từ đây.
- Nếu `APPS.larkwave.renderer` được cấu hình, đọc `<renderer>/release.json` và chuyển tiếp các trường
  `renderer`, `rendererVersion`, `minMain`, `mainChangedAt`, `notice`.
- `latestVersion` **chỉ** lấy từ registry. Phiên bản trong `release.json` không làm app báo "có bản
  mới".

Kết quả được đệm 300 giây kiểu stale-while-revalidate. Sau khi phát hành có thể mất vài phút, và một
lượt gọi trả bản cũ trước khi làm mới.

Lúc mở app (bản cài), `codePush.ts` chỉ nạp giao diện từ xa khi đủ cả bốn điều kiện:
- địa chỉ là HTTPS;
- `minMain` ≤ phiên bản lõi đã cài;
- `rendererVersion` không cũ hơn bản đã cài (chống tụt về giao diện cũ);
- trang tới được.

Thiếu bất kỳ điều kiện nào thì dùng giao diện đóng gói sẵn trong bản cài.

## Đẩy giao diện (không cần cài lại)

```bash
set -a; . /Users/deveris/app/.env; set +a        # CF_API_TOKEN, CF_ACCOUNT_ID — đừng in ra
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN" CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"
ALLOW_DEPLOY=1 node scripts/push-renderer.mjs --min-main 0.1.0 --dry-run   # xem trước, không deploy
ALLOW_DEPLOY=1 node scripts/push-renderer.mjs --min-main 0.1.0
```

Script làm các bước sau:
1. Dựng `@larkwave/shared` + `core` và renderer.
2. Ghi `release.json`, đóng dấu `rendererVersion` = phiên bản app, giữ `minMain`/`downloads` cũ nếu
   không truyền.
3. `wrangler pages deploy`.
4. Kiểm lại trang đang chạy.

Máy đã cài nhận giao diện mới ở lần mở app sau.

- `minMain` mặc định `0.1.0`, tức bản cài đầu tiên. **Đừng** để `1.0.0` như bên Toolswave: lõi 0.1.0
  sẽ vừa từ chối giao diện, vừa bắt người dùng cài lại.
- Giao diện mới phải **chạy được trên lõi cũ nhất ≥ minMain**. Gọi IPC mới thì dò xem lõi có kênh đó
  không (`runtime.xxx ? … : …`); không có thì lùi về hành vi cũ.
- ⚠️ Một bản giao diện hỏng tới **mọi** máy. Chỉ trang không tới được mới lùi về bản đóng gói; trang
  tới được mà hỏng thì không. Kiểm trước khi đẩy.

## Ra bản cài mới (đổi main process)

```bash
# 1. tăng version ở apps/desktop/package.json + thêm mục đầu ở packages/ui/src/changelog.ts
pnpm --filter @larkwave/shared build && pnpm --filter @larkwave/core build   # BẮT BUỘC (xem dưới)
cd apps/desktop && env -u ELECTRON_RUN_AS_NODE CSC_IDENTITY_AUTO_DISCOVERY=false pnpm dist:mac && cd ../..
node scripts/check-dist-mac.mjs                          # chữ ký, đúng Larkwave.app
env -u ELECTRON_RUN_AS_NODE node scripts/boot-smoke.mjs  # khởi động sạch, đủ kênh IPC
ALLOW_DEPLOY=1 GITLAB_TOKEN="$(grep '^GITLAB_TOKEN=' /Users/deveris/app/.env | cut -d= -f2-)" \
  node scripts/push-installers.mjs --dry-run             # rồi chạy lại không có --dry-run
ALLOW_DEPLOY=1 node scripts/push-renderer.mjs --min-main <lõi thấp nhất giao diện mới cần> --main-change
```

- **Phải dựng core trước.** `dist:mac` gói `@larkwave/core` từ `dist/`, không từ `src/`, và không tự
  dựng lại. Core cũ làm một kênh IPC thành `undefined`, app trắng màn hình khi mở, mà lúc dựng không
  có lỗi nào báo. `boot-smoke.mjs` bắt đúng lỗi này.
- `push-installers.mjs` chỉ tải tệp lên registry, không có bước manifest. Route tự thấy bản mới.
  Sau đó kiểm `curl -s https://toolswave.net/api/apps-release/larkwave` và trang `/larkwave`.
- Shell của VS Code có `ELECTRON_RUN_AS_NODE=1`, nên luôn `env -u ELECTRON_RUN_AS_NODE`. Nếu không,
  Electron thoát lặng với mã 0.
- Bản Windows dựng trên máy Windows: `scripts/win-release.ps1`, xem
  [may-phat-hanh-windows.md](may-phat-hanh-windows.md). Một bản Windows chỉ **bắt kịp** phiên bản đã
  phát hành thì **không** dùng `--main-change`.

## Về tự cập nhật trọn app (electron-updater)

Muốn tự thay cả app thì bản macOS phải được ký Developer ID và notarize; bản `.dmg` ký ad-hoc hiện
nay không làm được. Code-push giao diện là đường đi được khi chưa ký. Xem
[ky-va-notarize-macos.md](ky-va-notarize-macos.md).
