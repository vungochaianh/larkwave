# Desktop code push (renderer OTA)

> **Larkwave:** tài liệu này kế thừa từ Toolswave (trước khi tách). Những phần nói về dựng app
> (codegen, build, deploy app, cửa hàng, blog…) KHÔNG còn áp dụng — xem [TACH-APP.md](TACH-APP.md).

The installed desktop app loads its renderer from **Cloudflare Pages**
(`https://twd-desktop-renderer.pages.dev`) with the bundled renderer as an offline
fallback. So a renderer/UI change reaches installed apps **without a reinstall** — just
redeploy the renderer. The MAIN process (native/IPC) can't be hot-swapped — a main
change needs a new `.dmg` and is gated by `minMain` in the manifest.

## How it works (apps/desktop/main/codePush.ts)

On launch (prod), the app fetches the manifest, then:
- remote renderer is used iff it's HTTPS + `minMain` ≤ installed version + reachable;
- otherwise the bundled renderer (fallback on ANY problem — offline / 404 / abort).

Manifest (`https://twd-desktop-renderer.pages.dev/release.json`, override with
`LARKWAVE_RELEASE_URL`):

```json
{
  "renderer": "https://twd-desktop-renderer.pages.dev",
  "minMain": "1.0.2",           // min MAIN version the renderer needs
  "rendererVersion": "1.0.4",    // version of the renderer hosted here (anti-downgrade)
  "latestVersion": "1.0.4",      // newest full version → UpdateBanner suggests reinstall
  "notice": null,
  "downloads": { "mac": "…dmg", "win": "…zip" }
}
```

`rendererVersion` is REQUIRED for the anti-stale guard: `codePush.ts` refuses a remote
renderer OLDER than the installed app, so a stale Pages deploy can never downgrade a fresh
install to an old UI (which is what hid the version footer before). `scripts/push-renderer.mjs`
always stamps it = the app version.

CF project: `twd-desktop-renderer`. Auth = `wrangler login` once, OR
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the env (a Pages-scoped token).

## Push a RENDERER update (no reinstall for users) — ONE command

```bash
# from the repo root, with Cloudflare auth available (see above):
pnpm push:renderer
#   --dry-run      build + stage + write release.json, do NOT deploy (no creds needed)
#   --notice "…"   surface a message in the in-app version modal
#   --mac <url> --win <url>   set installer links shown on the /download page
```

It (1) reads the desktop version, (2) builds the renderer export, (3) stages it + writes a
correct `release.json` (incl. `rendererVersion` + `latestVersion`, preserving `minMain`/
`downloads`), (4) `wrangler pages deploy`s it, (5) verifies the live manifest + `/home`.
Installed apps pick it up on next launch (or the in-app "Tải lại bản mới" button).

> Smoke-test first with `pnpm push:renderer -- --dry-run` (the old manual rsync/ssh flow to
> `root@100.100.164.92:/tmp/redeploy-renderer.sh` is now replaced by this script).

⚠️ A bad renderer push reaches everyone (only an *unreachable* remote falls back, not a
broken-but-reachable one) — smoke-test before deploying.

## Ship a MAIN change (needs a new installer) — ONE command

A main-process change (native/IPC) can't be code-pushed — cut a new installer:

1. Bump `version` in `apps/desktop/package.json` (e.g. 1.0.5) **and** add a matching top
   entry in `packages/ui/src/changelog.ts` (the publish scripts assert they match).
2. Build the installers (unsigned is fine for testing):
   ```bash
   CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @larkwave/desktop dist:mac   # → dist/*.dmg
   CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @larkwave/desktop dist:win   # → dist/*-win.zip
   ```
   (A true Windows NSIS `.exe` needs Wine → build it on a Linux runner with the
   `electronuserland/builder:wine` image; the macOS host produces the portable `.zip`.)
3. Upload + publish in one go:
   ```bash
   GITLAB_TOKEN=… pnpm push:installers          # uploads dist installers → GitLab generic
                                                 # packages, then runs push-renderer --main-change
   ```
   This sets `minMain` + `latestVersion` = the new version and `downloads.{mac,win}`.
   - Old installs see `minMain` > their version → fall back to bundled + the UpdateBanner
     shows "phiên bản mới … tải bản cài".
   - New installs (≥ minMain) load the pushed renderer; the website `/download` page links
     the new installers automatically (it reads the same manifest via `/api/desktop-release`).

   Preview safely first: `pnpm push:installers -- --dry-run`.

## Note on full binary auto-update (electron-updater)

`electron-updater` (auto-replace the whole app) needs the macOS app to be **signed
(Developer ID + notarized)** to auto-install — the unsigned `.dmg` can't. This renderer
OTA is the unsigned-friendly path; add electron-updater later once signing is in place.
