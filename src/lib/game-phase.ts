import { isHeldGame } from "@/lib/game-status";

export function finalGameLabel(overtimePeriods?: number): string {
  if (!Number.isInteger(overtimePeriods) || !overtimePeriods || overtimePeriods < 1) return "FINAL";
  return overtimePeriods === 1 ? "FINAL/OT" : `FINAL/${overtimePeriods}OT`;
}

/**
 * Where a game is in its night, read from the stored status and the clock.
 *
 * The site stores no in-game score. A game is LIVE because its tip time has passed, not because
 * a feed said so: the score writers run about hourly and write finished games only, so anything
 * finer has to come from the clock. `tipOffUtc` is an instant, which keeps the answer the same
 * for a viewer in any time zone.
 */
export type GamePhase = "upcoming" | "live" | "awaitingFinal" | "final" | "postponed" | "cancelled";

/** A regulation game runs about 2h15 to 2h30; three hours also covers one overtime. */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * How long a row waits for its final before reading as unplayed again. Longer than the gap
 * to the last writer of the night, so an unresolved fixture eventually leaves the clock-derived pending state.
 * Authoritative postponed/cancelled statuses override this fallback.
 */
export const FINAL_WAIT_MS = 12 * 60 * 60 * 1000;

export function gamePhase(
  status: string,
  tipOffUtc: string | Date | null,
  nowMs: number
): GamePhase {
  if (isHeldGame(status)) return status;
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

/**
 * The phase as a clause for a row's accessible name, or "" before the tip.
 *
 * The Games row is one button and a button's name replaces its contents for a screen reader,
 * so the state and the score have to be in the name to be heard at all. Away score first,
 * the order the row prints it.
 */
export function spokenGameState(
  phase: GamePhase,
  awayScore: number | null,
  homeScore: number | null,
  overtimePeriods?: number,
): string {
  switch (phase) {
    case "live":
      return ", live,";
    case "awaitingFinal":
      return ", result pending,";
    case "final": {
      const overtime = finalGameLabel(overtimePeriods) === "FINAL" ? ""
        : overtimePeriods === 1 ? " after overtime" : ` after ${overtimePeriods} overtimes`;
      return awayScore !== null && homeScore !== null
        ? `, final ${awayScore} to ${homeScore}${overtime},`
        : `, final${overtime},`;
    }
    case "postponed":
    case "cancelled":
      return `, ${phase},`;
    case "upcoming":
      return "";
  }
}
