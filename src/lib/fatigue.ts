/**
 * FullCourt — Weighted Decay Fatigue Model
 *
 * 1. DECAY LOAD: Recent games (up to ~30 days) contribute fatigue with exponential decay.
 * 2. TRAVEL LOAD: Cumulative travel (7-day rolling window of legs) with log scaling.
 * 3. ROAD SEGMENT LOAD: Consecutive games away from home + time-zone displacement.
 * 4. SCHEDULE STRESS: Multi-window density (6/7/12/15/30-day) vs NBA “tough slate” anchors.
 * 5. MULTIPLIERS: Back-to-back, altitude, schedule stress (combined into densityMultiplier in DB).
 * 6. FRESHNESS BONUS: Extended rest reduces fatigue.
 * 7. OVERTIME: Prior-game OT adds flat fatigue.
 */

import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { haversineDistance } from "./haversine";

// ─── Configuration ──────────────────────────────────────────────

/** Must match `fetchRecentGamesForTeam` window. */
export const FATIGUE_RECENT_LOOKBACK_DAYS = 30;

/** Calendar-day window for summing travel legs (still uses full `recentGames` for decay, stress, etc.). */
export const TRAVEL_LOOKBACK_DAYS = 7;

/** Decay includes games played on these calendar days before the target game. */
const DECAY_LOOKBACK_DAYS = 30;

const DECAY_RATE = 0.52;

const GAME_BASE_COST = 2.65;

const TRAVEL_SCALE = 1.75;

const TRAVEL_REFERENCE_MILES = 1000;

const B2B_MULTIPLIER = 1.38;

const ALTITUDE_MULTIPLIER = 1.15;

const FRESHNESS_MAX_BONUS = -2.0;

const FRESHNESS_PLATEAU_DAYS = 3;

const OVERTIME_SINGLE_BONUS = 0.5;

const OVERTIME_MULTI_BONUS = 1.0;

/**
 * Schedule stress anchors (games played in the last `days` calendar days before tip,
 * not counting the game itself). `baseline` ≈ normal pace; `tough` ≈ elite compressed slate.
 * Based on ~18-in-30, 8-in-12, 4-in-6 style NBA scheduling.
 */
const WINDOW_STRESS = [
  { days: 30, tough: 18, baseline: 11 },
  { days: 15, tough: 9, baseline: 6 },
  { days: 12, tough: 8, baseline: 5 },
  { days: 7, tough: 5, baseline: 3 },
  { days: 6, tough: 4, baseline: 3 },
] as const;

const SCHEDULE_STRESS_MAX_MULT = 1.42;

const SCHEDULE_STRESS_CURVE = 0.058;

/** Consecutive away games (incl. tonight if away) before this kicks in. */
const ROAD_STREAK_SOFT = 2;

const ROAD_STREAK_PER_GAME = 0.34;

/** Magnitude kept from the old coast-to-coast bonus; calibration is an audit item. */
const TIME_ZONE_DISPLACEMENT_BONUS = 0.88;

/**
 * Min longitude gap (deg) between home arena and tonight's venue to count as displaced.
 * 26° ≈ two US time zones — the circadian shift is what this term charges for, so it
 * fires only when the team is actually on the road that far from home tonight, never
 * retroactively at home and never off the whole trip's spread (ratified 2026-07-29).
 */
const TIME_ZONE_DISPLACEMENT_MIN_LON_DEG = 26;

const SAME_ARENA_MILES = 1;

// ─── Types ──────────────────────────────────────────────────────

export interface RecentGame {
  date: string; // "YYYY-MM-DD"
  teamId: number;
  opponentTeamId: number;
  isHome: boolean;
  teamLat: number;
  teamLon: number;
  opponentLat: number;
  opponentLon: number;
  opponentAltitudeFlag: boolean;
  overtimePeriods: number;
}

export interface FatigueResult {
  score: number;
  decayLoadScore: number;
  travelLoadScore: number;
  roadSegmentLoadScore: number;
  backToBackMultiplier: number;
  altitudeMultiplier: number;
  /** Combined schedule-stress multiplier (stored as density_multiplier in DB). */
  densityMultiplier: number;
  freshnessBonus: number;
  overtimeFatigueBonus: number;
  gamesInLast7Days: number;
  gamesInLast30Days: number;
  /** Consecutive away games: includes tonight when `currentGameIsHome` is false. */
  roadTripConsecutiveAway: number;
  travelDistanceMiles: number;
  isBackToBack: boolean;
  daysSinceLastGame: number | null;
  isOvertimePenalty: boolean;
  /** This game is the team's 3rd across tonight and the prior 3 nights. */
  isThreeInFour: boolean;
  /** This game is the team's 4th across tonight and the prior 5 nights. */
  isFourInSix: boolean;
  /** Tonight's game is on the road ≥2 time zones (≥26° longitude) from home. */
  hasTimeZoneDisplacement: boolean;
}

// ─── Schedule / road helpers ───────────────────────────────────

function countGamesInDaysBefore(
  recentGames: RecentGame[],
  gameDate: string,
  days: number
): number {
  const tip = parseISO(gameDate);
  const windowStart = subDays(tip, days);
  return recentGames.filter((g) => {
    const d = parseISO(g.date);
    return d >= windowStart && d < tip;
  }).length;
}

function sortedUniqueGameDates(recentGames: RecentGame[]): string[] {
  return [...new Set(recentGames.map((g) => g.date))].sort();
}

/**
 * Games in the `spanDays`-calendar-day window that ENDS on `gameDate`, counting that game.
 *
 * The window is anchored to tonight rather than floated across the lookback. An earlier version
 * took the max over any window in the 30-day `recentGames` list, which answered "did a dense
 * stretch happen recently?" instead of "is tonight a short-rest game?" — so a team with 16 days
 * of rest and a fatigue score of 0 still came back flagged. These flags describe tonight.
 */
function gamesInWindowEndingAt(
  recentGames: RecentGame[],
  gameDate: string,
  spanDays: number
): number {
  const tip = parseISO(gameDate);
  const priorInWindow = sortedUniqueGameDates(recentGames).filter(
    (d) => differenceInCalendarDays(tip, parseISO(d)) < spanDays
  ).length;
  return priorInWindow + 1; // tonight counts as one of them
}

/** "3 in 4 nights": tonight is the team's 3rd game across tonight and the prior 3 nights. */
function computeIsThreeInFour(recentGames: RecentGame[], gameDate: string): boolean {
  return gamesInWindowEndingAt(recentGames, gameDate, 4) >= 3;
}

/** "4 in 6 nights": same shape, tonight plus the prior 5 nights. */
function computeIsFourInSix(recentGames: RecentGame[], gameDate: string): boolean {
  return gamesInWindowEndingAt(recentGames, gameDate, 6) >= 4;
}

function scheduleStressMultiplier(recentGames: RecentGame[], gameDate: string): number {
  let stressPoints = 0;
  for (const w of WINDOW_STRESS) {
    const n = countGamesInDaysBefore(recentGames, gameDate, w.days);
    if (n <= w.baseline) continue;
    const denom = Math.max(1, w.tough - w.baseline);
    const excess = (n - w.baseline) / denom;
    stressPoints += Math.min(1.15, Math.max(0, excess));
  }
  const mult = 1 + Math.min(
    SCHEDULE_STRESS_MAX_MULT - 1,
    stressPoints * SCHEDULE_STRESS_CURVE
  );
  return Math.round(mult * 1000) / 1000;
}

/** Consecutive away games: walk back from most recent game; if tonight is away, add 1. */
function roadTripStreak(
  recentGames: RecentGame[],
  currentGameIsHome: boolean
): number {
  const sorted = [...recentGames].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (!sorted[i].isHome) {
      streak += 1;
    } else {
      break;
    }
  }
  if (!currentGameIsHome) {
    streak += 1;
  }
  return streak;
}

/** Displaced = on the road tonight, ≥2 time zones from the home arena. */
function isTimeZoneDisplaced(
  currentGameIsHome: boolean,
  teamHomeLon: number,
  currentVenueLon: number
): boolean {
  if (currentGameIsHome) return false;
  return (
    Math.abs(currentVenueLon - teamHomeLon) >= TIME_ZONE_DISPLACEMENT_MIN_LON_DEG
  );
}

function roadSegmentLoad(streak: number, displaced: boolean): number {
  const loadFromStreak =
    ROAD_STREAK_PER_GAME * Math.max(0, streak - ROAD_STREAK_SOFT);
  const displacementAdd = displaced ? TIME_ZONE_DISPLACEMENT_BONUS : 0;
  return Math.round((loadFromStreak + displacementAdd) * 100) / 100;
}

function isSameArena(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return haversineDistance(lat1, lon1, lat2, lon2) < SAME_ARENA_MILES;
}

/**
 * One leg between consecutive games (great-circle / haversine, not road routing).
 *
 * Contract (no phantom “fly home” between two road games — only fly home when the next
 * game is actually at home):
 *
 * | Previous | Current | Miles |
 * |----------|---------|--------|
 * | Home | Away | Home arena → current opponent arena |
 * | Away | Away (other city) | Previous road arena → current opponent arena |
 * | Away | Home | Previous road arena → home arena |
 * | Home | Home | 0 (same stand / no travel between games) |
 *
 * Same coordinates → 0 (covers back-to-back same building).
 *
 * **`previousGame === null`:** no prior game in this chain — away tonight counts as
 * home → tonight’s arena; home tonight → 0.
 */
function travelMilesBetweenGames(
  previousGame: RecentGame | null,
  currentGameIsHome: boolean,
  currentArenaLat: number,
  currentArenaLon: number,
  teamHomeLat: number,
  teamHomeLon: number
): number {
  if (previousGame === null) {
    if (currentGameIsHome) {
      return 0;
    }
    return haversineDistance(teamHomeLat, teamHomeLon, currentArenaLat, currentArenaLon);
  }

  const prevWasHome = previousGame.isHome;
  const prevArenaLat = prevWasHome ? previousGame.teamLat : previousGame.opponentLat;
  const prevArenaLon = prevWasHome ? previousGame.teamLon : previousGame.opponentLon;

  if (isSameArena(prevArenaLat, prevArenaLon, currentArenaLat, currentArenaLon)) {
    return 0;
  }

  if (prevWasHome && currentGameIsHome) {
    return 0;
  }

  if (prevWasHome && !currentGameIsHome) {
    return haversineDistance(teamHomeLat, teamHomeLon, currentArenaLat, currentArenaLon);
  }

  if (!prevWasHome && currentGameIsHome) {
    return haversineDistance(prevArenaLat, prevArenaLon, teamHomeLat, teamHomeLon);
  }

  return haversineDistance(prevArenaLat, prevArenaLon, currentArenaLat, currentArenaLon);
}

/**
 * Sums travel legs for prior games dated in `[tip − lookbackDays, tip)` (game day excluded), plus
 * the inbound leg from the prior game immediately before that window (if any) into the first game
 * inside the window, and the leg from the most recent prior game to tonight.
 */
function computeTotalTravelMiles(
  gameDate: string,
  tip: Date,
  recentGames: RecentGame[],
  currentGameIsHome: boolean,
  currentVenueLat: number,
  currentVenueLon: number,
  teamHomeLat: number,
  teamHomeLon: number,
  lookbackDays: number
): number {
  if (recentGames.length === 0) {
    return travelMilesBetweenGames(
      null,
      currentGameIsHome,
      currentVenueLat,
      currentVenueLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const windowStart = subDays(tip, lookbackDays);
  const firstIdxInWindow = recentGames.findIndex((g) => {
    const d = parseISO(g.date);
    return d >= windowStart && d < tip;
  });

  let total = 0;

  if (firstIdxInWindow === -1) {
    const lastGame = recentGames[recentGames.length - 1];
    return travelMilesBetweenGames(
      lastGame,
      currentGameIsHome,
      currentVenueLat,
      currentVenueLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const prevBeforeChain =
    firstIdxInWindow > 0 ? recentGames[firstIdxInWindow - 1]! : null;
  const chainStart = recentGames[firstIdxInWindow]!;
  const chainStartLat = chainStart.isHome
    ? chainStart.teamLat
    : chainStart.opponentLat;
  const chainStartLon = chainStart.isHome
    ? chainStart.teamLon
    : chainStart.opponentLon;

  total += travelMilesBetweenGames(
    prevBeforeChain,
    chainStart.isHome,
    chainStartLat,
    chainStartLon,
    teamHomeLat,
    teamHomeLon
  );

  for (let i = firstIdxInWindow; i < recentGames.length - 1; i++) {
    const prev = recentGames[i]!;
    const cur = recentGames[i + 1]!;
    const curArenaLat = cur.isHome ? cur.teamLat : cur.opponentLat;
    const curArenaLon = cur.isHome ? cur.teamLon : cur.opponentLon;
    total += travelMilesBetweenGames(
      prev,
      cur.isHome,
      curArenaLat,
      curArenaLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const lastGame = recentGames[recentGames.length - 1]!;
  total += travelMilesBetweenGames(
    lastGame,
    currentGameIsHome,
    currentVenueLat,
    currentVenueLon,
    teamHomeLat,
    teamHomeLon
  );

  return total;
}

// ─── Core Algorithm ─────────────────────────────────────────────

export function calculateFatigue(
  gameDate: string,
  recentGames: RecentGame[],
  isVisitingAltitude: boolean,
  teamHomeLat: number,
  teamHomeLon: number,
  currentVenueLat: number,
  currentVenueLon: number,
  currentGameIsHome: boolean
): FatigueResult {
  const tip = parseISO(gameDate);

  const games7 = countGamesInDaysBefore(recentGames, gameDate, 7);
  const games30 = countGamesInDaysBefore(recentGames, gameDate, 30);
  const isThreeInFour = computeIsThreeInFour(recentGames, gameDate);
  const isFourInSix = computeIsFourInSix(recentGames, gameDate);
  const stressMult = scheduleStressMultiplier(recentGames, gameDate);

  const roadStreak = roadTripStreak(recentGames, currentGameIsHome);
  const displaced = isTimeZoneDisplaced(
    currentGameIsHome,
    teamHomeLon,
    currentVenueLon
  );
  const roadLoad = roadSegmentLoad(roadStreak, displaced);

  if (recentGames.length === 0) {
    // Ratified rule #1 (2026-07-29): a team's first game of the season scores 0.00 —
    // a full offseason leaves nothing accumulated to charge for. The flight to an away
    // opener is still real, so its miles are computed and displayed, never zeroed, and
    // the displacement flag stays factual. Both feed the NEXT game's 7-day window.
    const openerMiles = currentGameIsHome
      ? 0
      : haversineDistance(teamHomeLat, teamHomeLon, currentVenueLat, currentVenueLon);

    return {
      score: 0,
      decayLoadScore: 0,
      travelLoadScore: 0,
      roadSegmentLoadScore: 0,
      backToBackMultiplier: 1.0,
      altitudeMultiplier: isVisitingAltitude ? ALTITUDE_MULTIPLIER : 1.0,
      densityMultiplier: stressMult,
      freshnessBonus: 0,
      overtimeFatigueBonus: 0,
      gamesInLast7Days: 0,
      gamesInLast30Days: 0,
      roadTripConsecutiveAway: currentGameIsHome ? 0 : 1,
      travelDistanceMiles: Math.round(openerMiles),
      isBackToBack: false,
      daysSinceLastGame: null,
      isOvertimePenalty: false,
      isThreeInFour: false,
      isFourInSix: false,
      hasTimeZoneDisplacement: displaced,
    };
  }

  let decayLoadScore = 0;
  for (const game of recentGames) {
    const daysAgo = differenceInCalendarDays(tip, parseISO(game.date));
    if (daysAgo < 1 || daysAgo > DECAY_LOOKBACK_DAYS) continue;
    decayLoadScore += GAME_BASE_COST * Math.exp(-DECAY_RATE * daysAgo);
  }
  decayLoadScore = Math.round(decayLoadScore * 100) / 100;

  const totalTravelMiles = computeTotalTravelMiles(
    gameDate,
    tip,
    recentGames,
    currentGameIsHome,
    currentVenueLat,
    currentVenueLon,
    teamHomeLat,
    teamHomeLon,
    TRAVEL_LOOKBACK_DAYS
  );

  const lastGame = recentGames[recentGames.length - 1]!;
  const travelLoadScore =
    totalTravelMiles > 0
      ? Math.round(
          TRAVEL_SCALE * Math.log(1 + totalTravelMiles / TRAVEL_REFERENCE_MILES) * 100
        ) / 100
      : 0;

  const daysSinceLastGame = differenceInCalendarDays(tip, parseISO(lastGame.date));
  const isBackToBack = daysSinceLastGame === 1;
  const b2bMultiplier = isBackToBack ? B2B_MULTIPLIER : 1.0;

  const altMultiplier = isVisitingAltitude ? ALTITUDE_MULTIPLIER : 1.0;

  let freshnessBonus = 0;
  if (daysSinceLastGame >= FRESHNESS_PLATEAU_DAYS) {
    freshnessBonus =
      FRESHNESS_MAX_BONUS *
      (1 - Math.exp(-daysSinceLastGame / FRESHNESS_PLATEAU_DAYS));
    freshnessBonus = Math.round(freshnessBonus * 100) / 100;
  }

  const priorOtPeriods = Math.max(0, Math.floor(lastGame.overtimePeriods));
  let overtimeFatigueBonus = 0;
  if (priorOtPeriods >= 2) {
    overtimeFatigueBonus = OVERTIME_MULTI_BONUS;
  } else if (priorOtPeriods === 1) {
    overtimeFatigueBonus = OVERTIME_SINGLE_BONUS;
  }

  const baseLoad = decayLoadScore + travelLoadScore + roadLoad;
  const multipliedLoad =
    baseLoad * b2bMultiplier * altMultiplier * stressMult;
  const finalScore = Math.max(
    0,
    multipliedLoad + freshnessBonus + overtimeFatigueBonus
  );

  return {
    score: Math.round(finalScore * 100) / 100,
    decayLoadScore,
    travelLoadScore,
    roadSegmentLoadScore: roadLoad,
    backToBackMultiplier: b2bMultiplier,
    altitudeMultiplier: altMultiplier,
    densityMultiplier: stressMult,
    freshnessBonus,
    overtimeFatigueBonus: Math.round(overtimeFatigueBonus * 100) / 100,
    gamesInLast7Days: games7,
    gamesInLast30Days: games30,
    roadTripConsecutiveAway: roadStreak,
    travelDistanceMiles: Math.round(totalTravelMiles),
    isBackToBack,
    daysSinceLastGame,
    isOvertimePenalty: overtimeFatigueBonus > 0,
    isThreeInFour,
    isFourInSix,
    hasTimeZoneDisplacement: displaced,
  };
}

export function calculateRestAdvantage(
  homeFatigue: FatigueResult,
  awayFatigue: FatigueResult
): number {
  return Math.round((awayFatigue.score - homeFatigue.score) * 100) / 100;
}
