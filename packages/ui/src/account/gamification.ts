/**
 * Gamification constants shared by the profile's "Huy hiệu thành tựu" collection.
 *
 * Mirrors @larkwave/shared (`TESTER_RANKS`, src/index.ts) — kept local because the
 * UI package must not import @larkwave/shared (React-isolation; its only dependency
 * is @larkwave/core). Keep the thresholds in sync by hand: they must match the web,
 * otherwise the same account unlocks different badges on desktop.
 */

/** One tester "danh hiệu" tier — earned by NUMBER of valid (non-rejected) bug reports. */
export interface TesterRank {
  key: string;
  title: string;
  emoji: string;
  tier: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  /** Bug reports required to unlock this badge. */
  minBugs: number;
}

export const TESTER_RANKS: TesterRank[] = [
  { key: 'rookie', title: 'Tân binh Tester', emoji: '🌱', tier: 'common', minBugs: 1 },
  { key: 'reporter', title: 'Người báo lỗi', emoji: '🐛', tier: 'rare', minBugs: 10 },
  { key: 'hunter', title: 'Thợ săn Bug', emoji: '🔍', tier: 'rare', minBugs: 25 },
  { key: 'expert', title: 'Chuyên gia QA', emoji: '🛡️', tier: 'epic', minBugs: 50 },
  { key: 'master', title: 'Bậc thầy Tester', emoji: '⭐', tier: 'legendary', minBugs: 100 },
  { key: 'legend', title: 'Huyền thoại QA', emoji: '👑', tier: 'mythic', minBugs: 250 },
];
