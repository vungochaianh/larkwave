#!/usr/bin/env node
/**
 * Dựng lại hàng loạt app đã deploy, để chúng nhận các thứ NỀN TẢNG nướng vào lúc deploy.
 *
 * VÌ SAO CẦN. Mỗi lượt deploy, pipeline ghi vào app: header bảo mật (`_headers`), đoạn đếm lượt
 * xem, huy hiệu, thẻ SEO. Chúng nằm trong artifact đã deploy, nên sửa mã nguồn KHÔNG chạm tới app
 * đang chạy — app chỉ nhận giá trị mới ở lượt deploy kế tiếp.
 *
 * Ngày 22/09/2026 hai hệ hoán đổi tên miền. Đo ngày 23/09 trên 12 app live:
 *   • 9 app  — CSP còn `frame-ancestors ... app.toolswave.net aapp.toolswave.net`
 *              ⇒ preview trong console bị chặn trắng (console nay ở toolswave.net).
 *   • 10 app — đoạn đếm lượt xem còn gọi `apia.toolswave.net/v1/track/...`
 *              ⇒ mọi lượt truy cập trả 404, thống kê chết câm.
 *
 * KHÔNG sinh code lại: mỗi app dựng ở chế độ `edit` từ ĐÚNG file của bản dựng thành công gần nhất.
 * App của người dùng không được phép đổi nội dung vì một việc bảo trì của nền tảng.
 *
 * Dùng:
 *   node scripts/app-deploy-lai-hang-loat.mjs                # xem trước: app nào cũ, không đụng gì
 *   node scripts/app-deploy-lai-hang-loat.mjs --lam          # chạy thật, lô 5
 *   node scripts/app-deploy-lai-hang-loat.mjs --lam --lo 3   # lô 3
 *   node scripts/app-deploy-lai-hang-loat.mjs --lam --toi-da 10
 *
 * Cấu hình: .blog-autopost.env (TW_API_BASE, TW_TOKEN — token phải là tài khoản admin).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const LAM = argv.includes('--lam');
const LO = Number(argv[argv.indexOf('--lo') + 1]) || 5;
const TOI_DA = Number(argv[argv.indexOf('--toi-da') + 1]) || 999;

const cfg = { ...process.env };
for (const f of ['.blog-autopost.env']) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !cfg[m[1]]) cfg[m[1]] = m[2];
  }
}
const API = (cfg.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/+$/, '');
if (!cfg.TW_TOKEN) {
  console.error('✗ thiếu TW_TOKEN trong .blog-autopost.env (cần token tài khoản admin)');
  process.exit(1);
}
const H = { Authorization: `Bearer ${cfg.TW_TOKEN}`, 'content-type': 'application/json; charset=utf-8' };
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)}  ${m}`);
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dấu hiệu app còn mang giá trị của trước ngày hoán đổi. */
const CSP_CU = /app\.toolswave\.net|aapp\.toolswave\.net/;
const TRACK_CU = /apia\.toolswave\.net\/v1\/track/;

/** Soi một app đang chạy: header + HTML. Trả { cspCu, trackCu, loi }. */
async function soi(slug) {
  try {
    const c = new AbortController();
    const hen = setTimeout(() => c.abort(), 20000);
    const r = await fetch(`https://${slug}.toolswave.net/`, { signal: c.signal, redirect: 'follow' });
    clearTimeout(hen);
    const csp = r.headers.get('content-security-policy') || '';
    const html = await r.text();
    return { cspCu: CSP_CU.test(csp), trackCu: TRACK_CU.test(html), loi: null };
  } catch (e) {
    return { cspCu: false, trackCu: false, loi: e.message.slice(0, 40) };
  }
}

async function danhSachApp() {
  const out = [];
  for (let page = 1; page <= 10; page += 1) {
    const r = await fetch(`${API}/admin/apps?page=${page}&pageSize=50&status=live`, { headers: H });
    if (!r.ok) throw new Error(`đọc danh sách app hỏng: HTTP ${r.status}`);
    const j = await r.json();
    const items = j.items ?? j.data?.items ?? [];
    out.push(...items);
    if (items.length < 50) break;
  }
  return out.filter((a) => a.slug);
}

async function trangThaiBuild(id) {
  const r = await fetch(`${API}/builds/${id}`, { headers: H });
  if (!r.ok) return null;
  const b = await r.json();
  return b.status ?? null;
}

// ── 1. Soi ───────────────────────────────────────────────────────────────────
log(`đọc danh sách app tại ${API}`);
const apps = await danhSachApp();
log(`${apps.length} app đang live — soi từng cái…`);

const can = [];
for (const a of apps) {
  // eslint-disable-next-line no-await-in-loop
  const s = await soi(a.slug);
  const co = s.cspCu || s.trackCu;
  if (co) can.push({ ...a, ...s });
  console.log(
    `  ${a.slug.padEnd(10)} ${s.loi ? `không soi được (${s.loi})` : `${s.cspCu ? 'CSP cũ ' : '       '}${s.trackCu ? 'tracking cũ' : ''}`}`,
  );
}
log(`cần dựng lại: ${can.length}/${apps.length} app`);

if (!LAM) {
  log('đây là chế độ XEM TRƯỚC — chưa đụng gì. Chạy lại với --lam để thực hiện.');
  process.exit(0);
}

// ── 2. Dựng lại theo lô ──────────────────────────────────────────────────────
const danh = can.slice(0, TOI_DA);
let ok = 0;
let hong = 0;
let hongLienTiep = 0;

for (let i = 0; i < danh.length; i += LO) {
  const lo = danh.slice(i, i + LO);
  log(`── lô ${Math.floor(i / LO) + 1}: ${lo.map((a) => a.slug).join(', ')}`);

  const chay = [];
  for (const a of lo) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetch(`${API}/admin/apps/${a.id}/redeploy`, { method: 'POST', headers: H });
    const t = await r.text();
    if (!r.ok) {
      console.log(`   ✗ ${a.slug}: không tạo được bản dựng — HTTP ${r.status} ${t.slice(0, 90)}`);
      hong += 1;
      hongLienTiep += 1;
      continue;
    }
    let buildId = null;
    try {
      buildId = JSON.parse(t).buildId;
    } catch {
      /* bỏ qua */
    }
    console.log(`   → ${a.slug}: bản dựng ${buildId ?? '?'}`);
    chay.push({ ...a, buildId });
  }

  // Chờ cả lô xong (tối đa 12 phút/lô).
  for (let n = 0; n < 72 && chay.some((x) => !x.xong); n += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ngu(10000);
    for (const x of chay) {
      if (x.xong || !x.buildId) continue;
      // eslint-disable-next-line no-await-in-loop
      const st = await trangThaiBuild(x.buildId);
      if (st === 'succeeded' || st === 'failed' || st === 'canceled') x.xong = st;
    }
  }

  // Kiểm THẬT: soi lại app, không tin mỗi trạng thái build.
  for (const x of chay) {
    // eslint-disable-next-line no-await-in-loop
    const s = await soi(x.slug);
    const sach = !s.cspCu && !s.trackCu && !s.loi;
    if (sach) {
      ok += 1;
      hongLienTiep = 0;
      console.log(`   ✓ ${x.slug}: ${x.xong ?? 'chưa rõ'} — đã sạch địa chỉ cũ`);
    } else {
      hong += 1;
      hongLienTiep += 1;
      console.log(
        `   ✗ ${x.slug}: ${x.xong ?? 'chưa xong'} — ${s.loi ? `không soi được (${s.loi})` : `${s.cspCu ? 'CSP vẫn cũ ' : ''}${s.trackCu ? 'tracking vẫn cũ' : ''}`}`,
      );
    }
  }

  /**
   * CHỐT AN TOÀN: hai app hỏng liên tiếp thì DỪNG cả đợt.
   *
   * Đây là app đang chạy của người dùng thật. Nếu cách làm sai (file lưu không dựng lại được,
   * hạ tầng đang trục trặc), chạy tiếp 30 app nữa là hỏng 30 app thay vì 2. Dừng sớm để người
   * xử lý xem lại, rồi chạy tiếp bằng --toi-da.
   */
  if (hongLienTiep >= 2) {
    log(`!! ${hongLienTiep} app hỏng liên tiếp — DỪNG để xem lại, không chạy tiếp.`);
    break;
  }
}

log(`xong: ${ok} app sạch · ${hong} app chưa sạch`);
process.exitCode = hong ? 1 : 0;
