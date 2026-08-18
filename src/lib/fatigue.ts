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
import { neutralVenueCoordinates } from "./neutral-venues";
import { eraCoordinates } from "./team-era-coordinates";

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

/**
 * Back-to-backs are not equal. `games.date` is a bare calendar date, so a 10:30pm ET
 * tip followed by a 7:00pm tip (~20.5h) scored identically to 7:00pm then 10:30pm
 * (~27.5h) — a seven-hour spread inside one flag.
 *
 * 1.38 is the value at a nominal 24-hour turnaround, adjusted ±0.02 per hour and
 * clamped, so the realistic worst case adds 0.08 to a 0.38 excess (~21% more penalty).
 * Missing tip times on either game fall back to exactly 1.38, preserving the pre-2002
 * era where ESPN has no data. Ratified 2026-07-30.
 */
const B2B_TURNAROUND_NOMINAL_HOURS = 24;
const B2B_TURNAROUND_PER_HOUR = 0.02;
const B2B_MULTIPLIER_MIN = 1.3;
const B2B_MULTIPLIER_MAX = 1.46;

/**
 * Raised from 1.15 on 2026-08-02, the first ratified coefficient to change on evidence.
 *
 * The absolute scale of a fatigue score is arbitrary — only the ratios between terms carry
 * meaning — so the question is not "how many points is thin air worth" but "how big is it
 * next to a back-to-back". Measured on final margin across 35,458 games, altitude is 1.358
 * points and a back-to-back is 1.759, a ratio of 0.772. In the model it was 0.405: altitude
 * was charging about half what it should.
 *
 * Matching the measured ratio while keeping the multiplier shape gives an excess of
 * 0.772 × 0.38 = 0.293. See ADR 0006.
 *
 * The shape itself is still wrong and is knowingly left alone: a multiplier means the same
 * thin air costs a busy team more than a rested one, where the measurement says the effect is
 * flat. Fixing that means making altitude additive, which is the model rewrite ADR 0006
 * declined on its own evidence.
 */
const ALTITUDE_MULTIPLIER = 1.29;

/**
 * Thin air does not clear the moment the plane lands. Applied the night AFTER visiting
 * altitude, when tonight's venue is at normal elevation, since the acute effect is weaker
 * than being there. Never applies to Denver or Utah leaving home: descending is not the hard
 * direction. Ratified 2026-07-30.
 *
 * Deliberately NOT raised alongside `ALTITUDE_MULTIPLIER` on 2026-08-02, though it was set as
 * half of that excess and is now roughly a fifth of it. The carryover was measured at 0.003
 * points and the unconstrained fit wanted it negative, so there is no evidence to spend on
 * making it bigger — only the symmetry of how it was originally derived, which is not
 * evidence. It stays where it is until something measures it.
 */
const ALTITUDE_CARRYOVER_MULTIPLIER = 1.06;

/**
 * A 30-point blowout rests the starters; a two-point thriller does not. Overtime was
 * the model's only measure of how hard a game was, so a rout and a war cost the same
 * 2.65. Below 15 points nothing is discounted (competitive throughout); the discount
 * ramps to a 25% cap by 35, because starters still played three quarters even in a
 * rout. Ratified 2026-07-30.
 */
const BLOWOUT_MARGIN_FLOOR = 15;
const BLOWOUT_MARGIN_RANGE = 20;
const BLOWOUT_MAX_DISCOUNT = 0.25;

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
 * Direction matters: advancing the body clock (travelling east) is harder than delaying
 * it (west). Deliberately modest at 1.47:1 — the advance-vs-delay asymmetry is well
 * established in chronobiology, but NBA-specific box-score studies disagree, so this
 * encodes the mechanism without betting heavily on it. The pair averages near 1.0, so
 * the overall scale of the term does not drift. Ratified 2026-07-30.
 */
const TIME_ZONE_EASTWARD_MULTIPLIER = 1.25;
const TIME_ZONE_WESTWARD_MULTIPLIER = 0.85;

/**
 * Min clock shift (hours) between home arena and tonight's venue to count as displaced.
 * The circadian shift is what this term charges for, so it fires only when the team is
 * actually on the road that far from home tonight, never retroactively at home and never
 * off the whole trip's spread (ratified 2026-07-29).
 *
 * Was a 26°-longitude proxy for "two time zones". Longitude is a poor proxy: measured over
 * 2015-16+, it missed 871 of 3,522 genuine two-zone road games (every Denver trip east,
 * every Texas↔California pair, MIN@LAL, OKC@POR …) and false-fired on 40 one-zone games
 * (BOS@OKC, BOS@SAS). Real zones replace it; the ≥2 intent is unchanged.
 */
const TIME_ZONE_DISPLACEMENT_MIN_HOURS = 2;

const SAME_ARENA_MILES = 1;

/**
 * Candidate decay rates the fitting harness grids over. `DECAY_RATE` (0.52) is the ratified
 * value and is a member, so the grid always contains today's model.
 *
 * The rate is a *shape* parameter — it lives inside the decay sum rather than multiplying it,
 * so no regression can reach it. Exporting the sum at each candidate rate is what lets the
 * harness search it without re-deriving the model in another language.
 */
export const DECAY_RATE_GRID: readonly number[] = [
  0.25, 0.3, 0.35, 0.4, 0.45, DECAY_RATE, 0.6, 0.7, 0.8,
];

/**
 * The constants the Behind the Data page publishes, read straight from the model.
 *
 * The page explains this formula to readers, so any number it states has to be the number
 * the code actually uses. Referencing the consts rather than retyping them into prose makes
 * that drift impossible — change a value above and the page follows.
 */
export const FATIGUE_CONSTANTS = Object.freeze({
  decayLookbackDays: DECAY_LOOKBACK_DAYS,
  decayRate: DECAY_RATE,
  gameBaseCost: GAME_BASE_COST,
  travelLookbackDays: TRAVEL_LOOKBACK_DAYS,
  travelScale: TRAVEL_SCALE,
  travelReferenceMiles: TRAVEL_REFERENCE_MILES,
  b2bMultiplier: B2B_MULTIPLIER,
  b2bNominalHours: B2B_TURNAROUND_NOMINAL_HOURS,
  b2bPerHour: B2B_TURNAROUND_PER_HOUR,
  b2bMin: B2B_MULTIPLIER_MIN,
  b2bMax: B2B_MULTIPLIER_MAX,
  altitudeMultiplier: ALTITUDE_MULTIPLIER,
  altitudeCarryover: ALTITUDE_CARRYOVER_MULTIPLIER,
  blowoutFloor: BLOWOUT_MARGIN_FLOOR,
  blowoutRange: BLOWOUT_MARGIN_RANGE,
  blowoutMaxDiscount: BLOWOUT_MAX_DISCOUNT,
  freshnessMaxBonus: FRESHNESS_MAX_BONUS,
  freshnessPlateauDays: FRESHNESS_PLATEAU_DAYS,
  overtimeSingle: OVERTIME_SINGLE_BONUS,
  overtimeMulti: OVERTIME_MULTI_BONUS,
  densityMaxMultiplier: SCHEDULE_STRESS_MAX_MULT,
  roadStreakFree: ROAD_STREAK_SOFT,
  roadStreakPerGame: ROAD_STREAK_PER_GAME,
  displacementBonus: TIME_ZONE_DISPLACEMENT_BONUS,
  displacementMinHours: TIME_ZONE_DISPLACEMENT_MIN_HOURS,
  eastwardMultiplier: TIME_ZONE_EASTWARD_MULTIPLIER,
  westwardMultiplier: TIME_ZONE_WESTWARD_MULTIPLIER,
});

// ─── Types ──────────────────────────────────────────────────────

export interface RecentGame {
  date: string; // "YYYY-MM-DD"
  /** False at a neutral site even for the nominal host — neither side slept at home. */
  isHome: boolean;
  teamLat: number;
  teamLon: number;
  opponentLat: number;
  opponentLon: number;
  overtimePeriods: number;
  /** Actual tip-off instant; null before ~2002, where ESPN has no event. */
  tipOffUtc?: Date | null;
  /** Absolute final margin; drives the blowout discount. Null when scores are absent. */
  pointMargin?: number | null;
  /** Whether the venue this game was played at sits at altitude. */
  venueAltitude?: boolean;
  /**
   * Where the game was actually played, when that is neither team's arena. Set only
   * for neutral-site games (Paris, Mexico City, …), which are treated as away games
   * for BOTH teams — physically neither side slept at home.
   */
  venueLat?: number;
  venueLon?: number;
}

/** The arena a past game was played in: the neutral venue if any, else home/opponent. */
function arenaOf(game: RecentGame): { lat: number; lon: number } {
  if (game.venueLat !== undefined && game.venueLon !== undefined) {
    return { lat: game.venueLat, lon: game.venueLon };
  }
  return game.isHome
    ? { lat: game.teamLat, lon: game.teamLon }
    : { lat: game.opponentLat, lon: game.opponentLon };
}

/**
 * The raw, *unweighted* quantities the score is built from — what the model measured, before
 * any ratified constant multiplies it.
 *
 * This exists so the fitting harness can ask "what should each factor be worth?" without a
 * second copy of the model in another language. Only quantities that `FatigueResult` does not
 * already expose in raw form appear here: `travelDistanceMiles`, `roadTripConsecutiveAway`,
 * `daysSinceLastGame`, `gamesInLast7Days`, `gamesInLast30Days`, `isThreeInFour` and
 * `isFourInSix` are already raw up there and are deliberately not repeated.
 */
export interface FatigueFeatures {
  /** Σ blowoutDiscount × e^(−rate·daysAgo), one entry per `DECAY_RATE_GRID` rate, same order. */
  decayUnits: number[];
  /** Travel legs summed over 14 and 30 calendar days; the 7-day figure is `travelDistanceMiles`. */
  travelMiles14: number;
  travelMiles30: number;
  /** Consecutive home games, including tonight when at home — the mirror of the road streak. */
  homeStandLength: number;
  /** Circadian load before the 0.88 scale: direction × how much re-entrainment is left. */
  jetLagUnits: number;
  /** Hours of clock shift between the home arena and tonight's venue. */
  zonesCrossed: number;
  /**
   * The same shift, **signed**: positive travelling east, negative travelling west.
   *
   * Reported rather than scored — no term reads it, and adding it leaves every score identical.
   * It exists because neither existing column can separate direction: `zonesCrossed` is the
   * absolute value, and `jetLagUnits` folds the eastward/westward multiplier together with the
   * re-entrainment fraction, so a small eastward shift and a large westward one are not
   * distinguishable from it. Added 2026-08-18 for the pre-registered circadian test
   * (`ml/timezone_preregistration.md`).
   */
  zoneShiftHours: number;
  /** Real hours between the prior tip and tonight's; null when either tip is unknown. */
  turnaroundHours: number | null;
  /** Overtime periods in the prior game. 0 before ~2002 means unknown (ADR 0003). */
  priorOvertimePeriods: number;
  /** Schedule-density stress points, before the curve and the cap flatten them. */
  densityStressPoints: number;
  /** Tip-off hour (0–24, fractional) in the team's HOME time zone. Null when the tip is unknown. */
  bodyClockHour: number | null;
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
  /** Tonight's game is on the road ≥2 hours of clock shift from the home arena. */
  hasTimeZoneDisplacement: boolean;
  /** What the score was measured from, before the ratified constants weighted it. */
  features: FatigueFeatures;
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

/**
 * The density multiplier, and the raw stress points behind it.
 *
 * Points are returned alongside because the curve and the cap are both lossy: two very
 * different slates can land on the same clamped multiplier, so the multiplier cannot be
 * inverted back into what the schedule actually looked like.
 */
function scheduleStress(
  recentGames: RecentGame[],
  gameDate: string
): { points: number; multiplier: number } {
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
  return { points: stressPoints, multiplier: Math.round(mult * 1000) / 1000 };
}

/**
 * Consecutive games on one side of the ledger, walking back from the most recent, plus
 * tonight when it matches.
 *
 * Road and home stands are the same walk in opposite directions: the road streak is what
 * the model charges for, the home stand is what a recovery term would credit.
 */
function venueStreak(
  recentGames: RecentGame[],
  wantHome: boolean,
  currentGameIsHome: boolean
): number {
  const sorted = [...recentGames].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].isHome === wantHome) {
      streak += 1;
    } else {
      break;
    }
  }
  if (currentGameIsHome === wantHome) {
    streak += 1;
  }
  return streak;
}

/**
 * Standard-time UTC offset (hours) for a venue longitude.
 *
 * Cutoffs, not a team lookup, so relocated-era coordinates resolve correctly for free
 * (Seattle/Vancouver → Pacific, Katrina-era New Orleans in OKC → Central). Each boundary
 * sits in the empty gap between the two nearest arenas on either side, so all 30 current
 * arenas plus every era coordinate classify correctly — verified 2026-07-30.
 */
function standardUtcOffsetHours(lon: number): number {
  // Across the Atlantic — only reachable via neutral-site games (London, Paris, Berlin).
  // Same technique: the 1.5° boundary sits in the gap between London (0.003°, UTC+0)
  // and Paris (2.378°, UTC+1). No NBA venue lies between them.
  if (lon > -30) return lon > 1.5 ? 1 : 0;
  if (lon > -87.0) return -5; // Eastern  (westmost: IND −86.16 | CHI −87.67 is Central)
  if (lon > -101.0) return -6; // Central  (westmost: SAS −98.44 | DEN −105.01 is Mountain)
  if (lon > -115.0) return -7; // Mountain (westmost: PHX −112.07 | LAL −118.27 is Pacific)
  return -8; // Pacific
}

/** Nth (1-indexed) Sunday of `month` (0-indexed), in local calendar terms. */
function nthSunday(year: number, month: number, n: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((7 - first.getDay()) % 7) + (n - 1) * 7);
}

/** Last Sunday of `month` (0-indexed). */
function lastSunday(year: number, month: number): Date {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - last.getDay());
}

/**
 * US daylight saving in effect on `date`.
 *
 * Only Arizona ignores DST, so this changes no offset *difference* except for games
 * involving Phoenix — everyone else shifts together. Two rule eras are modeled: since
 * 2007, 2nd Sunday of March → 1st Sunday of November; 1987–2006, 1st Sunday of April →
 * last Sunday of October.
 *
 * ponytail: the 1976–1986 rule (DST began the *last* Sunday of April) is not modeled —
 * it would only change Phoenix games in April 1986/87. Add the third branch if a
 * Suns-vs-Central April game from those two seasons ever matters.
 */
function isDaylightSaving(date: Date): boolean {
  const y = date.getFullYear();
  const start = y >= 2007 ? nthSunday(y, 2, 2) : nthSunday(y, 3, 1);
  const end = y >= 2007 ? nthSunday(y, 10, 1) : lastSunday(y, 9);
  return date >= start && date < end;
}

/**
 * Phoenix is the lone NBA *arena* that never observes DST; UTA sits 0.17° away but 7°
 * north, so a latitude bound separates them. Mexico City is excluded too: it has been
 * UTC−6 year-round since Mexico dropped DST in 2022, and before that its DST window
 * (April–October) never overlapped the November–December dates the NBA plays there.
 *
 * European neutral venues are evaluated with US DST dates, which is harmless because
 * those games are played in January and February — standard time on both continents.
 */
function observesDaylightSaving(lat: number, lon: number): boolean {
  const isPhoenix = lat < 36 && lon <= -111.6 && lon >= -112.6;
  const isMexicoCity = lat < 25;
  return !isPhoenix && !isMexicoCity;
}

/** Actual UTC offset (hours) of a venue on a given date, DST included. */
export function venueUtcOffsetHours(lat: number, lon: number, date: Date): number {
  const base = standardUtcOffsetHours(lon);
  return isDaylightSaving(date) && observesDaylightSaving(lat, lon) ? base + 1 : base;
}

/**
 * Consecutive prior games already played in tonight's time zone, walking back from the
 * most recent. Three straight games on the east coast means the body clock has had
 * three nights to re-entrain; the walk stops at the first game in a different zone
 * (a home game, say), which is exactly when the clock would have been reset.
 */
function nightsAcclimated(
  recentGames: RecentGame[],
  venueOffset: number
): number {
  let nights = 0;
  for (let i = recentGames.length - 1; i >= 0; i--) {
    const game = recentGames[i]!;
    const arena = arenaOf(game);
    const offset = venueUtcOffsetHours(arena.lat, arena.lon, parseISO(game.date));
    if (offset !== venueOffset) break;
    nights += 1;
  }
  return nights;
}

/**
 * Circadian load from tonight's venue: zero at home, zero under two hours of shift,
 * and otherwise the ratified 0.88 scaled by direction and by how far the team has
 * already re-entrained.
 *
 * Re-entrainment runs at roughly one day per zone crossed, so a three-zone trip decays
 * 0.88 → 0.59 → 0.29 → 0 across successive nights. Previously this charged the full
 * 0.88 on night six of an east-coast trip, when the team had long since adjusted.
 */
function timeZoneDisplacement(
  currentGameIsHome: boolean,
  tip: Date,
  teamHomeLat: number,
  teamHomeLon: number,
  currentVenueLat: number,
  currentVenueLon: number,
  recentGames: RecentGame[]
): {
  load: number;
  displaced: boolean;
  units: number;
  zonesCrossed: number;
  zoneShiftHours: number;
} {
  if (currentGameIsHome) {
    return { load: 0, displaced: false, units: 0, zonesCrossed: 0, zoneShiftHours: 0 };
  }

  const homeOffset = venueUtcOffsetHours(teamHomeLat, teamHomeLon, tip);
  const venueOffset = venueUtcOffsetHours(currentVenueLat, currentVenueLon, tip);
  // Offsets grow more negative westward, so a positive shift means travelling east.
  const shift = venueOffset - homeOffset;
  const zonesCrossed = Math.abs(shift);
  if (zonesCrossed < TIME_ZONE_DISPLACEMENT_MIN_HOURS) {
    return { load: 0, displaced: false, units: 0, zonesCrossed, zoneShiftHours: shift };
  }

  const direction =
    shift > 0 ? TIME_ZONE_EASTWARD_MULTIPLIER : TIME_ZONE_WESTWARD_MULTIPLIER;
  const remaining = Math.max(
    0,
    1 - nightsAcclimated(recentGames, venueOffset) / zonesCrossed
  );
  const units = direction * remaining;

  return {
    load: TIME_ZONE_DISPLACEMENT_BONUS * units,
    // The flag means "jet-lagged tonight", not "far from home" — an acclimated team
    // on night four of a trip is no longer displaced, and the UI chip follows suit.
    displaced: remaining > 0,
    units,
    zonesCrossed,
    zoneShiftHours: shift,
  };
}

/**
 * Tip-off hour in the team's own time zone, 0–24 with fractional minutes.
 *
 * Distinct from the displacement term, which asks how many zones were crossed. This asks what
 * time the body thinks it is at tip — a 7pm Pacific start is 10pm to an East-coast visitor
 * whether or not they have re-entrained.
 */
function bodyClockHourAt(
  tipUtc: Date | null | undefined,
  teamHomeLat: number,
  teamHomeLon: number
): number | null {
  if (!tipUtc || Number.isNaN(tipUtc.getTime())) return null;
  const offset = venueUtcOffsetHours(teamHomeLat, teamHomeLon, tipUtc);
  const utcHours = tipUtc.getUTCHours() + tipUtc.getUTCMinutes() / 60;
  return (((utcHours + offset) % 24) + 24) % 24;
}

/**
 * Back-to-back multiplier, sharpened by the real gap between tips when both are known.
 * Returns the flat ratified 1.38 whenever either tip time is missing.
 */
/** Real hours between two tips, or null when either is unknown (pre-2002, per ADR 0003). */
function turnaroundHoursBetween(
  previousTip: Date | null | undefined,
  currentTip: Date | null | undefined
): number | null {
  if (!previousTip || !currentTip) return null;
  const hours = (currentTip.getTime() - previousTip.getTime()) / 3_600_000;
  return Number.isFinite(hours) ? hours : null;
}

function backToBackMultiplier(
  previousTip: Date | null | undefined,
  currentTip: Date | null | undefined
): number {
  const hours = turnaroundHoursBetween(previousTip, currentTip);
  if (hours === null) return B2B_MULTIPLIER;
  const adjusted =
    B2B_MULTIPLIER +
    B2B_TURNAROUND_PER_HOUR * (B2B_TURNAROUND_NOMINAL_HOURS - hours);
  const clamped = Math.min(B2B_MULTIPLIER_MAX, Math.max(B2B_MULTIPLIER_MIN, adjusted));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Fraction of a game's base cost to charge, given how lopsided it was. 1.0 for any
 * game inside 15 points; falls linearly to 0.75 by a 35-point margin. Unknown margin
 * charges in full — the model never discounts on missing data.
 */
function blowoutDiscount(pointMargin: number | null | undefined): number {
  if (pointMargin == null || !Number.isFinite(pointMargin)) return 1;
  const excess = (Math.abs(pointMargin) - BLOWOUT_MARGIN_FLOOR) / BLOWOUT_MARGIN_RANGE;
  return 1 - BLOWOUT_MAX_DISCOUNT * Math.min(1, Math.max(0, excess));
}

function roadSegmentLoad(streak: number, displacementLoad: number): number {
  const loadFromStreak =
    ROAD_STREAK_PER_GAME * Math.max(0, streak - ROAD_STREAK_SOFT);
  return Math.round((loadFromStreak + displacementLoad) * 100) / 100;
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
  const { lat: prevArenaLat, lon: prevArenaLon } = arenaOf(previousGame);

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
  const { lat: chainStartLat, lon: chainStartLon } = arenaOf(chainStart);

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
    const { lat: curArenaLat, lon: curArenaLon } = arenaOf(cur);
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

/**
 * One team's side of one game.
 *
 * Named rather than positional because the two coordinate pairs mean different things and used
 * to sit adjacent as four bare `number`s: transposing the arena with the venue type-checked
 * cleanly and silently inverted both the travel and the time-zone terms.
 *
 * `recentGames` must be ordered oldest → newest and cover exactly the
 * `FATIGUE_RECENT_LOOKBACK_DAYS` window before `gameDate`, final games only, from this team's
 * perspective. `fetchRecentGamesForTeam` is what guarantees that; a hand-built array must match
 * it. The last element anchors rest, back-to-back, altitude carryover and overtime, so an
 * unsorted array produces a wrong score with no error.
 *
 * Most callers want `scoreGameFatigue` instead, which resolves the geometry for both sides.
 */
export interface FatigueInput {
  gameDate: string;
  recentGames: RecentGame[];
  /** Whether tonight's venue sits at altitude, from this team's point of view. */
  isVisitingAltitude: boolean;
  /** This team's own arena, era-corrected for relocated franchises. */
  teamHomeLat: number;
  teamHomeLon: number;
  /** Where tonight is actually played — the host arena, or a neutral city. */
  currentVenueLat: number;
  currentVenueLon: number;
  /** False at a neutral site even for the nominal host: nobody slept at home. */
  currentGameIsHome: boolean;
  /** Null before ~2002, where ESPN has no event; the back-to-back multiplier falls back. */
  currentTipOffUtc?: Date | null;
}

export function calculateFatigue(input: FatigueInput): FatigueResult {
  const {
    gameDate,
    recentGames,
    isVisitingAltitude,
    teamHomeLat,
    teamHomeLon,
    currentVenueLat,
    currentVenueLon,
    currentGameIsHome,
    currentTipOffUtc,
  } = input;
  const tip = parseISO(gameDate);

  const games7 = countGamesInDaysBefore(recentGames, gameDate, 7);
  const games30 = countGamesInDaysBefore(recentGames, gameDate, 30);
  const isThreeInFour = computeIsThreeInFour(recentGames, gameDate);
  const isFourInSix = computeIsFourInSix(recentGames, gameDate);
  const { points: stressPoints, multiplier: stressMult } = scheduleStress(
    recentGames,
    gameDate
  );

  const roadStreak = venueStreak(recentGames, false, currentGameIsHome);
  const homeStandLength = venueStreak(recentGames, true, currentGameIsHome);
  const bodyClockHour = bodyClockHourAt(currentTipOffUtc, teamHomeLat, teamHomeLon);
  const {
    load: displacementLoad,
    displaced,
    units: jetLagUnits,
    zonesCrossed,
    zoneShiftHours,
  } = timeZoneDisplacement(
    currentGameIsHome,
    tip,
    teamHomeLat,
    teamHomeLon,
    currentVenueLat,
    currentVenueLon,
    recentGames
  );
  const roadLoad = roadSegmentLoad(roadStreak, displacementLoad);

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
      features: {
        // Nothing has been played, so every accumulated quantity is genuinely zero rather
        // than unknown. The flight to a road opener is real and is reported at all three
        // windows — it is the same single leg in each.
        decayUnits: DECAY_RATE_GRID.map(() => 0),
        travelMiles14: openerMiles,
        travelMiles30: openerMiles,
        homeStandLength,
        jetLagUnits,
        zonesCrossed,
        zoneShiftHours,
        turnaroundHours: null,
        priorOvertimePeriods: 0,
        densityStressPoints: stressPoints,
        bodyClockHour,
      },
    };
  }

  let decayLoadScore = 0;
  // Accumulated alongside the score rather than divided out of it afterwards: the score is
  // rounded to 2 dp, which would cost the fit two significant figures on the model's
  // largest term.
  const decayUnits = DECAY_RATE_GRID.map(() => 0);
  for (const game of recentGames) {
    const daysAgo = differenceInCalendarDays(tip, parseISO(game.date));
    if (daysAgo < 1 || daysAgo > DECAY_LOOKBACK_DAYS) continue;
    const discount = blowoutDiscount(game.pointMargin);
    decayLoadScore += GAME_BASE_COST * discount * Math.exp(-DECAY_RATE * daysAgo);
    for (let i = 0; i < DECAY_RATE_GRID.length; i++) {
      decayUnits[i]! += discount * Math.exp(-DECAY_RATE_GRID[i]! * daysAgo);
    }
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

  // Wider travel windows, for the fit only — the score still charges the ratified 7 days.
  // Both are free: `recentGames` already spans 30 days, so no extra rows are read.
  const travelWindowMiles = ([14, 30] as const).map((days) =>
    computeTotalTravelMiles(
      gameDate,
      tip,
      recentGames,
      currentGameIsHome,
      currentVenueLat,
      currentVenueLon,
      teamHomeLat,
      teamHomeLon,
      days
    )
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
  const b2bMultiplier = isBackToBack
    ? backToBackMultiplier(lastGame.tipOffUtc, currentTipOffUtc)
    : 1.0;

  // Visiting altitude tonight dominates; otherwise the night after a visit carries a
  // smaller residual. `!lastGame.isHome` matters: Denver and Utah leaving home are
  // descending, which is the easy direction and earns nothing.
  const priorVisitToAltitude = !lastGame.isHome && lastGame.venueAltitude === true;
  const altMultiplier = isVisitingAltitude
    ? ALTITUDE_MULTIPLIER
    : priorVisitToAltitude
      ? ALTITUDE_CARRYOVER_MULTIPLIER
      : 1.0;

  // Anchored so the curve starts at exactly 0 on the plateau day. Previously the gate
  // dropped a continuous function in at full strength, so crossing from two days' rest
  // to three produced a −1.26 step out of nowhere — an artifact of the `if`, not a
  // model of recovery. Rest credit now begins at the plateau and accrues from there.
  let freshnessBonus = 0;
  if (daysSinceLastGame >= FRESHNESS_PLATEAU_DAYS) {
    freshnessBonus =
      FRESHNESS_MAX_BONUS *
      (1 -
        Math.exp(
          -(daysSinceLastGame - FRESHNESS_PLATEAU_DAYS) / FRESHNESS_PLATEAU_DAYS
        ));
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
    features: {
      decayUnits,
      travelMiles14: travelWindowMiles[0]!,
      travelMiles30: travelWindowMiles[1]!,
      homeStandLength,
      jetLagUnits,
      zonesCrossed,
      zoneShiftHours,
      turnaroundHours: turnaroundHoursBetween(lastGame.tipOffUtc, currentTipOffUtc),
      priorOvertimePeriods: priorOtPeriods,
      densityStressPoints: stressPoints,
      bodyClockHour,
    },
  };
}

export function calculateRestAdvantage(
  homeFatigue: FatigueResult,
  awayFatigue: FatigueResult
): number {
  return Math.round((awayFatigue.score - homeFatigue.score) * 100) / 100;
}

// ─── Scoring a whole game ───────────────────────────────────────

/** The team fields the model needs. `latitude`/`longitude` are the DB's numeric-as-string. */
export interface FatigueTeam {
  id: number;
  abbreviation: string;
  latitude: string;
  longitude: string;
  altitudeFlag: boolean;
}

export interface FatigueGame {
  date: string;
  tipOffUtc?: Date | null;
  neutralSite?: boolean;
  neutralVenueCity?: string | null;
}

/**
 * Both sides of one game, with the geometry resolved here rather than by each caller.
 *
 * The two production callers — `scripts/backfill_fatigue.ts` and `src/lib/daily-refresh.ts` —
 * each assembled these coordinates themselves, and had diverged: backfill ran both teams through
 * `eraCoordinates`, so a 1995 Sonics home game geolocates in Seattle, and daily-refresh read
 * `team.latitude` raw. It was invisible only because the daily path never looks further back
 * than a fortnight. Nothing asserted the two agreed, and nothing would have.
 *
 * Prior games were never affected: `rowToRecentGame` applies `eraCoordinates` on both paths.
 * The fork was tonight's game alone.
 *
 * Coordinates are parsed strictly. Backfill previously used bare `parseFloat`, so a malformed
 * row would have produced a NaN score rather than a failure; both callers already catch per
 * game, so throwing is the safe unification.
 */
export function scoreGameFatigue(input: {
  game: FatigueGame;
  homeTeam: FatigueTeam;
  awayTeam: FatigueTeam;
  homeRecentGames: RecentGame[];
  awayRecentGames: RecentGame[];
}): { home: FatigueResult; away: FatigueResult } {
  const { game, homeTeam, awayTeam } = input;
  const date = String(game.date);

  const homeArena = eraCoordinates(
    homeTeam.abbreviation,
    date,
    parseCoordinate(homeTeam.latitude, homeTeam.id, "latitude"),
    parseCoordinate(homeTeam.longitude, homeTeam.id, "longitude")
  );
  const awayArena = eraCoordinates(
    awayTeam.abbreviation,
    date,
    parseCoordinate(awayTeam.latitude, awayTeam.id, "latitude"),
    parseCoordinate(awayTeam.longitude, awayTeam.id, "longitude")
  );

  // Neutral site → both teams are away, at a venue that is neither arena. An unknown city
  // resolves to null and falls back to the listed home team's arena.
  const neutral = game.neutralSite
    ? neutralVenueCoordinates(game.neutralVenueCity)
    : null;
  const venueLat = neutral ? neutral.latitude : homeArena.latitude;
  const venueLon = neutral ? neutral.longitude : homeArena.longitude;

  return {
    home: calculateFatigue({
      gameDate: date,
      recentGames: input.homeRecentGames,
      // At home, a team is not *visiting* altitude — unless the neutral city has it.
      isVisitingAltitude: neutral?.altitude ?? false,
      teamHomeLat: homeArena.latitude,
      teamHomeLon: homeArena.longitude,
      currentVenueLat: venueLat,
      currentVenueLon: venueLon,
      currentGameIsHome: !neutral,
      currentTipOffUtc: game.tipOffUtc,
    }),
    away: calculateFatigue({
      gameDate: date,
      recentGames: input.awayRecentGames,
      isVisitingAltitude: neutral?.altitude ?? homeTeam.altitudeFlag === true,
      teamHomeLat: awayArena.latitude,
      teamHomeLon: awayArena.longitude,
      currentVenueLat: venueLat,
      currentVenueLon: venueLon,
      currentGameIsHome: false,
      currentTipOffUtc: game.tipOffUtc,
    }),
  };
}

function parseCoordinate(
  value: string,
  teamId: number,
  coordinate: "latitude" | "longitude"
): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid ${coordinate} for team ${teamId}`);
  }
  return parsed;
}
