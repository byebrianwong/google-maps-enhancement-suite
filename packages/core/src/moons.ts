// Moon ratings. Five moons for a 1 to 5 score, rounded to the nearest half.
// The waning moons are used because their lit side is on the left, so a row
// reads like a bar filling from left to right: 🌕🌕🌕🌗🌑 is 3.5.

export const MOON_FULL = "🌕";
export const MOON_HALF = "🌗";
export const MOON_EMPTY = "🌑";

export function roundToHalf(score: number): number {
  return Math.round(score * 2) / 2;
}

export function moons(score: number, count = 5): string {
  const s = Math.min(count, Math.max(0, roundToHalf(score)));
  const full = Math.floor(s);
  const half = s - full >= 0.5 ? 1 : 0;
  return MOON_FULL.repeat(full) + MOON_HALF.repeat(half) + MOON_EMPTY.repeat(count - full - half);
}
