#!/usr/bin/env node
if (process.env.ALLOW_DEPLOY !== '1') { console.error('Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích.'); process.exit(1); }
/**
 * Đẩy bản cài desktop lên CHÍNH máy chủ Toolswave, rồi trỏ manifest về đó.
 *
 * Vì sao có kịch bản này thay vì cứ dùng GitLab: đo thật từ mạng người dùng ở Việt Nam —
 *
 *     GitLab package registry :  19 KB/s
 *     app.toolswave.net       : 285 KB/s   (nhanh gấp 15 lần)
 *
 * Bản cài 214 MiB ở 19 KB/s là HƠN 3 TIẾNG. Nút "Tải & mở bộ cài" trong app không bao giờ chạy
 * xong, dù đã nâng trần thời gian lên 30 phút và đã làm được tải-tiếp — bắt người dùng bấm lại sáu
 * lần thì không gọi là dùng được. Đây không phải lỗi trong app, nên không sửa được bằng mã app.
 *
 * GitLab VẪN giữ bản cài: link cũ không gãy, và nếu máy chủ này chết thì còn chỗ tải.
 *
 * Dùng:
 *   node scripts/push-installer-server.mjs            # đẩy + trỏ manifest
 *   node scripts/push-installer-server.mjs --no-manifest   # chỉ đẩy tệp
 *
 * Cần: ROOT_SSH_PASS trong .deploy-secrets, và CF_* trong .env cho bước manifest.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.DEPLOY_HOST || '100.100.164.92';
const REMOTE_DIR = '/var/www/tw-dl';
const PUBLIC_BASE = 'https://toolswave.net/dl';
const NO_MANIFEST = process.argv.includes('--no-manifest');

const c = { red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', off: '\x1b[0m' };
const log = (m) => console.log(`${c.cyan}▸${c.off} ${m}`);
const ok = (m) => console.log(`${c.green}✓${c.off} ${m}`);
const die = (m) => {
  console.error(`${c.red}✗ ${m}${c.off}`);
  process.exit(1);
};

const VERSION = JSON.parse(readFileSync(join(ROOT, 'apps/desktop/package.json'), 'utf8')).version;
const NAME = `Toolswave-${VERSION}-universal.dmg`;
const LOCAL = join(ROOT, 'apps/desktop/dist', NAME);
if (!existsSync(LOCAL)) die(`Chưa có ${NAME}. Dựng trước: pnpm --filter desktop dist:mac`);

// Mật khẩu root BẮT ĐẦU BẰNG '#' nên `source .deploy-secrets` trả về rỗng — luôn lấy bằng grep.
const secrets = readFileSync(join(ROOT, '.deploy-secrets'), 'utf8');
const pass = (secrets.match(/^ROOT_SSH_PASS=(.*)$/m) || [])[1];
if (!pass) die('Không đọc được ROOT_SSH_PASS từ .deploy-secrets');

const SSH_OPTS = [
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'PreferredAuthentications=password',
  '-o', 'PubkeyAuthentication=no',
];
const env = { ...process.env, SSHPASS: pass };

log(`${NAME} — ${(statSync(LOCAL).size / 1048576).toFixed(1)} MiB → ${HOST}:${REMOTE_DIR}`);
const up = spawnSync(
  'rsync',
  ['-a', '--partial', '-e', `sshpass -e ssh ${SSH_OPTS.join(' ')}`, LOCAL, `root@${HOST}:${REMOTE_DIR}/`],
  { env, stdio: 'inherit' },
);
if (up.status !== 0) die('Đẩy tệp lên máy chủ hỏng.');

// `--partial` ở trên cho phép chạy lại mà không mất phần đã đẩy; chown để nginx đọc được.
spawnSync('sshpass', ['-e', 'ssh', ...SSH_OPTS, `root@${HOST}`, `chown -R www-data:www-data ${REMOTE_DIR}`], {
  env,
  stdio: 'inherit',
});

const url = `${PUBLIC_BASE}/${NAME}`;

// XÁC MINH BẰNG HTTP THẬT, không tin mã thoát của rsync: tệp lên tới nơi mà nginx không phục vụ
// được (sai quyền, sai location) thì manifest sẽ trỏ vào một link 404 — và chỉ người dùng phát hiện.
log('kiểm tra link công khai…');
const head = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code} %{size_download}', '-r', '0-1023', url], {
  encoding: 'utf8',
});
const [code] = (head.stdout || '').trim().split(' ');
if (code !== '206' && code !== '200') die(`Link chưa phục vụ được (HTTP ${code}): ${url}`);
ok(`tải được: ${url}`);

if (NO_MANIFEST) {
  console.log(`\n${c.dim}--no-manifest: chưa trỏ manifest. Chạy tay:${c.off}`);
  console.log(`   node scripts/push-renderer.mjs --mac ${url}`);
  process.exit(0);
}

log('trỏ manifest về máy chủ…');
execFileSync(process.execPath, [join(ROOT, 'scripts/push-renderer.mjs'), '--mac', url], { stdio: 'inherit' });
ok('xong — /download giờ tải từ máy chủ Toolswave.');
