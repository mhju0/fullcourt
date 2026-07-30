/**
 * Season Report — one season, reduced from its own games.
 *
 * ONE SIGN RULE, applied nowhere else in this module: a rest edge is always the
 * opponent's fatigue score minus this team's. Positive means THIS team is the
 * fresher side. That is the orientation `classifyRestAdvantage` already uses
 * (`differential = away − home`, positive ⇒ home advantaged), so nothing here
 * flips a sign and no two views on this page can disagree.
 *
 * Everything is pure. The DB layer supplies rows, `season-report-server.ts`
 * attaches team names, and this file decides every number on the page.
 *
 * Why the types live here rather than in `@/types`: this module imports
 * `rest-advantage-evidence`, which imports `@/types`, so declaring the response
 * shape there would close a cycle. One file per module vocabulary is also one
 * fewer place for the two halves to drift apart.
 */

import { classifyRestAdvantage, winPct } from "@/lib/rest-advantage-evidence";

/**
 * Decidable games below which a season's rest win rate is shown as "too early"
 * rather than as a finding.
 *
 * A full season yields ~940 decidable games, worth ±3.2pp. At 100 the interval
 * is ±9.8pp — wide, but the number is no longer meaningless, and the band is
 * printed beside it either way. This is a display gate, not a modelling one.
 */
export const MIN_GAMES_FOR_INFERENCE = 100;

/** One team's fatigue row for one game, as the DB layer hands it over. */
export interface SeasonReportSide {
  /** Postgres `decimal`, so a string. */
  fatigueScore: string;
  travelDistanceMiles: string;
  isBackToBack: boolean;
  isThreeInFour: boolean;
  hasTimeZoneDisplacement: boolean;
}

/**
 * One regular-season game.
 *
 * Sides are nested rather than flattened into ten `home*`/`away*` fields because
 * every consumer here handles the two symmetrically, and a nested pair cannot be
 * mixed up the way `homeIsThreeInFour` and `awayIsThreeInFour` can.
 *
 * A side is null when no fatigue row exists for it (the query left-joins so the
 * game still counts toward `scheduledGames`); such games are skipped by every
 * aggregate.
 */
export interface SeasonReportRow {
  gameId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  home: SeasonReportSide | null;
  away: SeasonReportSide | null;
}

/** A rest-advantage hit rate with the interval that says whether to believe it. */
export interface SeasonReportRate {
  games: number;
  restedTeamWins: number;
  /** Percentage to one decimal, rounded by the shared `winPct`. */
  winPct: number;
  /** Half-width of the 95% Wald interval in percentage points. Null with no games. */
  band: number | null;
}

export interface SeasonReport {
  season: string;
  /** Every regular-season game in the season — the progress tile's denominator. */
  scheduledGames: number;
  /** Games with a final score and both fatigue sides — every aggregate's denominator. */
  completedGames: number;
  overall: SeasonReportRate;
  atLeastTwo: SeasonReportRate;
}

/**
 * Half-width of the 95% Wald interval, in percentage points to one decimal.
 *
 * Wald rather than Wilson: at the sample sizes this page publishes (gated at 100
 * games, typically 400–950) and rates near 0.5, the two agree to well under the
 * 0.1pp this rounds to, and Wald is one line.
 */
export function winRateBand(wins: number, games: number): number | null {
  if (games === 0) return null;
  const p = wins / games;
  return Math.round(1960 * Math.sqrt((p * (1 - p)) / games)) / 10;
}

function rate(wins: number, games: number): SeasonReportRate {
  return {
    games,
    restedTeamWins: wins,
    winPct: winPct(wins, games),
    band: winRateBand(wins, games),
  };
}

/** The RA tier published per season alongside the overall rate. RA≥5 and ≥7 are not. */
const SECOND_TIER_THRESHOLD = 2;

export function buildSeasonReport(
  season: string,
  rows: readonly SeasonReportRow[]
): SeasonReport {
  let completedGames = 0;
  let overallGames = 0;
  let overallWins = 0;
  let tierGames = 0;
  let tierWins = 0;

  for (const row of rows) {
    if (row.home === null || row.away === null) continue;
    if (row.homeScore === null || row.awayScore === null) continue;
    completedGames++;

    const homeFatigue = Number.parseFloat(row.home.fatigueScore);
    const awayFatigue = Number.parseFloat(row.away.fatigueScore);
    const { differential, advantageTeam } = classifyRestAdvantage(homeFatigue, awayFatigue);
    if (advantageTeam === "neutral") continue;

    const homeWon = row.homeScore > row.awayScore;
    const restedTeamWon = advantageTeam === "home" ? homeWon : !homeWon;

    overallGames++;
    if (restedTeamWon) overallWins++;
    if (Math.abs(differential) >= SECOND_TIER_THRESHOLD) {
      tierGames++;
      if (restedTeamWon) tierWins++;
    }
  }

  return {
    season,
    scheduledGames: rows.length,
    completedGames,
    overall: rate(overallWins, overallGames),
    atLeastTwo: rate(tierWins, tierGames),
  };
}
