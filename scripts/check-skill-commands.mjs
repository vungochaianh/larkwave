// Guards the skill slash-command helper: the slug/parse rules must keep behaving.
// (Trước 19/10/2026 file này còn so bản chép ở apps/api; apps/api đã gỡ khỏi repo. Cũ: tồn tại vì apps/api phụ thuộc
// @larkwave/shared only (not @larkwave/core), so the logic is duplicated on purpose.
// Run from the repo root:  node scripts/check-skill-commands.mjs
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CORE = 'packages/core/src/skillCommand.ts';
const MENU = 'packages/ui/src/components/SlashCommandMenu.tsx';
/** Compare from the first export onward — only the file header comment may differ. */
const body = (p) => {
  const src = readFileSync(p, 'utf8');
  const i = src.indexOf('export const SKILL_COMMAND_MAX');
  if (i < 0) throw new Error(`${p}: missing SKILL_COMMAND_MAX — is this still the helper?`);
  return src.slice(i);
};

let failed = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !extra ? '' : `\n   ${extra}`}`);
  if (!ok) failed++;
};

// Phép so bản-sao-chéo-repo đã chuyển sang `check-duplicates.mjs` (nó biết đường tới repo
// Toolswave và bỏ qua gọn khi máy không có repo đó). Ở đây chỉ giữ phần KIỂM HÀNH VI, vốn là
// thứ thực sự bảo vệ luật slug/parse.

// Every built-in composer command must be reserved, or a user skill could shadow it and the
// composer would offer two different meanings for the same "/word".
{
  const menu = readFileSync(MENU, 'utf8');
  const block = menu.slice(menu.indexOf('BUILTIN_SLASH_COMMANDS'));
  const builtins = [...block.matchAll(/^\s*command: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
  const reserved = readFileSync(CORE, 'utf8');
  check(builtins.length > 0, 'found the built-in command list', `no "command: '...'" entries after BUILTIN_SLASH_COMMANDS in ${MENU}`);
  const missing = builtins.filter((c) => !new RegExp(`^\\s*'${c}',$`, 'm').test(reserved));
  check(!missing.length, 'every built-in command is reserved', `missing from RESERVED_SKILL_COMMANDS: ${missing.join(', ')}`);
}

// Compile the core copy and exercise the rules.
const out = mkdtempSync(join(tmpdir(), 'tw-skillcmd-'));
try {
  execFileSync('npx', ['tsc', CORE, '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--lib', 'ES2023'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const {
    slugifySkillCommand: slug,
    parseSkillCommands: parse,
    stripSkillCommands: strip,
    uniqueSkillCommand: uniq,
  } = await import(join(out, 'skillCommand.js'));
  const eq = (got, want, label) =>
    check(JSON.stringify(got) === JSON.stringify(want), label, `got ${JSON.stringify(got)} — want ${JSON.stringify(want)}`);

  eq(slug('skill siêu bá'), 'skill-sieu-ba', 'slug strips Vietnamese tones');
  eq(slug('Đặc tả'), 'dac-ta', 'slug maps đ → d');
  eq(slug('Siêu Bá!!'), 'sieu-ba', 'slug drops punctuation');
  eq(slug('---'), '', 'slug of nothing usable is empty');
  eq(slug('a'.repeat(40)), 'a'.repeat(32), 'slug clamps to 32');
  eq(uniq('sieu-ba', ['sieu-ba']), 'sieu-ba-2', 'collisions get a numeric suffix');
  eq(uniq('run', []), 'run-2', 'reserved words never get handed out');
  eq(uniq('chay', []), 'chay-2', 'the Lark bot aliases are reserved too');
  eq(uniq('tom-tat', []), 'tom-tat-2', 'a built-in command cannot be taken by a skill');

  const known = ['sieu-ba', 'sieu-ba-pro', 'bao-cao', 'build'];
  eq(parse('/sieu-ba làm giúp tôi', known), { commands: ['sieu-ba'], stripped: 'làm giúp tôi' }, 'leading command');
  eq(parse('/sieu-ba-pro x', known), { commands: ['sieu-ba-pro'], stripped: 'x' }, 'longest command wins');
  eq(parse('/sieu-ba', known), { commands: ['sieu-ba'], stripped: '' }, 'command alone strips to empty (caller supplies text)');
  eq(parse('/SIEU-BA hoa', known), { commands: ['sieu-ba'], stripped: 'hoa' }, 'matching is case-insensitive');
  eq(parse('không có lệnh', known), { commands: [], stripped: 'không có lệnh' }, 'plain message is untouched');

  // A command is only a command at the START of a line — everything else is the user's own text.
  eq(parse('cd /build && npm run dev', known), { commands: [], stripped: 'cd /build && npm run dev' }, 'shell path mid-line is not a command');
  eq(parse('xem https://a.com/bao-cao nhé', known), { commands: [], stripped: 'xem https://a.com/bao-cao nhé' }, 'URL path is not a command');
  eq(parse('a/sieu-ba b', known), { commands: [], stripped: 'a/sieu-ba b' }, 'mid-word slash is not a command');
  eq(parse('dùng /bao-cao, rồi /sieu-ba nhé', known), { commands: [], stripped: 'dùng /bao-cao, rồi /sieu-ba nhé' }, 'mid-line commands are left alone');
  eq(parse('/bao-cao\n/sieu-ba', known), { commands: ['bao-cao', 'sieu-ba'], stripped: '' }, 'one command per line, in typed order');

  // The emitted directive must not re-parse as a command when a second layer expands again.
  eq(parse('[LỆNH SKILL: /sieu-ba — "X"]\nlàm đi', known), { commands: [], stripped: '[LỆNH SKILL: /sieu-ba — "X"]\nlàm đi' }, 'injected header is not re-expanded');

  // Stripping must not touch anything else in the message.
  const code = '/sieu-ba sửa hộ\n\n```\nif (x) {\n    doIt();\n}\n```';
  eq(parse(code, known).stripped, 'sửa hộ\n\n```\nif (x) {\n    doIt();\n}\n```', 'code indentation survives stripping');
  eq(strip('/bao-cao\n/sieu-ba x', ['sieu-ba']), '/bao-cao\nx', 'strip removes only the commands it was given');

  // Built-in skills (apps/desktop/main/runtime/skills/builtinSkills.ts): every shortcut must already be a
  // canonical slug, unique, and never a reserved word — otherwise SkillHost silently re-slugs it.
  execFileSync('npx', ['tsc', 'apps/desktop/main/runtime/skills/builtinSkills.ts', '--outDir', out, '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const { createRequire } = await import('node:module');
  const { BUILTIN_SKILLS } = createRequire(import.meta.url)(join(out, 'builtinSkills.js'));
  const { isReservedSkillCommand } = await import(join(out, 'skillCommand.js'));
  const cmds = BUILTIN_SKILLS.map((d) => d.command);
  check(cmds.every((c) => slug(c) === c), 'built-in skill commands are canonical slugs', cmds.join(', '));
  check(new Set(cmds).size === cmds.length, 'built-in skill commands are unique', cmds.join(', '));
  check(!cmds.some((c) => isReservedSkillCommand(c)), 'no built-in skill uses a reserved command', cmds.join(', '));
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll skill-command checks passed');
process.exit(failed ? 1 : 0);
