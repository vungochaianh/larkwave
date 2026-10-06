/**
 * Shared CHARACTER / MASCOT system for all Marketing tools (video / picture / blog).
 *
 * A recurring cartoon mascot (e.g. "Sticky" the stick-figure) featured as the subject across the
 * scenes/poster/cover, with a DIFFERENT pose + expression per narration beat. It drives:
 *   • the MAIC art/poster/cover prompt (via characterDirective) — the primary path, and
 *   • the deterministic fallback video renderer (apps/api/src/video/fallback-scene.ts drawFigure),
 *     which draws the mascot on <canvas> so it still shows if MAIC times out.
 *
 * NOTE: the web create form fetches CHARACTER_OPTIONS from the per-tool "characters" endpoints —
 * keep the ids in sync there.
 */

export type CharacterBody = 'stick' | 'round' | 'box';

export interface Character {
  id: string;
  /** Vietnamese display name for the picker. */
  name: string;
  emoji: string;
  /** none = no mascot (generic icons). */
  body: CharacterBody | 'none';
  /** Rich description injected into the MAIC prompt so the AI draws a consistent mascot. */
  desc: string;
}

export const CHARACTERS: Character[] = [
  {
    id: 'none', name: 'Không (icon)', emoji: '⚪', body: 'none',
    desc: '',
  },
  {
    id: 'sticky', name: 'Sticky (que)', emoji: '🏃', body: 'stick',
    desc:
      "a friendly STICK-FIGURE mascot named 'Sticky': a bold rounded head with big simple cartoon eyes and a very expressive mouth, thin clean black outline arms and legs, white-gloved hands and chunky white sneakers. Energetic, hype, sporty personality. Optional accessories that fit the topic: a backwards cap, a hoodie, or a dumbbell.",
  },
  {
    id: 'bloop', name: 'Bloop (tròn)', emoji: '🟣', body: 'round',
    desc:
      "a cute ROUND BLOB mascot named 'Bloop': one big soft rounded body (coloured in the accent colour) with tiny stub arms and legs, huge friendly eyes and a wide expressive mouth. Bouncy, squishy, adorable personality.",
  },
  {
    id: 'robo', name: 'Robo (robot)', emoji: '🤖', body: 'box',
    desc:
      "a little friendly ROBOT mascot named 'Robo': a rounded-square head with two glowing pixel eyes and a small antenna, a compact boxy body, and simple segmented arms and legs. Clean, techy, upbeat personality; it shows emotion through its eyes and posture.",
  },
];

export const CHARACTER_IDS: string[] = CHARACTERS.map((c) => c.id);

export const CHARACTER_OPTIONS: { id: string; name: string; emoji: string }[] = CHARACTERS.map((c) => ({
  id: c.id, name: c.name, emoji: c.emoji,
}));

export function getCharacter(id: string | null | undefined): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/**
 * Character instruction appended to a MAIC prompt.
 *  - mode 'scene' (video): show the mascot in a DIFFERENT pose+expression per beat.
 *  - mode 'still' (picture/blog cover): feature the mascot prominently in one strong pose.
 * Returns '' for the 'none' character.
 */
export function characterDirective(char: Character, mode: 'scene' | 'still'): string {
  if (char.body === 'none' || !char.desc) return '';
  const common = `\n\nMASCOT — feature this recurring character as the main subject: ${char.desc} Keep the mascot's design IDENTICAL every time it appears. Still NO on-screen text/letters/numbers.`;
  if (mode === 'scene') {
    return common + ` Give it a DIFFERENT dynamic pose AND facial expression for each narration beat — e.g. mid-sprint, a big leap, flexing/celebrating with arms up, an epic landing, a confident thumbs-up — matching the mood of that beat, full of energy.`;
  }
  return common + ` Pose it in one strong, expressive pose that fits the message.`;
}
