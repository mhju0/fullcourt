/**
 * Where a game is in its night, read from the stored status and the clock.
 *
 * The site stores no in-game score. A game is LIVE because its tip time has passed, not because
 * a feed said so: the score writers run about hourly and write finished games only, so anything
 * finer has to come from the clock. `tipOffUtc` is an instant, which keeps the answer the same
 * for a viewer in any time zone.
 */
export type GamePhase = "upcoming" | "live" | "awaitingFinal" | "final";

/** A regulation game runs about 2h15 to 2h30; three hours also covers one overtime. */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * How long a row waits for its final before reading as unplayed again. Longer than the gap
 * to the last writer of the night, so only a game that was never played (postponed) gets here.
 */
export const FINAL_WAIT_MS = 12 * 60 * 60 * 1000;

export function gamePhase(
  status: string,
  tipOffUtc: string | Date | null,
  nowMs: number
): GamePhase {
  if (status === "final") return "final";
  if (tipOffUtc === null) return "upcoming";

  const sinceTip = nowMs - new Date(tipOffUtc).getTime();
  if (!(sinceTip >= 0)) return "upcoming";
  if (sinceTip < LIVE_WINDOW_MS) return "live";
  if (sinceTip < FINAL_WAIT_MS) return "awaitingFinal";
  return "upcoming";
}

/** True until the tip time. A game with no stored tip time is kept. */
export function hasNotTipped(tipOffUtc: string | Date | null, nowMs: number): boolean {
  return tipOffUtc === null || new Date(tipOffUtc).getTime() > nowMs;
}
