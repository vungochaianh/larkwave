#!/usr/bin/env node
/**
 * App desktop này dùng CHUNG tài khoản + API với Toolswave (`https://api.toolswave.net/v1`). API trong
 * `apps/api` của repo này KHÔNG được deploy — nên mọi đường app gọi phải có trên API của repo
 * Toolswave. Lúc tách, 13 đường đã đổi tên ở đây mà máy chủ không có: nút bấm chạy, máy chủ trả 404,
 * và không typecheck/test nào bắt được.
 *
 * Script này so hai phía:
 *   • app gọi: `apiFetch('…')` trong packages/ui/src/account/api.ts (kèm method) và mọi
 *     `${APIA_BASE}/…` trong apps/desktop/main + packages/core/src (khớp mọi method)
 *   • máy chủ có: @Controller + @Get/@Post/… trong <toolswave>/apps/api/src/**\/*.controller.ts
 *
 * Dùng:
 *   node scripts/check-toolswave-api.mjs                       # repo Toolswave ở ../app
 *   node scripts/check-toolswave-api.mjs --toolswave /path/to/app
 * Thoát mã 1 nếu có đường app gọi mà máy chủ không có.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--toolswave');
const TW = path.resolve(i >= 0 ? argv[i + 1] : path.join(ROOT, '..', 'app'));
const API_SRC = path.join(TW, 'apps/api/src');
if (!existsSync(API_SRC)) {
  console.error(`Không thấy ${API_SRC} — truyền --toolswave <đường tới repo Toolswave>.`);
  process.exit(2);
}

const walk = (d, pred, out = []) => {
  for (const f of readdirSync(d)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
};

// ── Máy chủ: route của Toolswave ───────────────────────────────────────────────────────────
const routes = [];
for (const file of walk(API_SRC, (p) => p.endsWith('.controller.ts'))) {
  const s = readFileSync(file, 'utf8');
  const ctrl = (s.match(/@Controller\(\s*(?:\{[^}]*path:\s*)?['"`]([^'"`]*)['"`]/) || [, ''])[1];
  for (const m of s.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
    const full = ('/' + [ctrl, m[2] || ''].filter(Boolean).join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
    routes.push({ method: m[1].toUpperCase(), re: new RegExp('^' + full.replace(/:[A-Za-z_]+/g, '[^/]+') + '$') });
  }
}

// ── App: các đường được gọi ────────────────────────────────────────────────────────────────
/** `${X}` → hằng chuỗi cùng tệp nếu có (vd GRANTS = '/me/lark-grants'), còn lại là một tham số. */
function normalize(raw, consts) {
  let p = raw.replace(/\$\{(\w+)\}/g, (all, name) => (name in consts ? consts[name] : all));
  p = p.replace(/\$\{[^}]*\}?/g, 'X').split('?')[0];
  if (p.endsWith('/')) p += 'X'; // `${BASE}/tokens/${id}` bị cắt ở dấu `${` → còn lại 'tokens/'
  return p.replace(/\/+/g, '/');
}
const constsOf = (s) => Object.fromEntries([...s.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([^'"`$]+)['"`]/g)].map((m) => [m[1], m[2]]));

const calls = []; // { method|null, path, where }
const apiTs = path.join(ROOT, 'packages/ui/src/account/api.ts');
{
  const s = readFileSync(apiTs, 'utf8');
  const consts = constsOf(s);
  for (const m of s.matchAll(/apiFetch(?:<[^(]*?>)?\(\s*(['"`])((?:(?!\1).)+)\1/g)) {
    // Lấy trọn lời gọi (đếm ngoặc) rồi mới tìm `method:` — thân body có thể chứa `{}` lồng nhau.
    let depth = 0, end = m.index + m[0].length;
    for (let k = s.indexOf('(', m.index); k < s.length; k++) {
      if (s[k] === '(') depth++;
      else if (s[k] === ')' && --depth === 0) { end = k; break; }
    }
    const method = (s.slice(m.index, end).match(/method:\s*['"`]([A-Z]+)['"`]/) || [, 'GET'])[1];
    calls.push({ method, path: normalize(m[2], consts), where: 'ui/account/api.ts' });
  }
}
for (const file of [...walk(path.join(ROOT, 'apps/desktop/main'), (p) => /\.tsx?$/.test(p)), ...walk(path.join(ROOT, 'packages/core/src'), (p) => /\.tsx?$/.test(p))]) {
  const s = readFileSync(file, 'utf8');
  for (const m of s.matchAll(/\$\{APIA_BASE\}(\/[^`'"\s]*)/g)) {
    calls.push({ method: null, path: normalize(m[1], constsOf(s)), where: path.relative(ROOT, file) });
  }
}

const missing = new Map();
for (const c of calls) {
  if (c.path.startsWith('/v1/')) c.path = c.path.slice(3);
  const ok = routes.some((r) => (c.method == null || r.method === c.method) && r.re.test(c.path));
  if (!ok) missing.set(`${c.method ?? '*'} ${c.path}`, c.where);
}

console.log(`Toolswave: ${routes.length} route · app gọi: ${calls.length} chỗ (${new Set(calls.map((c) => c.path)).size} đường)`);
if (!missing.size) {
  console.log('✓ mọi đường app gọi đều có trên API Toolswave');
  process.exit(0);
}
console.error(`✗ ${missing.size} đường app gọi mà API Toolswave KHÔNG có (bấm là 404):`);
for (const [k, where] of missing) console.error(`  ${k}   ← ${where}`);
console.error('Sửa phía app cho khớp đường của Toolswave, hoặc thêm route ở repo Toolswave rồi deploy nó.');
process.exit(1);
