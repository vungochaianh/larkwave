#!/usr/bin/env node
if (process.env.ALLOW_DEPLOY !== '1') { console.error('Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích.'); process.exit(1); }
/**
 * BÀN GIAO giữa hai máy (Mac ↔ Windows).
 *
 * Khi hai máy thay phiên nhau qua git, thứ hay sai không phải là quên lệnh — mà là **không ai
 * biết chắc máy nào đang giữ bản mới hơn**. Người ta nhớ nhầm, rồi dựng trên mã cũ, rồi phát hành
 * một bản thiếu mất công việc của mấy hôm trước. Đúng chuyện vừa xảy ra: origin đứng ở desktop
 * 1.0.289 trong khi máy Mac đã ở 1.0.309, và bản cài Windows kẹt ở 1.0.289 suốt vì thế.
 *
 * Nên script này KHÔNG dặn dò gì cả — nó đo:
 *   • máy này là máy nào, và làm được việc gì mà máy kia không làm được
 *   • git đang lệch bao nhiêu so với origin
 *   • phiên bản desktop ở ba nơi: máy này / origin / manifest đang phát hành
 *   • bản cài của nền tảng nào đang tụt lại
 *
 * Dùng:
 *   node scripts/handoff.mjs            # xem trạng thái (mặc định)
 *   node scripts/handoff.mjs --no-net   # bỏ qua bước hỏi manifest (đang mất mạng)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NO_NET = process.argv.includes('--no-net');

const C = { d: '\x1b[2m', r: '\x1b[0m', y: '\x1b[33m', g: '\x1b[32m', e: '\x1b[31m', c: '\x1b[36m' };
const say = (m) => console.log(m);
const head = (m) => console.log(`\n${C.c}${m}${C.r}`);

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

// ── Máy này là ai, và làm được gì mà máy kia không ────────────────────────────────────────
const isMac = platform() === 'darwin';
const isWin = platform() === 'win32';
// WSL báo platform 'linux' — với luồng này nó chính là "máy Windows" (phần bash của nó).
const wsl = platform() === 'linux' && /microsoft/i.test(safeRead('/proc/version'));

function safeRead(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

const me = isMac ? 'Mac' : isWin ? 'Windows' : wsl ? 'Windows (WSL)' : 'Linux';
const other = isMac ? 'Windows' : 'Mac';

head(`MÁY NÀY: ${me} — ${hostname()}`);
if (isMac) {
  say(`  ${C.g}chỉ máy này làm được:${C.r} đóng gói bản .dmg cho macOS (cần codesign/hdiutil/lipo)`);
} else if (isWin) {
  say(`  ${C.g}chỉ máy này làm được:${C.r} đóng gói bản cài Windows (.exe/.zip)`);
} else if (wsl) {
  say(`  ${C.d}phần bash của máy Windows: deploy máy chủ, đẩy renderer, chạy kiểm${C.r}`);
  say(`  ${C.d}đóng gói bản Windows thì chạy scripts\\win-release.ps1 ở PowerShell (ngoài WSL)${C.r}`);
}

// ── Git lệch bao nhiêu ────────────────────────────────────────────────────────────────────
head('GIT');
git('fetch', 'origin', 'main', '--quiet');
const ahead = Number(git('rev-list', '--count', 'origin/main..HEAD') || '0');
const behind = Number(git('rev-list', '--count', 'HEAD..origin/main') || '0');
const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;

const problems = [];
if (behind > 0) {
  say(`  ${C.y}⬇ chậm hơn origin ${behind} commit${C.r} — máy ${other} đã đẩy lên mà máy này chưa lấy về`);
  problems.push(`git pull   ${C.d}(lấy ${behind} commit của máy ${other})${C.r}`);
}
if (ahead > 0) {
  say(`  ${C.y}⬆ đi trước origin ${ahead} commit${C.r} — máy ${other} KHÔNG thấy được công việc này`);
  problems.push(`git push origin main   ${C.d}(đẩy ${ahead} commit lên cho máy ${other})${C.r}`);
}
if (!ahead && !behind) say(`  ${C.g}✓ khớp với origin${C.r}`);
if (dirty) {
  say(`  ${C.y}✎ ${dirty} thay đổi chưa commit${C.r} — chúng sẽ KHÔNG sang được máy kia`);
  problems.push('commit trước khi bàn giao');
}

// ── Phiên bản desktop ở ba nơi ────────────────────────────────────────────────────────────
head('PHIÊN BẢN DESKTOP');
const localVer = JSON.parse(readFileSync(path.join(ROOT, 'apps/desktop/package.json'), 'utf8')).version;
let originVer = '';
try {
  originVer = JSON.parse(git('show', 'origin/main:apps/desktop/package.json') || '{}').version || '(không đọc được)';
} catch {
  originVer = '(không đọc được)';
}
say(`  máy này : ${localVer}`);
say(`  origin  : ${originVer}${originVer !== localVer ? `  ${C.y}← lệch${C.r}` : ''}`);

if (!NO_NET) {
  try {
    const res = await fetch('https://twd-desktop-renderer.pages.dev/release.json', { cache: 'no-store' });
    const m = await res.json();
    const nameOf = (u) => (u ? String(u).split('/').pop() : '(chưa có)');
    const verOf = (u) => (String(u || '').match(/toolswave-desktop\/([\d.]+)\//) || [])[1] || '?';
    say(`  đang phát hành: ${m.latestVersion}  ${C.d}(minMain ${m.minMain})${C.r}`);
    const macV = verOf(m.downloads?.mac);
    const winV = verOf(m.downloads?.win);
    say(`    mac: ${macV}  ${C.d}${nameOf(m.downloads?.mac)}${C.r}`);
    say(`    win: ${winV}  ${C.d}${nameOf(m.downloads?.win)}${C.r}`);
    // Nền tảng nào tụt lại → việc đó thuộc về máy dựng được nền tảng ấy.
    if (macV !== winV) {
      const lagging = macV > winV ? 'win' : 'mac';
      const owner = lagging === 'mac' ? 'Mac' : 'Windows';
      say(`  ${C.y}⚠ bản ${lagging} tụt lại (${lagging === 'mac' ? macV : winV} so với ${lagging === 'mac' ? winV : macV})${C.r}`);
      problems.push(
        owner === me || (wsl && owner === 'Windows')
          ? `${C.g}máy NÀY dựng được:${C.r} bản ${lagging} — xem docs/may-phat-hanh-windows.md`
          : `${C.d}chờ máy ${owner} dựng bản ${lagging} (máy này không làm được)${C.r}`,
      );
    }
  } catch {
    say(`  ${C.d}(không hỏi được manifest — mất mạng? thêm --no-net để bỏ qua)${C.r}`);
  }
}

// ── Việc cần làm, theo đúng thứ tự ────────────────────────────────────────────────────────
head('VIỆC CẦN LÀM');
if (!problems.length) {
  say(`  ${C.g}✓ không có gì — hai máy đang khớp nhau.${C.r}`);
} else {
  problems.forEach((p, i) => say(`  ${i + 1}. ${p}`));
}

// Cảnh báo thứ tự: pull TRƯỚC push, nếu không là gặp xung đột giữa lúc đang vội phát hành.
if (behind > 0 && ahead > 0) {
  say(
    `\n  ${C.e}Hai chiều cùng lệch${C.r} — pull TRƯỚC rồi mới push. Đẩy đè lên là mất công của máy ${other}.`,
  );
}
console.log('');
