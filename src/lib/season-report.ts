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

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

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
  /**
   * Raw `games.status` ("scheduled" | "live" | "final"). Completion is one decision — a
   * live game can already carry both scores and both fatigue rows — and it lives here,
   * in the reducer the fixture tests can see, rather than in the query's `where` clause.
   */
  status: string;
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

/**
 * One team's season, at the only grain both per-team sections need.
 *
 * `swing` is the section's whole point. A raw win-rate-when-rested column ranks
 * team quality: in 2025-26 OKC won 83% of its rested games and also 70% of its
 * tired ones. Subtracting a team's own tired rate makes it its own control.
 * On ~30 games per arm that difference carries ~12pp of standard error, so it is
 * a record, not a ranking — the UI must not crown a winner on it.
 */
export interface SeasonReportTeam {
  teamId: number;
  /** Games this team entered as the fresher side (edge ≥ 0.5), and its record there. */
  restedGames: number;
  restedWins: number;
  /** Null when `restedGames` is 0 — distinct from a genuine 0%. */
  restedWinPct: number | null;
  tiredGames: number;
  tiredWins: number;
  tiredWinPct: number | null;
  /** restedWinPct − tiredWinPct, one decimal. Null when either arm is empty. */
  swing: number | null;
  /** Schedule facts. Counted on every completed game, decidable or not. */
  travelMiles: number;
  backToBacks: number;
  threeInFours: number;
  jetLagGames: number;
}

/**
 * One game the model had an opinion about, ranked by how loud that opinion was.
 *
 * Ranked by rest advantage and NOT by margin: the two are uncorrelated, so a
 * margin ranking surfaces blowouts the model had no conviction about (2025-26's
 * biggest "correct" margins sat at rest gaps of 1.0 and 1.6). Conviction plus
 * the result is the honest ordering, and it puts hits and misses in one table.
 */
export interface SeasonReportCall {
  gameId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  /** Absolute rest advantage to two decimals. */
  restAdvantage: number;
  advantageTeam: "home" | "away";
  restedTeamWon: boolean;
  /** Final margin from the rested side's view, so a miss is negative. */
  restedMargin: number;
}

/** One seven-day bucket of the season, for the league fatigue curve. */
export interface SeasonReportWeek {
  /** 1-based. */
  week: number;
  /** First calendar day of the bucket, YYYY-MM-DD. */
  startDate: string;
  games: number;
  /** Mean fatigue over both sides of every completed game in the bucket, two decimals. */
  avgFatigue: number;
}

/**
 * The one sentence under the tiles. Three states and no superlative: a "biggest
 * gap since 2011-12" claim reads as a finding and is a ranking of noise.
 */
export type SeasonReportVerdict =
  | { kind: "tooEarly"; games: number }
  | { kind: "inLine"; winPct: number; band: number; norm: number }
  | { kind: "above"; winPct: number; band: number; norm: number }
  | { kind: "below"; winPct: number; band: number; norm: number };

export interface SeasonReport {
  season: string;
  /** Every regular-season game in the season — the progress tile's denominator. */
  scheduledGames: number;
  /** Games with a final score and both fatigue sides — every aggregate's denominator. */
  completedGames: number;
  overall: SeasonReportRate;
  atLeastTwo: SeasonReportRate;
  teams: SeasonReportTeam[];
  loudestCalls: SeasonReportCall[];
  weeks: SeasonReportWeek[];
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

/** How many games the loudest-calls table holds. */
const LOUDEST_CALL_COUNT = 10;

/** Days per fatigue-calendar bucket, counted from the season's first game. */
const CALENDAR_BUCKET_DAYS = 7;

/**
 * Mutable accumulator. The percentages and the swing are derived once at the end;
 * `travelMiles` accumulates as a float here and is rounded in the same place.
 */
type TeamAccumulator = Omit<SeasonReportTeam, "restedWinPct" | "tiredWinPct" | "swing">;

function teamEntry(teams: Map<number, TeamAccumulator>, teamId: number): TeamAccumulator {
  const existing = teams.get(teamId);
  if (existing !== undefined) return existing;

  const created: TeamAccumulator = {
    teamId,
    restedGames: 0,
    restedWins: 0,
    tiredGames: 0,
    tiredWins: 0,
    travelMiles: 0,
    backToBacks: 0,
    threeInFours: 0,
    jetLagGames: 0,
  };
  teams.set(teamId, created);
  return created;
}

/** The schedule facts, which are true of a game whether or not its rest gap was decidable. */
function accumulateScheduleTax(entry: TeamAccumulator, side: SeasonReportSide): void {
  entry.travelMiles += Number.parseFloat(side.travelDistanceMiles);
  if (side.isBackToBack) entry.backToBacks++;
  if (side.isThreeInFour) entry.threeInFours++;
  if (side.hasTimeZoneDisplacement) entry.jetLagGames++;
}

/**
 * Which seven-day bucket a date falls in, counted from the season's first game.
 *
 * Bucketed off the first game rather than by ISO week so the first bucket is
 * always full and no season opens with a two-day sliver that reads as a quiet week.
 */
function bucketIndex(firstDate: string, date: string): number {
  const days = differenceInCalendarDays(parseISO(date), parseISO(firstDate));
  return Math.floor(days / CALENDAR_BUCKET_DAYS);
}

export function buildSeasonReport(
  season: string,
  rows: readonly SeasonReportRow[]
): SeasonReport {
  let completedGames = 0;
  let overallGames = 0;
  let overallWins = 0;
  let tierGames = 0;
  let tierWins = 0;
  const teams = new Map<number, TeamAccumulator>();
  const calls: SeasonReportCall[] = [];
  const buckets = new Map<number, { games: number; fatigueSum: number }>();
  // Rows arrive date-ascending from the query, so the first completed game dates the calendar.
  let firstDate: string | null = null;

  for (const row of rows) {
    if (row.status !== "final") continue;
    if (row.home === null || row.away === null) continue;
    if (row.homeScore === null || row.awayScore === null) continue;
    completedGames++;

    const homeFatigue = Number.parseFloat(row.home.fatigueScore);
    const awayFatigue = Number.parseFloat(row.away.fatigueScore);
    accumulateScheduleTax(teamEntry(teams, row.homeTeamId), row.home);
    accumulateScheduleTax(teamEntry(teams, row.awayTeamId), row.away);

    if (firstDate === null) firstDate = row.date;
    const week = bucketIndex(firstDate, row.date);
    const bucket = buckets.get(week) ?? { games: 0, fatigueSum: 0 };
    bucket.games++;
    bucket.fatigueSum += homeFatigue + awayFatigue;
    buckets.set(week, bucket);

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

    const restedTeamId = advantageTeam === "home" ? row.homeTeamId : row.awayTeamId;
    const tiredTeamId = advantageTeam === "home" ? row.awayTeamId : row.homeTeamId;

    const rested = teamEntry(teams, restedTeamId);
    rested.restedGames++;
    if (restedTeamWon) rested.restedWins++;

    const tired = teamEntry(teams, tiredTeamId);
    tired.tiredGames++;
    if (!restedTeamWon) tired.tiredWins++;

    calls.push({
      gameId: row.gameId,
      date: row.date,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      restAdvantage: Math.round(Math.abs(differential) * 100) / 100,
      advantageTeam,
      restedTeamWon,
      restedMargin:
        advantageTeam === "home"
          ? row.homeScore - row.awayScore
          : row.awayScore - row.homeScore,
    });
  }

  const teamRows: SeasonReportTeam[] = [...teams.values()].map((t) => {
    const restedWinPct = t.restedGames > 0 ? winPct(t.restedWins, t.restedGames) : null;
    const tiredWinPct = t.tiredGames > 0 ? winPct(t.tiredWins, t.tiredGames) : null;
    return {
      ...t,
      restedWinPct,
      tiredWinPct,
      swing:
        restedWinPct === null || tiredWinPct === null
          ? null
          : Math.round((restedWinPct - tiredWinPct) * 10) / 10,
      travelMiles: Math.round(t.travelMiles),
    };
  });

  // Nulls last, explicitly. A `(b.swing ?? -Infinity) - (a.swing ?? -Infinity)` comparator
  // returns NaN when both are null, which leaves the order down to the sort implementation.
  teamRows.sort((a, b) => {
    if (a.swing === null && b.swing === null) return a.teamId - b.teamId;
    if (a.swing === null) return 1;
    if (b.swing === null) return -1;
    return b.swing - a.swing || a.teamId - b.teamId;
  });

  calls.sort(
    (a, b) =>
      b.restAdvantage - a.restAdvantage ||
      a.date.localeCompare(b.date) ||
      a.gameId - b.gameId
  );

  const weeks: SeasonReportWeek[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, bucket]) => ({
      week: index + 1,
      // firstDate is non-null whenever a bucket exists — a bucket is only ever created
      // on the same line that sets it.
      startDate: format(
        addDays(parseISO(firstDate as string), index * CALENDAR_BUCKET_DAYS),
        "yyyy-MM-dd"
      ),
      games: bucket.games,
      // Two sides per game, so the denominator is games * 2.
      avgFatigue: Math.round((bucket.fatigueSum / (bucket.games * 2)) * 100) / 100,
    }));

  return {
    season,
    scheduledGames: rows.length,
    completedGames,
    overall: rate(overallWins, overallGames),
    atLeastTwo: rate(tierWins, tierGames),
    teams: teamRows,
    loudestCalls: calls.slice(0, LOUDEST_CALL_COUNT),
    weeks,
  };
}

/**
 * The all-season rest win rate with one season withheld.
 *
 * Withheld because a page that compares 2025-26 against a baseline containing
 * 2025-26 is grading against itself. Games are pooled rather than season rates
 * averaged, so a short season cannot weigh as much as a full one.
 */
export function allSeasonNormExcluding(
  seasonWinRates: readonly { season: string; games: number; restedTeamWins: number }[],
  season: string
): number | null {
  let games = 0;
  let wins = 0;
  for (const row of seasonWinRates) {
    if (row.season === season) continue;
    games += row.games;
    wins += row.restedTeamWins;
  }
  return games === 0 ? null : winPct(wins, games);
}

/**
 * Which of the three things the page is allowed to say about a season's rate.
 *
 * "Inside the band" means the season and the norm are not distinguishable at
 * this sample size, which is the common case: a full season carries ±3.2pp and
 * seasons rarely move further than that.
 */
export function seasonReportVerdict(
  rate: SeasonReportRate,
  norm: number | null
): SeasonReportVerdict {
  if (rate.games < MIN_GAMES_FOR_INFERENCE || rate.band === null || norm === null) {
    return { kind: "tooEarly", games: rate.games };
  }

  const delta = rate.winPct - norm;
  const shared = { winPct: rate.winPct, band: rate.band, norm };
  if (Math.abs(delta) <= rate.band) return { kind: "inLine", ...shared };
  return { kind: delta > 0 ? "above" : "below", ...shared };
}

/** A team row with the labels the UI needs, attached by the server module. */
export interface SeasonReportTeamLabelled extends SeasonReportTeam {
  abbreviation: string;
  name: string;
}

/** What `/api/season-report` returns. */
export interface SeasonReportResponse extends Omit<SeasonReport, "teams"> {
  teams: SeasonReportTeamLabelled[];
  /** True while any game in the season is unplayed, so the figures may still revise. */
  provisional: boolean;
  /** ET date the figures were computed, for the as-of line on a provisional season. */
  asOf: string;
}
