/**
 * Skill slash-commands — the shared, dependency-free rules for turning a skill name into a
 * `/command` shortcut, validating it, and finding those shortcuts inside a chat message.
 *
 * SOURCE OF TRUTH. `apps/api/src/skills/skill-command.util.ts` is a byte-for-byte mirror of the
 * logic below (the API package cannot import @larkwave/core), so any change here must be applied
 * there too — otherwise the web composer and the server would disagree on what `/sieu-ba` means.
 */

/** Max length of a command slug (without the leading "/"). */
export const SKILL_COMMAND_MAX = 32;

/**
 * Commands we never hand out: the Lark bot already owns `/run`, and the rest are words users
 * reasonably expect to mean "chat control", not "apply a skill".
 */
export const RESERVED_SKILL_COMMANDS: readonly string[] = [
  // The Lark bot owns these three itself (`larkService.handleBotMessage`) and never runs the skill
  // expander, so a skill given one of them would silently start a build instead.
  'run',
  'chay',
  'app',
  // The composer's BUILT-IN commands (BUILTIN_SLASH_COMMANDS in
  // packages/ui/src/components/SlashCommandMenu.tsx) — a user skill must not shadow one.
  // `scripts/check-skill-commands.mjs` fails if the two lists drift apart.
  'tom-tat',
  'giai-thich',
  'viet-lai',
  'dich',
  'kiem-tra',
  'y-tuong',
  'tao-lenh',
  // Words a user would reasonably expect to mean "chat control", not "apply a skill".
  'help',
  'skills',
  'skill',
  'stop',
  'clear',
  'new',
  'reset',
  'cancel',
];

/**
 * Normalize free text into a command slug: strip Vietnamese diacritics, lowercase, keep
 * `[a-z0-9-]`, collapse/trim dashes, clamp length. Returns '' when nothing usable is left
 * (the caller then treats the skill as having no shortcut).
 */
export function slugifySkillCommand(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks (Vietnamese tones)
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_COMMAND_MAX)
    .replace(/-+$/, ''); // the slice can leave a trailing dash
}

export function isReservedSkillCommand(cmd: string): boolean {
  return RESERVED_SKILL_COMMANDS.includes((cmd || '').toLowerCase());
}

/**
 * `base`, else base-2, base-3… — so two skills never share a command (the second one would
 * silently shadow the first). `taken` is every command already in use (excluding, by the
 * caller, the skill being edited). Reserved words are treated as taken.
 */
export function uniqueSkillCommand(base: string, taken: Iterable<string>): string {
  const slug = slugifySkillCommand(base);
  if (!slug) return '';
  const used = new Set<string>();
  for (const t of taken) if (t) used.add(t.toLowerCase());
  const clash = (v: string) => used.has(v) || isReservedSkillCommand(v);
  if (!clash(slug)) return slug;
  for (let n = 2; n < 1000; n++) {
    // Keep the suffix inside the length cap.
    const suffix = `-${n}`;
    const candidate = `${slug.slice(0, SKILL_COMMAND_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!clash(candidate)) return candidate;
  }
  return '';
}

/** Escape a slug for use inside a RegExp (slugs are `[a-z0-9-]`, but stay defensive). */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A command only counts at the START OF A LINE (leading indentation allowed) — the same place the
 * composer's "/" menu offers one. Anything later in the line is ordinary text, so `cd /build`,
 * `xem file /app/index.ts` and `kiểm tra /api nhé` stay exactly as the user typed them.
 * The trailing `(?![\w-])` keeps `/bao-cao` from matching inside `/bao-cao-tuan`, and the trailing
 * `[ \t]*` swallows the one space that separated the command from the request.
 */
function commandRe(cmd: string): RegExp {
  return new RegExp(`(^|\\n)([ \\t]*)\\/${escapeRe(cmd)}(?![\\w-])[ \\t]*`, 'gi');
}

/** Known commands, de-duplicated and longest-first so ordering is stable. */
function normalizeKnown(known: Iterable<string>): string[] {
  return [...new Set([...known].map((c) => (c || '').toLowerCase()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * Find every known `/command` the message opens a line with, in the order they appear.
 *
 * `stripped` removes ALL of them; when a caller only applies some (a per-turn cap, a size budget)
 * it should call `stripSkillCommands` with the ones it kept instead, so a command it ignored stays
 * visible in the message rather than vanishing. When stripping empties the prompt the caller
 * should supply its own text — the user sent nothing but the command.
 */
export function parseSkillCommands(
  prompt: string,
  known: Iterable<string>,
): { commands: string[]; stripped: string } {
  const text = prompt || '';
  const list = normalizeKnown(known);
  if (!list.length || !text.includes('/')) return { commands: [], stripped: text };

  const hits: { index: number; cmd: string }[] = [];
  for (const cmd of list) {
    const re = commandRe(cmd);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ index: m.index, cmd });
      if (re.lastIndex === m.index) re.lastIndex++; // zero-width guard
    }
  }
  if (!hits.length) return { commands: [], stripped: text };

  hits.sort((a, b) => a.index - b.index);
  const commands: string[] = [];
  for (const h of hits) if (!commands.includes(h.cmd)) commands.push(h.cmd);
  return { commands, stripped: stripSkillCommands(text, commands) };
}

/**
 * Remove exactly the given commands' tokens from a message, leaving every other character —
 * indentation, code blocks, punctuation — byte-identical.
 */
export function stripSkillCommands(prompt: string, commands: Iterable<string>): string {
  let out = prompt || '';
  for (const cmd of normalizeKnown(commands)) out = out.replace(commandRe(cmd), '$1$2');
  return out.trim();
}
