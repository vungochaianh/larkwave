#!/usr/bin/env node
/**
 * Chụp danh sách route (METHOD /đường-dẫn) của API Toolswave vào fixture, để bài kiểm tương thích
 * (apps/desktop/test/endpointCompat.cjs) đối chiếu mọi lời gọi của Larkwave desktop với nó.
 *   node scripts/toolswave-routes.mjs [/Users/deveris/app]
 * Chỉ ĐỌC repo Toolswave.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2] || '/Users/deveris/app';
const src = join(root, 'apps/api/src');
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.controller.ts')) files.push(p);
  }
};
walk(src);
const routes = new Set();
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const ctl = /@Controller\(\s*(?:'([^']*)'|"([^"]*)"|\{[^}]*path:\s*'([^']*)')?/.exec(s);
  const prefix = (ctl && (ctl[1] ?? ctl[2] ?? ctl[3])) || '';
  const re = /@(Get|Post|Put|Patch|Delete|Sse)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
  let m;
  while ((m = re.exec(s))) {
    const method = m[1] === 'Sse' ? 'GET' : m[1].toUpperCase();
    const sub = m[2] ?? m[3] ?? '';
    const path = ('/' + [prefix, sub].filter(Boolean).join('/')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    routes.add(`${method} ${path}`);
  }
}
const out = join(process.cwd(), 'apps/desktop/test/fixtures/toolswave/routes.json');
writeFileSync(out, JSON.stringify({ source: 'Toolswave apps/api/src (*.controller.ts)', routes: [...routes].sort() }, null, 1) + '\n');
console.log(`${routes.size} route → ${out}`);
