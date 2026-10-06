#!/usr/bin/env node
if (process.env.ALLOW_DEPLOY !== '1') { console.error('Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích.'); process.exit(1); }
/**
 * push-installers.mjs — upload the built desktop installers (.dmg / .zip|.exe) to the
 * GitLab generic package registry, then publish the renderer + manifest so the website's
 * /download page links the new version. ONE command to cut a testable desktop release.
 *
 * Flow:
 *   1. read VERSION from apps/desktop/package.json,
 *   2. find apps/desktop/dist/*.dmg + the Windows *.exe (or *.zip),
 *   3. PUT each to gitlab.com/.../packages/generic/toolswave-desktop/<VERSION>/<canonical-name>,
 *   4. invoke push-renderer.mjs with --main-change + the new download URLs, so release.json's
 *      latestVersion + minMain + downloads.{mac,win} all point at this version.
 *
 * Build the installers first:
 *   CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @larkwave/desktop dist:mac
 *   CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @larkwave/desktop dist:win   # zip on macOS
 *
 * Credentials:
 *   GITLAB_TOKEN      (required) — a token with `api`/`write_package_registry` scope.
 *   GITLAB_PROJECT_ID (optional) — defaults to 83700259 (matches the live manifest).
 *   Plus Cloudflare auth for the manifest step (see push-renderer.mjs) — unless --dry-run.
 *
 * Usage:
 *   node scripts/push-installers.mjs [--dry-run] [--project-id <id>]
 *     --dry-run   show what WOULD upload + the push-renderer command; no upload/deploy.
 */
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { readFileSync, readdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'apps', 'desktop', 'dist');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
/**
 * CHỈ tải installer lên GitLab, KHÔNG đụng manifest/Cloudflare.
 *
 * Dành cho máy dựng bản Windows: máy đó chỉ cần đúng một quyền — ghi package registry của một dự
 * án. Bắt nó chạy cả bước manifest nghĩa là phải đặt cả khoá Cloudflare lên đó, mà máy Windows
 * không có việc gì phải deploy renderer cả. Sau khi tải xong nó in ra URL; máy chính cập nhật
 * manifest bằng `push-renderer --win <url>`.
 */
const UPLOAD_ONLY = argv.includes('--upload-only');
const projIdx = argv.indexOf('--project-id');
const PROJECT_ID = projIdx >= 0 ? argv[projIdx + 1] : process.env.GITLAB_PROJECT_ID || '83700259';
const PKG = 'toolswave-desktop';

const log = (m) => console.log(`\x1b[36m▸\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const die = (m) => {
  console.error(`\x1b[31m✗ ${m}\x1b[0m`);
  process.exit(1);
};

const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'apps', 'desktop', 'package.json'), 'utf8')).version;
if (!VERSION) die('apps/desktop/package.json has no version');
log(`desktop version = v${VERSION}`);

if (!existsSync(DIST)) die(`No build output at ${DIST}. Build the installers first (see header).`);
const files = readdirSync(DIST);
// Pick the newest matching artifact (ignore .blockmap sidecars).
const pick = (re) =>
  files
    .filter((f) => re.test(f) && !f.endsWith('.blockmap'))
    .map((f) => ({ f, m: statSync(path.join(DIST, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0]?.f;

const macLocal = pick(/\.dmg$/i);
const winLocal = pick(/\.exe$/i) || pick(/win.*\.zip$/i) || pick(/\.zip$/i);
if (!macLocal && !winLocal) die(`No .dmg or .exe/.zip found in ${DIST}.`);

// Canonical names the manifest/website link to (stable scheme, regardless of arch suffix).
const targets = [];
// Universal .dmg (arm64 + x64) → name it honestly so an Intel-Mac user isn't scared off by "arm64".
if (macLocal) targets.push({ local: macLocal, name: `Toolswave-${VERSION}-universal.dmg`, plat: 'mac' });
if (winLocal)
  targets.push({
    local: winLocal,
    name: winLocal.toLowerCase().endsWith('.exe') ? `Toolswave-${VERSION}-win.exe` : `Toolswave-${VERSION}-win.zip`,
    plat: 'win',
  });

const urlFor = (name) =>
  `https://gitlab.com/api/v4/projects/${PROJECT_ID}/packages/generic/${PKG}/${VERSION}/${name}`;

for (const t of targets) {
  const size = (statSync(path.join(DIST, t.local)).size / 1e6).toFixed(1);
  log(`${t.plat}: ${t.local}  →  ${t.name}  (${size} MB)`);
}

// CỔNG CHẶN mac: bản .app có phân phối được trên máy NGƯỜI KHÁC không.
//
// Phải nằm ở đây chứ không phải ở bước dựng: máy dựng đang tắt Gatekeeper, nên bản nào cũng mở
// được tại chỗ — kể cả bản mọi máy khác sẽ chặn. Không có cổng này thì cách duy nhất phát hiện là
// người dùng báo "mở không lên", và lúc đó bản cài đã ra ngoài rồi.
//
// Cổng này CHỈ chặn sai lệch bất thường (chữ ký hỏng, hoặc ký bằng chứng chỉ phát triển). Thiếu
// notarization là trạng thái đã biết của dự án — nó chỉ NHẮC, không chặn. Cố ý như vậy: một cổng
// lúc nào cũng đỏ sẽ bị bỏ qua theo thói quen, và lúc có sai lệch thật thì không ai còn đọc.
if (targets.find((t) => t.plat === 'mac') && process.platform === 'darwin') {
  const macApp = path.join(DIST, 'mac-universal', 'Toolswave.app');
  if (existsSync(macApp)) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-dist-mac.mjs'), macApp], {
        stdio: 'inherit',
      });
    } catch {
      die('Bản .app sai lệch so với cấu hình ký — xem phía trên. Dừng phát hành.');
    }
  }
}

const macUrl = targets.find((t) => t.plat === 'mac') ? urlFor(`Toolswave-${VERSION}-universal.dmg`) : null;
const winName = targets.find((t) => t.plat === 'win')?.name;
const winUrl = winName ? urlFor(winName) : null;

if (DRY) {
  ok('dry-run: would upload the above, then run:');
  // PHẢI tôn trọng --upload-only. Trước đây nhánh này gắn cứng --main-change và chạy TRƯỚC nhánh
  // UPLOAD_ONLY, nên chạy thử khô chỉ một đằng còn chạy thật chỉ một nẻo — mà cái nó chỉ sai đúng
  // là cờ đẩy latestVersion lên. Một bản Windows bắt kịp phiên bản ĐÃ phát hành mà dùng cờ đó thì
  // mọi người dùng macOS bị nhắc cài lại đúng bản họ đang chạy.
  const flags = UPLOAD_ONLY ? [] : ['--main-change'];
  if (macUrl) flags.push('--mac', macUrl);
  if (winUrl) flags.push('--win', winUrl);
  console.log(`   node scripts/push-renderer.mjs ${flags.join(' ')}`);
  process.exit(0);
}

/**
 * GitLab dùng HAI header khác nhau cho hai loại khoá, và gửi nhầm thì trả 401 chứ không nói gì thêm.
 *
 *   glpat-  Personal Access Token  → PRIVATE-TOKEN
 *   gldt-   Deploy Token           → DEPLOY-TOKEN
 *
 * ĐÂY LÀ LÝ DO BẢN WINDOWS KẸT Ở 1.0.289. Script này viết khi máy chính dùng khoá `glpat-`, nên
 * nó gắn cứng PRIVATE-TOKEN. Sau đó dựng đường "khoá hẹp" cho máy Windows — deploy token chỉ có
 * write_package_registry — nhưng phần xác thực không ai chỉnh. Nên đường đó CHƯA TỪNG tải lên
 * được lần nào, và vì bước sau vẫn in ra câu thành công nên không ai nhận ra.
 *
 * Đã đo trên chính endpoint này: PRIVATE-TOKEN → 401, DEPLOY-TOKEN → 201.
 */
function authHeader(tok) {
  return /^gldt-/.test(tok ?? '') ? { 'DEPLOY-TOKEN': tok } : { 'PRIVATE-TOKEN': tok };
}

const token = process.env.GITLAB_TOKEN;
if (!token) die('Set GITLAB_TOKEN (scope: api / write_package_registry) to upload installers.');

for (const t of targets) {
  const file = path.join(DIST, t.local);
  const size = statSync(file).size;
  log(`uploading ${t.name} … (${(size / 1048576).toFixed(1)} MB)`);
  // ĐỌC THEO DÒNG, không nuốt cả file vào bộ nhớ.
  //
  // `readFileSync` trên một file 116 MB dựng một Buffer 116 MB rồi đưa cho fetch. Lần phát hành
  // 1.0.310 tải lên XONG rồi tiến trình node sập lúc thoát với 0xC0000409
  // (STATUS_STACK_BUFFER_OVERRUN) — nên script báo thất bại trong khi file đã nằm trên registry.
  // Một chốt chặn báo hỏng giả còn tệ hơn không có: người ta sẽ học cách bỏ qua nó.
  //
  // `duplex: 'half'` là bắt buộc khi body là stream (yêu cầu của chuẩn fetch), không phải tuỳ chọn.
  const res = await fetch(urlFor(t.name), {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/octet-stream', 'content-length': String(size) },
    body: Readable.toWeb(createReadStream(file)),
    duplex: 'half',
  });
  if (!res.ok) die(`upload failed for ${t.name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  // PHẢI đọc hết thân phản hồi kể cả khi thành công.
  //
  // Trước đây chỉ nhánh LỖI mới gọi res.text(); đường thành công bỏ mặc luồng phản hồi. Socket
  // không được trả về pool, và lúc thoát libuv vấp:
  //     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
  // Tiến trình sập với 0xC0000409 SAU KHI đã tải lên xong — nên script báo thất bại trong khi
  // file đã nằm trên registry. Đúng kiểu lỗi làm người ta mất buổi đi tìm nhầm chỗ.
  await res.text().catch(() => '');
  ok(`uploaded ${t.name}`);
}

if (UPLOAD_ONLY) {
  ok('đã tải lên xong. KHÔNG đụng manifest (đúng ý --upload-only).');
  console.log('\nTrên MÁY CHÍNH, chạy lệnh này để manifest trỏ tới bản vừa tải:');
  const parts = ['node scripts/push-renderer.mjs'];
  if (winUrl) parts.push('--win', winUrl);
  if (macUrl) parts.push('--mac', macUrl);
  // KHÔNG gợi ý --main-change: bản Windows bắt kịp một phiên bản đã phát hành thì không được
  // đẩy latestVersion lên, nếu không người dùng macOS lại bị nhắc cài lại bản họ đang chạy.
  console.log(`   ${parts.join(' ')}`);
  process.exit(0);
}

// Publish the manifest (latestVersion = VERSION; download URLs) + the renderer.
// --main-change advances latestVersion (the reinstall BANNER). By default it also sets
// minMain = VERSION (a HARD reinstall gate) — but a backward-compatible / feature-detected
// renderer must NOT hard-gate old-main users, so forward an explicit --min-main to keep the
// floor low (non-blocking): `node scripts/push-installers.mjs --min-main 1.0.193`.
const flags = ['--main-change'];
const mmIdx = argv.indexOf('--min-main');
if (mmIdx >= 0 && argv[mmIdx + 1]) flags.push('--min-main', argv[mmIdx + 1]);
if (macUrl) flags.push('--mac', macUrl);
if (winUrl) flags.push('--win', winUrl);
log(`publishing manifest + renderer: push-renderer ${flags.join(' ')}`);
execFileSync('node', [path.join(ROOT, 'scripts', 'push-renderer.mjs'), ...flags], { cwd: ROOT, stdio: 'inherit' });
ok(`release v${VERSION} live. /download now links the new ${macUrl ? '.dmg' : ''}${macUrl && winUrl ? ' + ' : ''}${winUrl ? 'Windows' : ''}.`);
