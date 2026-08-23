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

import { classifyRestAdvantage, isCalledSide, winPct } from "@/lib/rest-advantage-evidence";
import {
  netEdgeGames,
  restStatePair,
  scheduleValueWins,
  type RestStateCounts,
} from "@/lib/schedule-value";

/**
 * Decidable games below which a season's rest win rate is shown as "too early"
 * rather than as a finding.
 *
 * A full season yields ~940 decidable games, worth ±3.2pp. At 100 the interval
 * is ±9.8pp — wide, but the number is no longer meaningless, and the band is
 * printed beside it either way. This is a display gate, not a modelling one.
 */
export const MIN_GAMES_FOR_INFERENCE = 100;

/**
 * Seasons that did not run the ordinary 82-game shape, and what to say about them.
 *
 * Display copy only. It changes nothing that is computed and is deliberately separate from
 * the two lists that do: `ABNORMAL_STRETCHES` (season-regime.ts) decides which *games* every
 * model may read, and `TRUNCATED_SEASONS` (schedule-disparity.ts) decides which seasons may
 * be *ranked*. A season can be unusual enough to warrant a sentence without being unusual
 * enough to exclude — 1998-99 and 2011-12 are complete seasons of normally-played basketball
 * and are excluded from nothing. This says what the reader is looking at before they read a
 * number off it.
 *
 * Every figure here was read off the loaded database, not off memory. Four seasons qualify;
 * every other season with data ran 82 games for all 30 teams.
 */
export const ABNORMAL_SEASON_NOTES: Readonly<Record<string, { label: string; note: string }>> = {
  "1998-99": {
    label: "LOCKOUT SEASON · 50 GAMES PER TEAM",
    note: "A labour dispute cut the season to 50 games per team, all of them played between 5 February and 5 May 1999. Travel and crowds were ordinary; the calendar was not. Fifty games in 89 days is denser than usual, so back-to-backs and 3-in-4s run heavier here — and every count below is drawn from a season three-fifths the usual length, so totals are smaller and the win rates carry a wider band.",
  },
  "2011-12": {
    label: "LOCKOUT SEASON · 66 GAMES PER TEAM",
    note: "A second lockout cut the season to 66 games per team, from Christmas Day 2011 to 26 April 2012. The games were played normally, but a full schedule was pressed into four months, leaving the season denser than usual. Expect more back-to-backs and fewer total miles than a full season, and read the per-team counts against 66 games rather than 82.",
  },
  "2019-20": {
    label: "SUSPENDED SEASON · 63–67 GAMES PER TEAM",
    note: "COVID-19 suspended the season on 11 March 2020, with teams having played between 63 and 67 games. This report covers those 971 games and nothing else. The 88 games that restarted the season inside the Orlando bubble are excluded here and everywhere on the site — one site, no travel, no home crowd, nothing a rest model can read. Because teams stopped at different game counts, per-team totals below are not strictly comparable to one another.",
  },
  "2020-21": {
    label: "CONDENSED SEASON · 72 GAMES PER TEAM",
    note: "The season after the bubble was shortened to 72 games per team and run from 22 December 2020 to 16 May 2021 — ten fewer games in about four weeks less time, following a 71-day off-season. The games themselves are ordinary and are included in full, but most were played in empty or capacity-limited arenas, so home crowd is weaker here than in any other season while schedule density runs slightly hotter.",
  },
};

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
  /**
   * restedWinPct − tiredWinPct, one decimal. Null when either arm is empty.
   *
   * **Read against {@link SeasonReport.swingBaseline}, never against zero.** The rested arm is
   * every game this team played as the fresher side *at home* and the tired arm is every game
   * it played as the tireder side *on the road* — `isCalledSide` admits no other combination —
   * so the two arms differ by venue as well as by rest, and a league of teams with no
   * rest-conversion skill whatsoever still shows a swing of about ten points. Plotting this
   * against a zero line credits every team with home court, which is the error the venue
   * baseline was introduced to stop `/analysis` making.
   */
  swing: number | null;
  /**
   * Which side of the rest gap this team was on, at which venue, over every completed game.
   *
   * Counted outside the `isCalledSide` filter that gates the two arms above: this describes the
   * schedule a team was handed, and a game where the visitor held the edge is still a game that
   * happened. It is what {@link SeasonReportTeam.scheduleValueWins} is computed from.
   */
  restStates: RestStateCounts;
  /** Games where this team held a rest edge, minus games where it faced one, at either venue. */
  netEdgeGames: number;
  /**
   * What those edges were worth, in wins. Schedule luck, not a result — no score is read, so a
   * 64-win team and a 17-win team handed the same schedule get the same number.
   */
  scheduleValueWins: number;
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
 * The one sentence under the tiles. Four states and no superlative: a "biggest
 * gap since 2011-12" claim reads as a finding and is a ranking of noise.
 *
 * `noNorm` is distinct from `tooEarly`: `norm === null` means the all-season baseline
 * could not be loaded (e.g. `/api/analysis` failed), not that this season's sample is
 * thin. Conflating the two would have a fully-played season announce itself as too
 * early to call.
 */
export type SeasonReportVerdict =
  | { kind: "tooEarly"; games: number }
  | { kind: "noNorm" }
  | { kind: "inLine"; winPct: number; band: number; norm: number }
  | { kind: "above"; winPct: number; band: number; norm: number }
  | { kind: "below"; winPct: number; band: number; norm: number };

export interface SeasonReport {
  season: string;
  /**
   * What the schedule-derived figures below were counted over.
   *
   * `"played"` — the ordinary case. Every figure describes games that happened.
   *
   * `"schedule"` — the season has no completed game yet, so the figures that do not need a
   * result (schedule value, travel, back-to-backs, 3-in-4s, jet-lag games) are counted over the
   * **published schedule** instead, and the ones that do need a result are empty rather than
   * zero. A season only ever reports this way before it starts: the moment one game is final,
   * it reverts to `"played"` and describes that game alone, because "so far" and "projected"
   * are different claims and a page must not silently switch between them mid-season.
   */
  basis: "played" | "schedule";
  /** Every regular-season game in the season — the progress tile's denominator. */
  scheduledGames: number;
  /** Games with a final score and both fatigue sides — every aggregate's denominator. */
  completedGames: number;
  overall: SeasonReportRate;
  atLeastTwo: SeasonReportRate;
  /**
   * The swing a team with no rest-conversion skill would still post this season, in percentage
   * points — the zero line for {@link SeasonReportTeam.swing}.
   *
   * Both arms of the swing are the same 605-odd games seen from opposite ends: the rested arm
   * is the home side of them, the tired arm is the road side. So the league's own swing is
   * `restedRate − (100 − restedRate)`, and it is almost entirely home court. Computed from the
   * counts rather than from the rounded `overall.winPct`, for the reason `venueBaseline` states.
   *
   * Null when no game this season had a called rest edge.
   */
  swingBaseline: number | null;
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
type TeamAccumulator = Omit<
  SeasonReportTeam,
  "restedWinPct" | "tiredWinPct" | "swing" | "netEdgeGames" | "scheduleValueWins"
>;

function teamEntry(teams: Map<number, TeamAccumulator>, teamId: number): TeamAccumulator {
  const existing = teams.get(teamId);
  if (existing !== undefined) return existing;

  const created: TeamAccumulator = {
    teamId,
    restedGames: 0,
    restedWins: 0,
    tiredGames: 0,
    tiredWins: 0,
    restStates: {
      restedHome: 0,
      neutralHome: 0,
      tiredHome: 0,
      restedRoad: 0,
      neutralRoad: 0,
      tiredRoad: 0,
    },
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
  // Decided once, from the whole season, before anything is counted. A per-row decision would
  // mix a played game and a projected one into the same total.
  const hasCompletedGame = rows.some(
    (r) =>
      r.status === "final" &&
      r.home !== null &&
      r.away !== null &&
      r.homeScore !== null &&
      r.awayScore !== null
  );
  const basis: SeasonReport["basis"] = hasCompletedGame ? "played" : "schedule";

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
    // Both fatigue sides are required on either basis — they are what every figure below is
    // computed from, and a game missing one cannot contribute to anything.
    if (row.home === null || row.away === null) continue;

    // Carried as a nullable pair rather than a boolean so the narrowing survives: every line
    // past the call filter reads both scores, and a boolean cannot prove they are there.
    const scores =
      row.status === "final" && row.homeScore !== null && row.awayScore !== null
        ? { home: row.homeScore, away: row.awayScore }
        : null;
    if (basis === "played" && scores === null) continue;
    if (scores !== null) completedGames++;

    const homeFatigue = Number.parseFloat(row.home.fatigueScore);
    const awayFatigue = Number.parseFloat(row.away.fatigueScore);
    accumulateScheduleTax(teamEntry(teams, row.homeTeamId), row.home);
    accumulateScheduleTax(teamEntry(teams, row.awayTeamId), row.away);

    // Played games only. The weekly curve is a record of how heavy the season *was*, and a
    // projected tail plotted on the same axis would read as measurement.
    if (scores !== null) {
      if (firstDate === null) firstDate = row.date;
      const week = bucketIndex(firstDate, row.date);
      const bucket = buckets.get(week) ?? { games: 0, fatigueSum: 0 };
      bucket.games++;
      bucket.fatigueSum += homeFatigue + awayFatigue;
      buckets.set(week, bucket);
    }

    const { differential, advantageTeam } = classifyRestAdvantage(homeFatigue, awayFatigue);

    // Both sides' rest state, recorded before the call filter below. A game the model declines
    // to call is still a game the schedule handed both teams, and schedule value is a statement
    // about the calendar rather than about the model's record on it.
    const states = restStatePair(advantageTeam);
    teamEntry(teams, row.homeTeamId).restStates[states.home]++;
    teamEntry(teams, row.awayTeamId).restStates[states.away]++;

    // The same boundary /analysis uses, from the same function — this page reports how the
    // rest *call* scored, so a game the model declines is not one of its calls and does not
    // belong in any total here. The schedule-tax accumulation above is deliberately outside
    // this check: that measures the burden a schedule imposed, which is true whether or not
    // the model made a call on the game.
    if (!isCalledSide(advantageTeam)) continue;
    // Past this point every line reads a score. On the schedule basis there is none, and a
    // rest call has no record until it has been played.
    if (scores === null) continue;

    const homeWon = scores.home > scores.away;
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
      homeScore: scores.home,
      awayScore: scores.away,
      restAdvantage: Math.round(Math.abs(differential) * 100) / 100,
      advantageTeam,
      restedTeamWon,
      restedMargin:
        advantageTeam === "home"
          ? scores.home - scores.away
          : scores.away - scores.home,
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
      netEdgeGames: netEdgeGames(t.restStates),
      // Two decimals held in the payload, one shown: the figure lives inside ±0.5 for every
      // team, so rounding it here would collapse a third of the league onto one value before
      // the UI got a chance to decide how to say so.
      scheduleValueWins: Math.round(scheduleValueWins(t.restStates) * 100) / 100,
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
    basis,
    scheduledGames: rows.length,
    completedGames,
    overall: rate(overallWins, overallGames),
    atLeastTwo: rate(tierWins, tierGames),
    swingBaseline:
      overallGames === 0
        ? null
        : Math.round(((overallWins / overallGames) * 2 - 1) * 1000) / 10,
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
  if (rate.games < MIN_GAMES_FOR_INFERENCE || rate.band === null) {
    return { kind: "tooEarly", games: rate.games };
  }
  if (norm === null) {
    return { kind: "noNorm" };
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
}
