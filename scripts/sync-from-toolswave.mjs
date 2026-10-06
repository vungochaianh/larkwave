#!/usr/bin/env node
/**
 * Kéo thay đổi từ repo Toolswave gốc sang repo này, từng commit một.
 *
 *   node scripts/sync-from-toolswave.mjs            # đồng bộ tới main mới nhất của Toolswave
 *   node scripts/sync-from-toolswave.mjs --dry      # chỉ liệt kê sẽ làm gì
 *   node scripts/sync-from-toolswave.mjs --continue # sau khi đã gỡ xung đột + commit tay
 *
 * Cấu hình + mốc đã đồng bộ nằm ở `.toolswave-sync.json`.
 *
 * Vì sao gộp 3 chiều theo TỪNG FILE thay vì `git apply` một bản vá: file ở repo này đã khác bản
 * gốc ngay từ đầu (đổi tên @toolswave/→@<app>/, "Toolswave"→tên app, phần của app kia bị cắt).
 * Bản vá thô sẽ hỏng ngữ cảnh ở gần như mọi file. Ở đây base = bản gốc TRƯỚC commit, theirs =
 * bản gốc SAU commit — cả hai đều đi qua đúng phép đổi tên lúc tách — còn ours = file hiện tại.
 *
 * Quy tắc theo trạng thái file trong commit gốc:
 *   M (sửa)  → repo này có file đó thì gộp; không có (thuộc app kia / đã đổi chỗ) thì BỎ QUA + báo.
 *   A (thêm) → thư mục cha có ở repo này và đường dẫn không bị loại thì thêm; không thì bỏ qua + báo.
 *   D (xoá)  → chỉ xoá khi file ở đây còn y hệt bản gốc; đã bị sửa ở đây thì để nguyên + báo.
 *   R (đổi tên) = D + A.
 * Repo Toolswave chỉ được ĐỌC (git show / diff-tree), không bao giờ ghi.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CFG_PATH = join(ROOT, '.toolswave-sync.json');
const cfg = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');

const name = cfg.name;
const Title = name[0].toUpperCase() + name.slice(1);
const UP = name.toUpperCase();
const SRC_RE = /^(apps|packages|tw-lark-runner|tw-agent-host|tw-cms-keeper)\//;
const exclude = (cfg.exclude || []).map((g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$'));
const warnRe = cfg.warnAddedLines ? new RegExp(cfg.warnAddedLines, 'i') : null;

const src = (...a) => execFileSync('git', ['-C', cfg.source, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const here = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const srcBlob = (rev, p) => {
  const r = spawnSync('git', ['-C', cfg.source, 'show', `${rev}:${p}`], { maxBuffer: 1 << 28 });
  return r.status === 0 ? r.stdout : null; // Buffer
};
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|md|sh|css|html|txt|prisma|sql|conf|service)$/;
const isBinary = (buf, p = '') => !TEXT_EXT.test(p) && buf && buf.includes(0);

/** Đúng phép đổi tên đã dùng lúc tách (xem docs/TACH-APP.md). */
function transform(p, s) {
  s = s.replaceAll('@toolswave/', `@${name}/`)
    .replaceAll('toolswave://', `${name}://`)
    .replace(/setAsDefaultProtocolClient\('toolswave'/g, `setAsDefaultProtocolClient('${name}'`)
    .replaceAll('TOOLSWAVE_', `${UP}_`);
  if (SRC_RE.test(p)) s = s.replace(/Toolswave/g, Title);
  return s;
}
/** Số phiên bản desktop đi đường riêng — không kéo bản bump của Toolswave sang. */
function pinVersion(p, s, ours) {
  if (!(cfg.pinVersion || []).includes(p) || ours == null) return s;
  const v = /"version":\s*"([^"]+)"/.exec(ours)?.[1];
  return v ? s.replace(/"version":\s*"[^"]+"/, `"version": "${v}"`) : s;
}

const tmp = mkdtempSync(join(tmpdir(), 'tw-sync-'));
function merge3(ours, base, theirs) {
  const [o, b, t] = ['o', 'b', 't'].map((k) => join(tmp, k));
  writeFileSync(o, ours); writeFileSync(b, base); writeFileSync(t, theirs);
  const r = spawnSync('git', ['merge-file', '-L', 'repo này', '-L', 'gốc trước', '-L', 'Toolswave', o, b, t]);
  return { text: readFileSync(o, 'utf8'), conflicts: r.status }; // status = số xung đột (>0), <0 = lỗi
}

function saveCfg() { writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + '\n'); }

if (args.has('--continue')) {
  if (!cfg.pending) { console.log('Không có commit nào đang dở.'); process.exit(0); }
  if (here('status', '--porcelain').trim()) { console.error('Cây làm việc chưa sạch — gỡ xung đột rồi commit trước đã.'); process.exit(1); }
  cfg.lastSynced = cfg.pending; cfg.pending = null; saveCfg();
  here('add', '.toolswave-sync.json');
  here('commit', '-q', '-m', `Đồng bộ Toolswave: mốc → ${cfg.lastSynced.slice(0, 7)}`);
  console.log(`Đã ghi mốc ${cfg.lastSynced.slice(0, 7)}. Chạy lại không có cờ để đi tiếp.`);
  process.exit(0);
}
if (cfg.pending) { console.error(`Đang dở commit ${cfg.pending.slice(0, 7)} — gỡ xung đột, commit, rồi chạy --continue.`); process.exit(1); }
if (!DRY && here('status', '--porcelain').trim()) { console.error('Cây làm việc chưa sạch — commit hoặc cất thay đổi trước khi đồng bộ.'); process.exit(1); }

const target = src('rev-parse', cfg.branch || 'main').trim();
const commits = src('log', '--reverse', '--first-parent', '--format=%H', `${cfg.lastSynced}..${target}`).split('\n').filter(Boolean);
if (!commits.length) { console.log(`Đã khớp Toolswave ${target.slice(0, 7)}.`); process.exit(0); }
console.log(`${commits.length} commit cần đồng bộ (${cfg.lastSynced.slice(0, 7)} → ${target.slice(0, 7)})${DRY ? ' [dry]' : ''}`);

for (const c of commits) {
  const subject = src('log', '-1', '--format=%s', c).trim();
  const body = src('log', '-1', '--format=%b', c).trim().replace(/^Co-Authored-By:.*$/gim, '').trim();
  const parent = `${c}^1`;
  const lines = src('diff-tree', '-r', '--no-commit-id', '-M', '--name-status', parent, c).split('\n').filter(Boolean);
  const done = [], skipped = [], conflicted = [], warned = [];

  const ops = [];
  for (const l of lines) {
    const [st, a, b] = l.split('\t');
    if (st[0] === 'R') { ops.push(['D', a], ['A', b, a]); } else ops.push([st[0], a]);
  }
  for (const [st, p, from] of ops) {
    const abs = join(ROOT, p);
    if (exclude.some((r) => r.test(p))) { skipped.push(`${p} (loại theo cấu hình)`); continue; }
    if (st === 'D') {
      if (!existsSync(abs)) continue;
      const base = srcBlob(parent, p);
      const same = base && (isBinary(base, p) ? base.equals(readFileSync(abs)) : transform(p, base.toString('utf8')) === readFileSync(abs, 'utf8'));
      if (!same) { skipped.push(`${p} (gốc xoá nhưng ở đây đã sửa — xem tay)`); continue; }
      if (!DRY) rmSync(abs);
      done.push(`- ${p}`); continue;
    }
    const theirsBuf = srcBlob(c, p);
    if (!theirsBuf) continue;
    const exists = existsSync(abs);
    if (st === 'A' && !exists) {
      if (!existsSync(dirname(abs)) && !cfg.allowNewDirs) { skipped.push(`${p} (thư mục cha không có ở repo này)`); continue; }
      if (!DRY) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, isBinary(theirsBuf, p) ? theirsBuf : transform(p, theirsBuf.toString('utf8'))); }
      done.push(`+ ${p}`);
      if (warnRe && !isBinary(theirsBuf, p) && warnRe.test(theirsBuf.toString('utf8'))) warned.push(p);
      continue;
    }
    if (!exists) { skipped.push(`${p} (không có ở repo này)`); continue; }
    // M, hoặc A trùng file đã có
    if (isBinary(theirsBuf, p)) { if (!DRY) writeFileSync(abs, theirsBuf); done.push(`~ ${p} (nhị phân, ghi đè)`); continue; }
    const ours = readFileSync(abs, 'utf8');
    const baseBuf = st === 'A' ? Buffer.from('') : srcBlob(parent, p) ?? Buffer.from('');
    const base = pinVersion(p, transform(p, baseBuf.toString('utf8')), ours);
    const theirs = pinVersion(p, transform(p, theirsBuf.toString('utf8')), ours);
    // Tua nhanh: file ở đây chưa hề bị sửa so với gốc → lấy thẳng bản mới (merge-file từ chối
    // file có byte NUL, mà vài file .ts nhúng sẵn dữ liệu nhị phân).
    const m = ours === base ? { text: theirs, conflicts: 0 } : merge3(ours, base, theirs);
    if (m.conflicts < 0) { skipped.push(`${p} (merge-file lỗi)`); continue; }
    if (!DRY) writeFileSync(abs, m.text);
    if (m.conflicts > 0) conflicted.push(`${p} (${m.conflicts} chỗ)`); else done.push(`~ ${p}`);
    if (warnRe) {
      const added = theirs.split('\n').filter((x) => !base.includes(x)).join('\n');
      if (warnRe.test(added)) warned.push(p);
    }
  }

  const sha = c.slice(0, 7);
  console.log(`\n■ ${sha} ${subject}`);
  for (const x of done) console.log(`   ${x}`);
  for (const x of skipped) console.log(`   · bỏ qua ${x}`);
  for (const x of warned) console.log(`   ⚠ ${x}: dòng thêm vào khớp /${cfg.warnAddedLines}/ — kiểm có phải phần của app kia không`);
  for (const x of conflicted) console.log(`   ✗ xung đột ${x}`);
  if (DRY) continue;

  const msg = `Đồng bộ Toolswave ${sha}: ${subject}\n\n${body ? body + '\n\n' : ''}Nguồn: Toolswave ${c}${skipped.length ? `\nBỏ qua: ${skipped.length} file (không thuộc repo này hoặc cần xem tay)` : ''}`;
  if (conflicted.length) {
    cfg.pending = c; saveCfg();
    writeFileSync(join(ROOT, '.git', 'TW_SYNC_MSG'), msg + '\n');
    console.log(`\nDừng ở ${sha}: gỡ xung đột, rồi \`git add -A && git commit -F .git/TW_SYNC_MSG\` và chạy --continue.`);
    process.exit(2);
  }
  cfg.lastSynced = c; saveCfg();
  here('add', '-A');
  if (!here('diff', '--cached', '--name-only').trim().replace('.toolswave-sync.json', '').trim()) {
    here('commit', '-q', '-m', `Đồng bộ Toolswave ${sha}: (không có gì thuộc repo này) ${subject}`);
  } else {
    execFileSync('git', ['-C', ROOT, 'commit', '-q', '-F', '-'], { input: msg });
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log('\nXong. Chạy lại typecheck/test trước khi đi tiếp.');
