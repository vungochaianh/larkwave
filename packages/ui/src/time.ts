/**
 * Time formatting shared by every conversation/build surface (Trợ lý AI, Lark × Agents, làm app).
 *
 * Kept in one place on purpose: "8 giây" vs "8s" vs "0:08" drifting between three screens is the
 * kind of thing users read as three different products.
 */

/** "14:32" — the clock time something happened. Time only; the date lives in the list beside it. */
export function clockTime(ts?: number | string | null): string {
  if (!ts) return '';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * "8 giây" / "1 phút 12 giây" / "2 phút" — how long something took, in words.
 *
 * Wall-clock, i.e. what the user actually waited — not model time or billed time. Rounded to the
 * second: sub-second precision is noise at these durations.
 */
export function humanDuration(ms?: number | null): string {
  if (!ms || ms < 0) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} giây`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m < 60) return r ? `${m} phút ${r} giây` : `${m} phút`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} giờ ${rm} phút` : `${h} giờ`;
}

/** Duration between two ISO/epoch instants, for records that store start + finish. */
export function durationBetween(start?: string | number | null, end?: string | number | null): string {
  if (!start || !end) return '';
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return '';
  return humanDuration(b - a);
}
