#!/usr/bin/env node
/**
 * Đúc một **deploy token** GitLab chỉ có quyền GHI PACKAGE REGISTRY của đúng dự án desktop, rồi
 * ghi thẳng ra file để mang sang máy Windows. KHÔNG in giá trị ra màn hình.
 *
 * Vì sao cần script này thay vì chép `GITLAB_TOKEN` trong .env sang:
 *   Token đó là `glpat-` toàn quyền API — nó đọc/ghi được MỌI dự án, MỌI issue, MỌI biến CI của
 *   tài khoản. Máy Windows chỉ cần làm đúng một việc: tải một file .exe lên registry của một dự
 *   án. Chép khoá to sang là trao quyền gấp hàng trăm lần việc cần làm, cho một máy sẽ nằm đó
 *   nhiều tháng không ai ngó.
 *
 * Token đúc ra:
 *   - scope: write_package_registry (KHÔNG có read_repository — máy Windows lấy mã bằng git riêng)
 *   - hết hạn sau 1 năm; đúc lại lúc nào cũng được
 *   - thu hồi được riêng, không ảnh hưởng gì tới khoá chính
 *
 * Dùng:  node scripts/make-win-deploy-token.mjs [--out <đường/dẫn>] [--months 12]
 */
import { writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const PROJECT_ID = opt('project-id', process.env.GITLAB_PROJECT_ID || '83700259');
const OUT = path.resolve(opt('out', 'win-deploy-token.txt'));
const MONTHS = Number(opt('months', '12'));

const token = process.env.GITLAB_TOKEN;
if (!token) {
  console.error('✗ Thiếu GITLAB_TOKEN. Chạy:  set -a; . ./.env; set +a; node scripts/make-win-deploy-token.mjs');
  process.exit(1);
}

const expires = new Date();
expires.setMonth(expires.getMonth() + MONTHS);
const expiresAt = expires.toISOString().slice(0, 10);

const res = await fetch(`https://gitlab.com/api/v4/projects/${PROJECT_ID}/deploy_tokens`, {
  method: 'POST',
  headers: { 'PRIVATE-TOKEN': token, 'content-type': 'application/json' },
  body: JSON.stringify({
    name: `win-release-${new Date().toISOString().slice(0, 10)}`,
    // CHỈ quyền ghi package. Cố ý không xin read_repository: máy Windows lấy mã bằng đăng nhập
    // git riêng của người dùng, không phải bằng khoá này — thu hẹp được thì thu hẹp.
    scopes: ['write_package_registry'],
    expires_at: expiresAt,
  }),
});

if (!res.ok) {
  console.error(`✗ Không tạo được deploy token: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  process.exit(1);
}

const dt = await res.json();
if (!dt?.token) {
  console.error('✗ GitLab không trả về giá trị token (chỉ xem được đúng một lần lúc tạo).');
  process.exit(1);
}

// Ghi ra file, quyền chỉ chủ sở hữu đọc. In giá trị ra màn hình là để nó nằm lại trong lịch sử
// terminal và trong bản ghi phiên làm việc — đúng thứ phải tránh với một khoá.
writeFileSync(
  OUT,
  [
    '# Deploy token GitLab cho máy dựng bản Windows.',
    '# Chỉ có quyền write_package_registry của dự án desktop — không đọc được mã nguồn.',
    `# Hết hạn: ${expiresAt}. Thu hồi ở GitLab → Settings → Repository → Deploy tokens.`,
    `GITLAB_TOKEN=${dt.token}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
try {
  chmodSync(OUT, 0o600);
} catch {
  /* best-effort trên Windows */
}

console.log(`✓ Đã tạo deploy token "${dt.name}" (hết hạn ${expiresAt}).`);
console.log(`  Ghi vào: ${OUT}  (chmod 600, KHÔNG in ra màn hình)`);
console.log('  Mang file này sang máy Windows, đổi tên thành .env trong thư mục dự án.');
console.log('  GitLab chỉ cho xem giá trị token ĐÚNG MỘT LẦN — mất thì đúc lại, đừng đi tìm.');
