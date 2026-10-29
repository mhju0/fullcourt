import { applyGameInputCorrection } from "@/lib/game-input-corrections";
import { formatEasternDateKey } from "@/lib/nba-season";
import { isHeldGame, type GameStatus } from "@/lib/game-status";

/**
 * ESPN scoreboard → stored-game reconciliation, matched on **(date, away, home)**.
 *
 * This exists because the id-keyed path does not work and cannot be made to work:
 *
 *   - `games.external_id` is the only uniqueness guard on the table, and the 2026-27 rows are
 *     keyed `espn-<eventId>` because stats `002…` ids are not derivable (NBA game numbering is
 *     not date-ordered). An id-keyed writer fed by a *different* source would therefore INSERT
 *     a duplicate of every row rather than update it.
 *   - Both NBA-owned sources are unreachable anyway. Re-probed from a US GitHub runner on
 *     2026-08-18: `stats.nba.com` times out, `cdn.nba.com` 403s. That is a datacenter block,
 *     not a geo block — see `.github/workflows/probe-data-sources.yml`.
 *
 * Matching on the pairing instead of the id makes the writer source-agnostic: it updates an
 * `espn-` row and an `002…` row identically, so no re-keying is needed and no duplicate can be
 * created. `scripts/fetch_game_context.ts` has always matched this way and it works.
 *
 * Pure and side-effect free, like `live-score-sync.ts` — the IO shell is
 * `scripts/sync_scores_espn.ts`.
 */

export type EspnGameStatus = GameStatus | "unknown";

export type EspnScoreboardGame = {
  /** Scores match on pairing; scheduled tip changes additionally verify this event identity. */
  eventId: string;
  /** Provider fixture date, when supplied; never use a moved event for the original date. */
  date?: string;
  tipOffUtc?: string;
  awayAbbr: string;
  homeAbbr: string;
  status: EspnGameStatus;
  homeScore: number | null;
  awayScore: number | null;
  /**
   * Periods played, 4 being regulation. Null when ESPN carries no line score —
   * distinct from a known 0 overtime periods, which is what 4 means.
   */
  periods: number | null;
};

export type StoredGameRow = {
  id: number;
  externalId?: string;
  tipOffUtc?: Date | string | null;
  homeAbbr: string;
  awayAbbr: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  overtimePeriods: number;
};

export type ScoreUpdate = {
  expectedIdentity?: { date: string; homeAbbr: string; awayAbbr: string };
  gameId: number;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
  /**
   * Null means "leave whatever is stored". Written from the same payload as the score so a
   * finalized game carries its overtime in the same write — `fetch_game_context.ts` sets this
   * too, but it runs afterwards and is explicitly non-fatal, so relying on it alone would let
   * a third-party hiccup drop the overtime term from that night's fatigue.
   */
  overtimePeriods: number | null;
  scheduledTip?: { expectedExternalId: string; expectedTipOffUtc: string; tipOffUtc: string };
};

export type ScoreReconciliation = {
  updates: ScoreUpdate[];
  /** ESPN carried these; no stored row has that pairing on that date. */
  unmatchedEspn: EspnScoreboardGame[];
  /** Stored rows ESPN did not carry — a postponement, or a date it has not filled yet. */
  unmatchedStored: StoredGameRow[];
  /**
   * Stored finals that ESPN reported as not-final. Never written, always reported: a final
   * score is the one thing in this table that must not be walked backwards by a feed glitch
   * or by a re-run over old dates whose scoreboard has been recycled.
   */
  refusedDowngrades: number[];
  /**
   * Stored rows ESPN reported as being played. Never written: the writers run about hourly,
   * so a mid-game score would sit on the page unchanged until the next run. The Games page
   * marks a game live from its tip time instead (`src/lib/game-phase.ts`).
   */
  inProgress: number[];
};

/**
 * ESPN scoreboard abbreviation → this site's abbreviation, where they differ.
 *
 * Shared with `scripts/fetch_game_context.ts`, which matches on the same key. Two copies would
 * silently match two different sets of games, which is the failure this module exists to avoid.
 * Relocated franchises map to the row carrying their history, the same convention as
 * `scripts/fetch_schedule.py`'s ABBR_ALIASES.
 */
export const ESPN_ABBR: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
  SEA: "OKC",
  NJ: "BKN",
  NJN: "BKN",
  NOH: "NOP",
  NOK: "NOP",
  CHH: "CHA",
  CHO: "CHA",
  VAN: "MEM",
};

export const toOurAbbr = (espn: string): string => ESPN_ABBR[espn] ?? espn;

/** The pairing key both sides of the match are keyed by, within one ET date. */
export const gameKey = (awayAbbr: string, homeAbbr: string): string =>
  `${awayAbbr}@${homeAbbr}`;

/**
 * ESPN's `status.type` → our vocabulary.
 *
 * Names distinguish postponed/cancelled from finals: all three use state "post".
 * Unknown or contradictory labels preserve stored data.
 */
export function mapEspnStatus(
  state: string | undefined,
  completed: boolean | undefined,
  name?: string
): EspnGameStatus {
  if (name === "STATUS_POSTPONED" && state === "post" && completed === false) return "postponed";
  if (name === "STATUS_CANCELED" && state === "post" && completed === false) return "cancelled";
  if (name === "STATUS_FINAL" && state === "post" && completed === true) return "final";
  if (name === "STATUS_IN_PROGRESS" && state === "in" && completed === false) return "live";
  if (name === "STATUS_SCHEDULED" && state === "pre" && completed === false) return "scheduled";
  return "unknown";
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */

/** Parse one scoreboard response into the events it carries. Malformed events are dropped. */
export function parseScoreboard(payload: any): EspnScoreboardGame[] {
  const out: EspnScoreboardGame[] = [];
  for (const ev of payload?.events ?? []) {
    const parsed = parseEvent(ev);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseEvent(ev: any): EspnScoreboardGame | null {
  const comp = ev?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c?.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c?.homeAway === "away");
  if (!home?.team?.abbreviation || !away?.team?.abbreviation) return null;

  const homeAbbr = toOurAbbr(String(home.team.abbreviation));
  const awayAbbr = toOurAbbr(String(away.team.abbreviation));
  // A Cup knockout placeholder before its participants are known. Never a real fixture.
  if (homeAbbr === "TBD" || awayAbbr === "TBD") return null;

  const status = mapEspnStatus(comp?.status?.type?.state, comp?.status?.type?.completed, comp?.status?.type?.name);

  // Both sides list every period played; take the longer in case one is truncated.
  const periods = Math.max(
    (home.linescores ?? []).length,
    (away.linescores ?? []).length
  );

  const instant = new Date(comp?.date ?? ev?.date);
  return {
    ...(Number.isFinite(instant.getTime()) ? {date: formatEasternDateKey(instant)} : {}),
    ...(comp?.timeValid === true && Number.isFinite(instant.getTime()) ? { tipOffUtc: instant.toISOString() } : {}),
    eventId: String(ev?.id ?? ""),
    awayAbbr,
    homeAbbr,
    status,
    homeScore: parseScore(home.score, status),
    awayScore: parseScore(away.score, status),
    periods: periods > 0 ? periods : null,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * ESPN ships scores as strings, and as "0" for a game that has not tipped. A scheduled game
 * therefore has no score rather than a zero one — the same distinction the rest of this
 * codebase draws between "not measured" and "measured as zero".
 */
function parseScore(raw: unknown, status: EspnGameStatus): number | null {
  if (status !== "final") return null;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare one ET date's stored rows against that date's ESPN events and return only the
 * writes that change something.
 *
 * Caller groups by date; this function assumes every row it is given shares one date, which is
 * what makes the pairing key unique (a fixture repeats across a season, never within a night).
 */
export function reconcileScores(
  stored: readonly StoredGameRow[],
  espnGames: readonly EspnScoreboardGame[],
  dateKey?: string,
  now = new Date()
): ScoreReconciliation {
  const byKey = new Map(espnGames.filter(g => !dateKey || g.date === dateKey).map((g) => [gameKey(g.awayAbbr, g.homeAbbr), g]));
  const matchedKeys = new Set<string>();

  const updates: ScoreUpdate[] = [];
  const unmatchedStored: StoredGameRow[] = [];
  const refusedDowngrades: number[] = [];
  const inProgress: number[] = [];

  for (const row of stored) {
    const key = gameKey(row.awayAbbr, row.homeAbbr);
    const espn = byKey.get(key);
    if (!espn) {
      unmatchedStored.push(row);
      continue;
    }
    matchedKeys.add(key);

    if (espn.status === "unknown") continue;
    // Reopening needs a reviewed date/tip identity operation; a cached pregame feed is not it.
    if (isHeldGame(row.status) && (espn.status === "scheduled" || espn.status === "live")) continue;
    if (row.status === "cancelled" && espn.status === "postponed") continue;
    if (row.status === "final" && espn.status !== "final") {
      refusedDowngrades.push(row.id);
      continue;
    }

    if (espn.status === "live") {
      inProgress.push(row.id);
      continue;
    }
    const previousTip = row.tipOffUtc == null ? null : new Date(row.tipOffUtc);
    const correctedTip = dateKey && espn.tipOffUtc ? applyGameInputCorrection({ date: dateKey,
      homeAbbr: row.homeAbbr, awayAbbr: row.awayAbbr, tipOffUtc: espn.tipOffUtc }).tipOffUtc : undefined;
    const nextTip = correctedTip ? new Date(correctedTip) : null;
    const scheduledTip = dateKey && row.status === "scheduled" && espn.status === "scheduled"
      && row.externalId === `espn-${espn.eventId}`
      && espnGames.filter(game => game.date === dateKey && gameKey(game.awayAbbr, game.homeAbbr) === key).length === 1
      && previousTip && nextTip && previousTip.getTime() > now.getTime() && nextTip.getTime() > now.getTime()
      && formatEasternDateKey(previousTip) === dateKey && formatEasternDateKey(nextTip) === dateKey
      && previousTip.getTime() !== nextTip.getTime()
      ? { expectedExternalId: row.externalId, expectedTipOffUtc: previousTip.toISOString(), tipOffUtc: nextTip.toISOString() }
      : undefined;
    // A final with a blank score is a feed glitch: writing it would null a stored result or
    // record a final with no score. The next run picks the game up once the score is there.
    if (espn.status === "final" && (espn.homeScore === null || espn.awayScore === null)) continue;

    // Only from a line score, and only from a finished game: anything else would report the
    // periods played so far.
    const providerOvertimePeriods =
      espn.status === "final" && espn.periods !== null && espn.periods >= 4
        ? espn.periods - 4
        : null;

    const overtimePeriods = dateKey
      ? applyGameInputCorrection({ date: dateKey, homeAbbr: row.homeAbbr, awayAbbr: row.awayAbbr, overtimePeriods: providerOvertimePeriods }).overtimePeriods
      : providerOvertimePeriods;

    const changed =
      espn.status !== row.status ||
      espn.homeScore !== row.homeScore ||
      espn.awayScore !== row.awayScore ||
      (overtimePeriods !== null && overtimePeriods !== row.overtimePeriods) || scheduledTip !== undefined;

    if (changed) {
      updates.push({
        ...(dateKey ? {expectedIdentity:{date:dateKey,homeAbbr:row.homeAbbr,awayAbbr:row.awayAbbr}} : {}),
        gameId: row.id,
        status: espn.status,
        homeScore: espn.homeScore,
        awayScore: espn.awayScore,
        overtimePeriods,
        ...(scheduledTip ? { scheduledTip } : {}),
      });
    }
  }

  return {
    updates,
    unmatchedEspn: espnGames.filter(
      (g) => !matchedKeys.has(gameKey(g.awayAbbr, g.homeAbbr))
    ),
    unmatchedStored,
    refusedDowngrades,
    inProgress,
  };
}
