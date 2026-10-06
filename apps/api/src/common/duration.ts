/** Parse a JWT-style duration ('900s', '15m', '12h', '7d') to seconds. */
export function parseDurationToSeconds(input: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!m) {
    const n = Number(input);
    return Number.isFinite(n) ? n : 43200;
  }
  const value = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * mult;
}
