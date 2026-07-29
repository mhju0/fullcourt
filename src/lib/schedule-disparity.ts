/**
 * FullCourt — Schedule Disparity
 *
 * Which teams a season's schedule favored, headlined as **net edge games** (ratified
 * 2026-07-29): games where the team held a fatigue advantage of at least the app-wide
 * 0.5 call threshold, minus games where it faced one. Counts of discrete, nameable games
 * — not a season-summed average — with a 1.5 tier for big edges. Rest-days sums remain
 * computed internally (the cap behavior is pinned by tests and an ADR) but no longer
 * headline the page.
 *
 * Descriptive, not predictive. This reports a property of the schedule; whether rest predicts
 * outcomes is the Rest Advantage backtest's question.
 *
 * Rest days are derived here from the game dates themselves, NOT from
 * `fatigue_scores.days_since_last_game` — see docs/adr/0001-derive-rest-days-from-games.md.
 * The short version: `backfill_fatigue.ts` only fills games *missing* fatigue rows, so inserting
 * a game into a published schedule leaves its neighbours stale. The NBA does exactly that every
 * season, announcing only 80 of 82 games before opening night and filling the rest once NBA Cup
 * group play resolves in December.
 *
 * Every figure is scoped to a single season. There is deliberately no cross-season comparison —
 * season length, team count, and the league-wide rest distribution all shifted across the ~40
 * seasons, so ranking raw totals across eras would compare numbers that do not mean the same
 * thing. See the design spec, §6.
 */

import { differenceInCalendarDays, parseISO } from "date-fns";
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "./rest-advantage-evidence";

/**
 * A game is a "big edge" at this fatigue gap or more. One tier above the app-wide call
 * threshold ({@link NEUTRAL_REST_ADVANTAGE_THRESHOLD}); flagged for calibration review
 * alongside the displacement bonus.
 */
export const BIG_EDGE_FATIGUE_THRESHOLD = 1.5;

/**
 * Rest is capped per side before differencing. The fatigue model already holds that rest stops
 * helping after three days (`FRESHNESS_PLATEAU_DAYS`, ./fatigue.ts); without a cap the All-Star
 * break dominates a season total with something that is not disparity — both teams get about a
 * week off, rarely the same number of days, and those few games swamp the other eighty.
 */
export const REST_DAYS_CAP = 5;

/** A game counts toward the 3+ day bucket at this rest-days edge or greater. */
const LARGE_EDGE_DAYS = 3;

export interface DisparityGameRow {
  date: string; // "YYYY-MM-DD"
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  /** Fatigue scores are nullable: unplayed games may not be scored yet. */
  homeFatigueScore: string | null;
  awayFatigueScore: string | null;
}

export interface DisparityTeamRow {
  teamId: number;
  /** Games counted — excludes each side's season opener (no previous game to rest from). */
  games: number;
  /** Season sum of (own rest days − opponent rest days), each side capped at REST_DAYS_CAP. */
  netRestEdge: number;
  /** The same sum with no cap applied, so the cap stays auditable. */
  netRestEdgeUncapped: number;
  /** Season sum of (opponent fatigue − own fatigue). Null when no counted game is scored. */
  netFatigueEdge: number | null;
  /**
   * The same figure per counted game — what the page displays.
   *
   * The season sum is the misleading form: 81 games of a small per-game difference reads as a
   * three-digit number and invites over-reading. Per game it lands on the same scale as the
   * flagship rest advantage, where the app already treats a gap below
   * NEUTRAL_REST_ADVANTAGE_THRESHOLD as no call at all.
   */
  netFatigueEdgePerGame: number | null;
  /**
   * Back-to-backs AVOIDED: opponents' count minus this team's, over counted games. Oriented so
   * positive is favorable, matching netRestEdge and netFatigueEdge — every figure this module
   * publishes answers "did the schedule treat this team better than the teams it played?".
   */
  backToBackEdge: number;
  /** Third-night-in-four games avoided, same orientation. */
  threeInFourEdge: number;
  /** Fourth-night-in-six games avoided, same orientation. */
  fourInSixEdge: number;
  /** Counted games with a fatigue advantage ≥ the app's 0.5 call threshold. */
  favorableGames: number;
  /** Counted games facing a fatigue disadvantage ≥ 0.5. */
  unfavorableGames: number;
  /** favorableGames − unfavorableGames: the page's headline ranking. */
  netEdgeGames: number;
  /** The ≥ {@link BIG_EDGE_FATIGUE_THRESHOLD} tier of favorableGames. */
  bigFavorableGames: number;
  /** The ≥ 1.5 tier of unfavorableGames. */
  bigUnfavorableGames: number;
  /** Counted games where the team had more rest than its opponent. */
  gamesWithEdge: number;
  /** Counted games where that edge was LARGE_EDGE_DAYS or more. */
  gamesWithLargeEdge: number;
}

export interface DisparityLeagueRow {
  /** Largest and smallest team net edge games this season, and the spread between them. */
  largestEdge: number;
  largestDisadvantage: number;
  delta: number;
  /** Counted games where either side's fatigue edge reached 0.5 / the 1.5 big tier. */
  gamesWithAnyEdge: number;
  gamesWithLargeEdge: number;
  /** Counted games — the denominator for the two counts above. */
  countedGames: number;
}

export interface ScheduleDisparityResult {
  season: string;
  /**
   * True when any game in the season is not final, so figures may still revise. Read from game
   * status rather than a game count: a hardcoded 82 would wrongly mark the lockout seasons
   * (50 games in 1998-99, 66 in 2011-12, 72 in 2020-21) provisional forever.
   */
  provisional: boolean;
  /** Every regular-season game in the season, counted or not — the honest denominator. */
  scheduledGames: number;
  /** Games scheduled per team, min and max across teams. Equal unless the schedule is uneven. */
  gamesPerTeamMin: number;
  gamesPerTeamMax: number;
  teams: DisparityTeamRow[];
  league: DisparityLeagueRow;
}

/** One team's appearance in a game, once rest is known for both sides. */
interface CountedSide {
  restDays: number;
  oppRestDays: number;
  fatigue: number | null;
  oppFatigue: number | null;
  isBackToBack: boolean;
  isThreeInFour: boolean;
  isFourInSix: boolean;
  oppIsThreeInFour: boolean;
  oppIsFourInSix: boolean;
}

function cap(days: number): number {
  return Math.min(days, REST_DAYS_CAP);
}

/**
 * Games each team plays, ascending by date. Ties on date are impossible in practice (a team
 * plays at most once a day) but sort stably anyway so the result never depends on row order.
 */
function gamesByTeam(games: DisparityGameRow[]): Map<number, DisparityGameRow[]> {
  const byTeam = new Map<number, DisparityGameRow[]>();
  for (const g of games) {
    for (const teamId of [g.homeTeamId, g.awayTeamId]) {
      const list = byTeam.get(teamId);
      if (list) list.push(g);
      else byTeam.set(teamId, [g]);
    }
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return byTeam;
}

/**
 * Calendar days of rest before each game in an ascending list of a team's game dates. The
 * season opener has no previous game and is `null`, which is what excludes it from every metric.
 *
 * Exported for the pinning test that holds this definition equal to the fatigue model's
 * `daysSinceLastGame` (see the ADR). If the two ever disagree, that test must fail.
 */
export function restDaysBeforeGames(dates: readonly string[]): (number | null)[] {
  return dates.map((date, i) =>
    i === 0 ? null : differenceInCalendarDays(parseISO(date), parseISO(dates[i - 1]))
  );
}

/**
 * Rest days keyed by game. The opener is absent from the map rather than null-valued, so a
 * `undefined` lookup is the single "not counted" signal at the call site.
 */
function restDaysByGame(teamGames: DisparityGameRow[]): Map<DisparityGameRow, number> {
  const rest = new Map<DisparityGameRow, number>();
  const days = restDaysBeforeGames(teamGames.map((g) => g.date));
  days.forEach((d, i) => {
    if (d !== null) rest.set(teamGames[i], d);
  });
  return rest;
}

/** ≥2 games in a rolling 2-calendar-day window ending at this game — i.e. played yesterday. */
function isBackToBack(restDays: number): boolean {
  return restDays === 1;
}

/**
 * Whether this game closes a window of `needed` games within `spanDays` calendar days, counting
 * the game itself — "this game is the third in four nights".
 *
 * Deliberately NOT the same predicate as `fatigue_scores.is_three_in_four`. That flag asks
 * whether a 3-in-4 occurred anywhere in the team's 30-day lookback
 * (`maxGamesInRollingCalendarSpan`, ./fatigue.ts), which stays true for many games afterwards
 * and so cannot be summed into a meaningful season count. Here each game is classified on its
 * own, so the season total counts actual short-rest games.
 */
function closesDenseWindow(
  teamGames: DisparityGameRow[],
  index: number,
  needed: number,
  spanDays: number
): boolean {
  const end = parseISO(teamGames[index].date);
  let count = 0;
  for (let i = index; i >= 0; i--) {
    if (differenceInCalendarDays(end, parseISO(teamGames[i].date)) >= spanDays) break;
    count++;
  }
  return count >= needed;
}

function toFatigue(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute a season's schedule disparity from its regular-season games.
 *
 * Callers must pass exactly one season's games, already filtered to `game_type = 'regular'`.
 * A game counts for a team only when BOTH sides have a previous game in the season, so neither
 * team's opener is counted for either side.
 */
export function computeScheduleDisparity(
  season: string,
  games: DisparityGameRow[]
): ScheduleDisparityResult {
  const byTeam = gamesByTeam(games);
  const restByTeam = new Map<number, Map<DisparityGameRow, number>>();
  const denseByTeam = new Map<number, Map<DisparityGameRow, { threeInFour: boolean; fourInSix: boolean }>>();

  for (const [teamId, teamGames] of byTeam) {
    restByTeam.set(teamId, restDaysByGame(teamGames));
    const dense = new Map<DisparityGameRow, { threeInFour: boolean; fourInSix: boolean }>();
    for (let i = 0; i < teamGames.length; i++) {
      dense.set(teamGames[i], {
        threeInFour: closesDenseWindow(teamGames, i, 3, 4),
        fourInSix: closesDenseWindow(teamGames, i, 4, 6),
      });
    }
    denseByTeam.set(teamId, dense);
  }

  const sides = new Map<number, CountedSide[]>();
  for (const teamId of byTeam.keys()) sides.set(teamId, []);

  let countedGames = 0;
  let gamesWithAnyEdge = 0;
  let leagueGamesWithLargeEdge = 0;

  for (const g of games) {
    const homeRest = restByTeam.get(g.homeTeamId)?.get(g);
    const awayRest = restByTeam.get(g.awayTeamId)?.get(g);
    // Either side's opener disqualifies the game — there is no defined rest differential.
    if (homeRest === undefined || awayRest === undefined) continue;

    countedGames++;
    const fatigueGap =
      toFatigue(g.homeFatigueScore) !== null && toFatigue(g.awayFatigueScore) !== null
        ? Math.abs(toFatigue(g.awayFatigueScore)! - toFatigue(g.homeFatigueScore)!)
        : null;
    if (fatigueGap !== null && fatigueGap >= NEUTRAL_REST_ADVANTAGE_THRESHOLD) gamesWithAnyEdge++;
    if (fatigueGap !== null && fatigueGap >= BIG_EDGE_FATIGUE_THRESHOLD) leagueGamesWithLargeEdge++;

    const homeDense = denseByTeam.get(g.homeTeamId)!.get(g)!;
    const awayDense = denseByTeam.get(g.awayTeamId)!.get(g)!;
    const homeFatigue = toFatigue(g.homeFatigueScore);
    const awayFatigue = toFatigue(g.awayFatigueScore);

    sides.get(g.homeTeamId)!.push({
      restDays: homeRest,
      oppRestDays: awayRest,
      fatigue: homeFatigue,
      oppFatigue: awayFatigue,
      isBackToBack: isBackToBack(homeRest),
      isThreeInFour: homeDense.threeInFour,
      isFourInSix: homeDense.fourInSix,
      oppIsThreeInFour: awayDense.threeInFour,
      oppIsFourInSix: awayDense.fourInSix,
    });
    sides.get(g.awayTeamId)!.push({
      restDays: awayRest,
      oppRestDays: homeRest,
      fatigue: awayFatigue,
      oppFatigue: homeFatigue,
      isBackToBack: isBackToBack(awayRest),
      isThreeInFour: awayDense.threeInFour,
      isFourInSix: awayDense.fourInSix,
      oppIsThreeInFour: homeDense.threeInFour,
      oppIsFourInSix: homeDense.fourInSix,
    });
  }

  const teams: DisparityTeamRow[] = [];
  for (const [teamId, teamSides] of sides) {
    let netRestEdge = 0;
    let netRestEdgeUncapped = 0;
    let fatigueSum = 0;
    let fatiguePairs = 0;
    let backToBackEdge = 0;
    let threeInFourEdge = 0;
    let fourInSixEdge = 0;
    let gamesWithEdge = 0;
    let gamesWithLargeEdge = 0;
    let favorableGames = 0;
    let unfavorableGames = 0;
    let bigFavorableGames = 0;
    let bigUnfavorableGames = 0;

    for (const s of teamSides) {
      const capped = cap(s.restDays) - cap(s.oppRestDays);
      netRestEdge += capped;
      netRestEdgeUncapped += s.restDays - s.oppRestDays;
      if (capped > 0) gamesWithEdge++;
      if (capped >= LARGE_EDGE_DAYS) gamesWithLargeEdge++;

      if (s.fatigue !== null && s.oppFatigue !== null) {
        const d = s.oppFatigue - s.fatigue;
        fatigueSum += d;
        fatiguePairs++;
        if (d >= NEUTRAL_REST_ADVANTAGE_THRESHOLD) {
          favorableGames++;
          if (d >= BIG_EDGE_FATIGUE_THRESHOLD) bigFavorableGames++;
        } else if (d <= -NEUTRAL_REST_ADVANTAGE_THRESHOLD) {
          unfavorableGames++;
          if (d <= -BIG_EDGE_FATIGUE_THRESHOLD) bigUnfavorableGames++;
        }
      }

      // Opponent's count minus this team's, so a positive edge means the schedule was kinder.
      if (isBackToBack(s.oppRestDays)) backToBackEdge++;
      if (s.isBackToBack) backToBackEdge--;
      if (s.oppIsThreeInFour) threeInFourEdge++;
      if (s.isThreeInFour) threeInFourEdge--;
      if (s.oppIsFourInSix) fourInSixEdge++;
      if (s.isFourInSix) fourInSixEdge--;
    }

    teams.push({
      teamId,
      games: teamSides.length,
      netRestEdge,
      netRestEdgeUncapped,
      netFatigueEdge: fatiguePairs > 0 ? Number(fatigueSum.toFixed(2)) : null,
      netFatigueEdgePerGame:
        fatiguePairs > 0 && teamSides.length > 0
          ? Number((fatigueSum / teamSides.length).toFixed(2))
          : null,
      backToBackEdge,
      threeInFourEdge,
      fourInSixEdge,
      favorableGames,
      unfavorableGames,
      netEdgeGames: favorableGames - unfavorableGames,
      bigFavorableGames,
      bigUnfavorableGames,
      gamesWithEdge,
      gamesWithLargeEdge,
    });
  }

  teams.sort((a, b) => b.netEdgeGames - a.netEdgeGames || a.teamId - b.teamId);

  const edges = teams.map((t) => t.netEdgeGames);
  const largestEdge = edges.length ? Math.max(...edges) : 0;
  const largestDisadvantage = edges.length ? Math.min(...edges) : 0;

  const scheduledPerTeam = [...byTeam.values()].map((list) => list.length);

  return {
    season,
    provisional: games.some((g) => g.status !== "final"),
    scheduledGames: games.length,
    gamesPerTeamMin: scheduledPerTeam.length ? Math.min(...scheduledPerTeam) : 0,
    gamesPerTeamMax: scheduledPerTeam.length ? Math.max(...scheduledPerTeam) : 0,
    teams,
    league: {
      largestEdge,
      largestDisadvantage,
      delta: largestEdge - largestDisadvantage,
      gamesWithAnyEdge,
      gamesWithLargeEdge: leagueGamesWithLargeEdge,
      countedGames,
    },
  };
}
