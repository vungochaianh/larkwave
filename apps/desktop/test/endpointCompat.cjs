/**
 * Tương thích endpoint: Larkwave desktop nay gọi API của TOOLSWAVE (dùng chung tài khoản). Mọi lời
 * gọi HTTP của desktop (packages/ui/src/account/api.ts + tiến trình chính) phải khớp một route có
 * thật của API Toolswave (fixture chụp bằng `node scripts/toolswave-routes.mjs`).
 *
 * Kèm: địa chỉ API mặc định + biến ghi đè, lớp tương thích overview/storage, danh tính thiết bị.
 *
 *   bash apps/desktop/test/run.sh
 */
const assert = require('node:assert');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = join(__dirname, '..', '..', '..');
const routes = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'toolswave', 'routes.json'), 'utf8')).routes;

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e.message);
  }
};

// ── 1. Thu thập lời gọi của client ─────────────────────────────────────────────────────────────
function norm(p) {
  return (
    p
      .replace(/\$\{[^}]*\}/g, ':p')
      .split('?')[0]
      .replace(/\/+$/, '') || '/'
  );
}
const calls = new Map(); // path → { method, where }
function collect(file, re, methodLookahead, defaultMethod = 'GET') {
  const s = readFileSync(file, 'utf8');
  let m;
  while ((m = re.exec(s))) {
    const raw = m[1];
    if (!raw.startsWith('/')) continue;
    const path = norm(raw);
    const tail = s.slice(m.index, m.index + methodLookahead);
    const mm = /method:\s*'([A-Z]+)'/.exec(tail.split(/apiFetch|fetch\(/).slice(0, 2).join(''));
    const method = mm ? mm[1] : defaultMethod;
    const line = s.slice(0, m.index).split('\n').length;
    calls.set(`${method} ${path}`, `${file.replace(ROOT + '/', '')}:${line}`);
  }
}
collect(join(ROOT, 'packages/ui/src/account/api.ts'), /apiFetch<[^(]*>\(\s*[`']([^`']+)[`']/g, 260);
collect(join(ROOT, 'packages/ui/src/account/api.ts'), /apiUpload<[^(]*>\(\s*[`']([^`']+)[`']/g, 0, 'POST');
const mainFiles = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.ts')) mainFiles.push(p);
  }
};
walk(join(ROOT, 'apps/desktop/main'));
for (const f of mainFiles) {
  // headlessRunner chạy trên VM (tw-lark-runner), không phải trong desktop.
  if (f.endsWith('headlessRunner.ts')) continue;
  collect(f, /`\$\{APIA_BASE\}(\/[^`]*)`/g, 300);
}

function matches(route, call) {
  const [rm, rp] = route.split(' ');
  const [cm, cp] = call.split(' ');
  if (rm !== cm) return false;
  const a = rp.split('/');
  const b = cp.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i] || seg.startsWith(':') || b[i] === ':p');
}

t(`đã thu thập đủ lời gọi để kiểm (${calls.size})`, () => assert.ok(calls.size > 60, `${calls.size}`));
const missing = [...calls.keys()].filter((c) => !routes.some((r) => matches(r, c)));
t('MỌI lời gọi của desktop đều có route ở API Toolswave', () =>
  assert.deepStrictEqual(missing.map((c) => `${c} (${calls.get(c)})`), []),
);
t('desktop KHÔNG còn PUT lên ô sao lưu Lark dùng chung (/me/lark-backup)', () =>
  assert.ok(![...calls.keys()].includes('PUT /me/lark-backup'), calls.get('PUT /me/lark-backup')),
);
t('desktop vẫn KÉO sao lưu (nhập dữ liệu Toolswave) + giữ nhịp lease chạy lịch', () => {
  assert.ok(calls.has('GET /me/lark-backup'));
  assert.ok(calls.has('POST /me/lark-runner/beat'));
});

// ── 2. Địa chỉ API mặc định + ghi đè ───────────────────────────────────────────────────────────
const coreDist = join(ROOT, 'packages/core/dist/index.js');
const base = (env) =>
  execFileSync(process.execPath, ['-e', `process.stdout.write(require(${JSON.stringify(coreDist)}).APIA_BASE)`], {
    env: { PATH: process.env.PATH, ...env },
  }).toString();
t('APIA_BASE mặc định = API Toolswave', () => assert.strictEqual(base({}), 'https://api.toolswave.net/v1'));
t('LARKWAVE_API_BASE ghi đè (bỏ / cuối)', () => assert.strictEqual(base({ LARKWAVE_API_BASE: 'http://localhost:4000/v1/' }), 'http://localhost:4000/v1'));
t('NEXT_PUBLIC_API_BASE ghi đè khi không có LARKWAVE_API_BASE', () => assert.strictEqual(base({ NEXT_PUBLIC_API_BASE: 'https://x.test/v1' }), 'https://x.test/v1'));
t('LARKWAVE_API_BASE thắng NEXT_PUBLIC_API_BASE', () =>
  assert.strictEqual(base({ LARKWAVE_API_BASE: 'https://a.test/v1', NEXT_PUBLIC_API_BASE: 'https://b.test/v1' }), 'https://a.test/v1'),
);

// ── 3. Lớp tương thích hình dữ liệu ───────────────────────────────────────────────────────────
const compat = require(join(__dirname, '..', '.test-build', 'ui-account', 'compat.js'));
t('overview kiểu Toolswave → hình Larkwave, partial, ô hiện "—"', () => {
  const ov = compat.normalizeOverview({ totalApps: 3, totalBuilds: 9, joinedAt: '2026-01-01T00:00:00Z' });
  assert.strictEqual(ov.partial, true);
  assert.strictEqual(ov.aiRuns, 0);
  assert.strictEqual(ov.joinedAt, '2026-01-01T00:00:00Z');
  assert.strictEqual(compat.overviewCell(ov, 'aiRuns'), '—');
  assert.strictEqual(compat.overviewCell(null, 'aiRuns'), undefined);
});
t('overview kiểu Larkwave giữ nguyên số', () => {
  const ov = compat.normalizeOverview({ aiRuns: 5, remoteTasks: 1, artifacts: 2, skills: 3, scheduledTasks: 0, reports: 0, joinedAt: 'x' });
  assert.strictEqual(ov.partial, undefined);
  assert.strictEqual(compat.overviewCell(ov, 'aiRuns'), 5);
  assert.strictEqual(compat.overviewCell(ov, 'scheduledTasks'), 0);
});
t('storage: chỉ giữ nhóm uploads/chat (không cho xoá app/video/ảnh Toolswave), giữ tổng', () => {
  const u = compat.filterStorageUsage({
    totalBytes: 99,
    buckets: [{ category: 'apps' }, { category: 'uploads' }, { category: 'video' }, { category: 'image' }, { category: 'chat' }],
  });
  assert.deepStrictEqual(u.buckets.map((b) => b.category), ['uploads', 'chat']);
  assert.strictEqual(u.totalBytes, 99);
  assert.strictEqual(compat.isLarkwaveStorageCategory('apps'), false);
});

// ── 4. Danh tính thiết bị ──────────────────────────────────────────────────────────────────────
const dev = require(join(__dirname, '..', '.test-build', 'deviceIdentity.js'));
t('tên máy điều khiển từ xa = "Larkwave · <máy>"', () => {
  assert.strictEqual(dev.relayDeviceName('Mac-Studio.local'), 'Larkwave · Mac-Studio');
  assert.strictEqual(dev.relayDeviceName(''), 'Larkwave · máy này');
});
t('UA tài khoản có Electron + Larkwave/<ver> (<máy>), đúng chuỗi HĐH máy chủ dò', () => {
  const ua = dev.larkwaveUserAgent('darwin', '1.0.348', '33.0.0', 'Mac\nStudio');
  assert.match(ua, /Electron\/33\.0\.0/);
  assert.match(ua, /Larkwave\/1\.0\.348 \(MacStudio\)/);
  assert.match(ua, /Mac OS X/);
  assert.ok(!/\n/.test(ua));
  assert.match(dev.larkwaveUserAgent('win32', '1', '1', 'PC'), /Windows/);
});
t('UA chỉ thêm khi renderer chưa đặt', () => {
  assert.strictEqual(dev.withDefaultUserAgent({ 'user-agent': 'x' }, 'y')['user-agent'], 'x');
  assert.strictEqual(dev.withDefaultUserAgent(undefined, 'y')['User-Agent'], 'y');
});

console.log(fail ? `\n${fail} ca SAI` : `\nTẤT CẢ ĐÚNG (${pass})`);
process.exit(fail ? 1 : 0);
