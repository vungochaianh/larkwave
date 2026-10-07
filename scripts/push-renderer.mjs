#!/usr/bin/env node
if (process.env.ALLOW_DEPLOY !== '1') { console.error('Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích.'); process.exit(1); }
/**
 * push-renderer.mjs — ONE command to ship a desktop renderer code-push.
 *
 * Replaces the old manual flow (build → rsync apps/desktop/app to the deploy server →
 * ssh a one-off redeploy-renderer.sh, see docs/code-push.md). It:
 *   1. reads the desktop app version (the renderer/UI version),
 *   2. builds the Next.js renderer static export (regenerates apps/desktop/app/),
 *   3. stages just the renderer files + writes a CORRECT release.json
 *      (renderer, minMain, rendererVersion, latestVersion, notice, downloads),
 *   4. deploys to Cloudflare Pages (project twd-desktop-renderer) via wrangler,
 *   5. verifies the live manifest + /home are up and advertise the new version.
 *
 * Why this fixes "can't code-push / no version at the bottom":
 *   - the live manifest was missing `latestVersion` AND the new `rendererVersion`, so the
 *     app could never tell a fresh push apart from a stale Pages deploy. codePush.ts now
 *     refuses a remote renderer older than the installed one; this script always stamps
 *     rendererVersion = the app version, so a real push is detected and the footer updates.
 *
 * Usage:
 *   node scripts/push-renderer.mjs [options]
 *   pnpm push:renderer -- [options]
 *
 * Options:
 *   --dry-run            Build + stage + write release.json, but DO NOT deploy. Safe to
 *                        run with no credentials; inspect .pages-out/ then deploy manually.
 *   --skip-build         Reuse the existing apps/desktop/app/ export (no rebuild).
 *   --main-change        This release also changed the MAIN process → set minMain = version
 *                        (old installs fall back to bundled + see the reinstall banner).
 *   --min-main <semver>  Force a specific minMain (overrides --main-change / preserved value).
 *   --notice <text>      Optional notice surfaced in the app's version modal.
 *   --mac <url>          Installer URL for macOS (.dmg). Preserved from the live manifest if omitted.
 *   --win <url>          Installer URL for Windows (.zip). Preserved from the live manifest if omitted.
 *   --project <name>     Cloudflare Pages project (default: twd-desktop-renderer).
 *
 * Credentials for the deploy step (skip with --dry-run):
 *   Either run `wrangler login` once, OR export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *   (a Pages-scoped token). Wrangler reads those env vars automatically.
 */
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'apps', 'desktop');
const APP_DIR = path.join(DESKTOP, 'app'); // nextron renderer export target (prod distDir)
const STAGE = path.join(DESKTOP, '.pages-out'); // clean dir we actually deploy

// ── tiny arg parser ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = undefined) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const DRY = flag('dry-run');
const SKIP_BUILD = flag('skip-build');
const PROJECT = opt('project', 'larkwave-desktop-renderer'); // KHÔNG dùng twd-desktop-renderer — đó là project của Toolswave
const BASE = `https://${PROJECT}.pages.dev`;

const log = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const die = (m) => {
  console.error(`\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};
const run = (cmd, cwd = ROOT) => {
  log(cmd);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
};

// ── 1. version ────────────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const VERSION = pkg.version;
if (!VERSION) die('apps/desktop/package.json has no "version"');
log(`renderer/app version = v${VERSION}`);

// Gate: the renderer shows CHANGELOG[0].version (= APP_VERSION). If it doesn't match the
// app version, the footer would display a different number than we're stamping into the
// manifest — and the user would "not see the new version" land. Fail loudly + early.
try {
  const changelog = readFileSync(path.join(ROOT, 'packages', 'ui', 'src', 'changelog.ts'), 'utf8');
  const top = changelog.match(/version:\s*['"]([^'"]+)['"]/);
  if (top && top[1] !== VERSION) {
    die(
      `Version mismatch: apps/desktop/package.json is v${VERSION} but the top CHANGELOG entry is v${top[1]}.\n` +
        `   Add a CHANGELOG entry for v${VERSION} (packages/ui/src/changelog.ts) so the footer shows it, then re-run.`,
    );
  }
  if (top) ok(`changelog top entry matches v${VERSION}`);
} catch {
  console.warn('\x1b[33m! could not read changelog.ts to verify version — continuing.\x1b[0m');
}

// Best-effort: read the live manifest to PRESERVE minMain/downloads/notice when not overridden.
async function liveManifest() {
  try {
    const r = await fetch(`${BASE}/release.json`, { cache: 'no-store' });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}
const prev = await liveManifest();

let minMain = opt('min-main') || (flag('main-change') ? VERSION : prev.minMain) || '1.0.0';
const notice = opt('notice', prev.notice ?? null);
const downloads = {
  mac: opt('mac', prev?.downloads?.mac ?? null),
  win: opt('win', prev?.downloads?.win ?? null),
};
// latestVersion drives the "reinstall the .dmg" banner (reinstall = latestVersion > installed
// MAIN). A RENDERER-ONLY push (no --main-change) must NOT bump it — otherwise every behind
// install shows a spurious reinstall banner even though the code-push already delivered the
// update. Only a real new installer (--main-change) advances latestVersion.
const latestVersion = flag('main-change') ? VERSION : (prev.latestVersion ?? VERSION);
// mainChangedAt: bản gần nhất có sửa phần LÕI. `minMain` KHÔNG thay được vai trò này — nó trả lời
// "renderer mới có chạy nổi trên lõi cũ không", nên một bản vá lõi phát hành mà vẫn giữ nguyên
// minMain (đúng cách nên làm, để không ép ai rơi về renderer đóng gói) là hoàn toàn vô hình với
// người dùng. Agent đọc trường này để biết khi nào nên bảo người dùng cài lại.
const mainChangedAt = flag('main-change') ? VERSION : (prev.mainChangedAt ?? null);
const manifest = {
  renderer: BASE,
  minMain,
  rendererVersion: VERSION,
  latestVersion,
  mainChangedAt,
  notice,
  downloads,
};

// ── 2. build renderer ──────────────────────────────────────────────────────────
if (!SKIP_BUILD) {
  // @larkwave/shared + core must have dist/ — the renderer resolves them via their
  // package exports (transpilePackages compiles the resolved entry, which is dist).
  run('pnpm --filter @larkwave/shared build');
  run('pnpm --filter @larkwave/core build');
  // Static export → regenerates apps/desktop/app/ (renderer/next.config.js distDir '../app').
  run('pnpm --filter @larkwave/desktop exec next build renderer', DESKTOP);
} else {
  log('skip-build: reusing existing apps/desktop/app/');
}
if (!existsSync(path.join(APP_DIR, 'home', 'index.html')) && !existsSync(path.join(APP_DIR, 'home.html'))) {
  die(`renderer export not found in ${APP_DIR} (expected home/index.html). Run without --skip-build.`);
}

// ── 3. stage renderer-only files + release.json ─────────────────────────────────
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(APP_DIR, STAGE, { recursive: true });
// Drop MAIN-process artifacts that nextron also drops into app/ — they must never be
// served as the renderer (harmless if present, but keep the Pages deploy clean).
for (const f of ['background.js', 'background.js.map', 'preload.js', 'preload.js.map']) {
  rmSync(path.join(STAGE, f), { force: true });
}
writeFileSync(path.join(STAGE, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
ok(`staged renderer + release.json → ${STAGE}`);
console.log(JSON.stringify(manifest, null, 2));

// ── 4. deploy ───────────────────────────────────────────────────────────────────
if (DRY) {
  ok('dry-run: built + staged, NOT deployed. Deploy with:');
  console.log(`   pnpm dlx wrangler pages deploy ${STAGE} --project-name=${PROJECT} --branch=main --commit-dirty=true`);
  process.exit(0);
}
if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CF_API_TOKEN) {
  console.warn(
    '\x1b[33m! No CLOUDFLARE_API_TOKEN in env — wrangler will use your `wrangler login` session if present, else fail.\x1b[0m',
  );
}
run(
  `pnpm dlx wrangler pages deploy ${JSON.stringify(STAGE)} --project-name=${PROJECT} --branch=main --commit-dirty=true`,
);

// ── 5. verify ─────────────────────────────────────────────────────────────────
log('verifying live manifest…');
let verified = false;
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const m = await (await fetch(`${BASE}/release.json`, { cache: 'no-store' })).json();
    if (m.rendererVersion === VERSION) {
      verified = true;
      break;
    }
    log(`  …manifest still v${m.rendererVersion ?? '?'} (waiting for v${VERSION})`);
  } catch {
    /* keep polling */
  }
}
let homeOk = false;
try {
  homeOk = (await fetch(`${BASE}/home`, { redirect: 'follow' })).ok;
} catch {
  /* ignore */
}
if (verified && homeOk) ok(`code-push live: ${BASE}/home now serving v${VERSION}. Installed apps update on next launch.`);
else if (verified) console.warn('\x1b[33m! manifest updated but /home not reachable yet — give the CDN a minute.\x1b[0m');
else die('deployed, but the live manifest never showed the new version. Check the Cloudflare Pages dashboard.');
