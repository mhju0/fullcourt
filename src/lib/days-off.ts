/**
 * Days off before a game: the full calendar days between it and the team's previous
 * game, so a back-to-back is 0.
 *
 * The fatigue model stores `daysSinceLastGame` (a back-to-back is 1) and its ratified
 * terms are written against that count, so the model keeps it. This is the one place it
 * becomes the number a reader means by "days rest".
 */
export function daysOffBeforeGame(daysSinceLastGame: number | null): number | null {
  return daysSinceLastGame === null ? null : daysSinceLastGame - 1;
}

/** "0 days", "1 day", "2 days"; the em dash for a season opener. */
export function formatDaysOff(daysOff: number | null): string {
  if (daysOff === null) return "—";
  return `${daysOff} ${daysOff === 1 ? "day" : "days"}`;
}
