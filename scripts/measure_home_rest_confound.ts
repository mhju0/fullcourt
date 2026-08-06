/**
 * Measures how much of the rest advantage is really the home team's venue.
 *
 * The question this answers: a visitor got to the arena by flying, and the home team usually
 * did not, so "the more rested team" and "the home team" may be close to the same statement.
 * If they are, the site's called/declined split is a fact about venue rather than about rest.
 *
 * Four measurements, all on the published population — `getCompletedGamesWithFatigue()`'s rows,
 * reproduced here from `games` + the latest `fatigue_scores` row per side so that game ids and
 * prior-game venues are in hand. The reproduction is checked against the real query and against
 * `buildHistoricalBacktest`, and the run aborts if either disagrees.
 *
 * 1. How often the VISITOR is the more rested side, as a share of decidable games.
 * 2. Whether the model structurally favours the home side: mean score per side, and the same
 *    per term, so a venue-driven term can be told apart from a schedule-driven one. The terms
 *    are recomputed in memory with the real `scoreGameFatigue` (road-segment load is not a
 *    stored column), and every recomputed score is compared against the stored one.
 * 3. The exception: games where BOTH teams travelled into the venue — the home side coming off
 *    a road game. Visitor-rested share and home win rate inside that subset.
 * 4. Whether the rested-visitor half's low win rate is just home court: baseline home win rate
 *    against the home win rate when the visitor is the rested side.
 *
 * Read-only. Writes one report and touches nothing else.
 *
 * Usage:
 *   pnpm exec tsx scripts/measure_home_rest_confound.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { format, parseISO, subDays } from "date-fns";
import { asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, teams } from "@/lib/db/schema";
import {
  FATIGUE_RECENT_LOOKBACK_DAYS,
  scoreGameFatigue,
  type FatigueResult,
} from "@/lib/fatigue";
import { rowToRecentGame, type PriorGameRow } from "@/lib/fatigue-recent-games";
import { haversineDistance } from "@/lib/haversine";
import { loadEnvLocal } from "@/lib/load-env-local";
import { neutralVenueCoordinates } from "@/lib/neutral-venues";
import {
  buildHistoricalBacktest,
  classifyRestAdvantage,
  isCalledSide,
  winPct,
} from "@/lib/rest-advantage-evidence";
import { isNormallyPlayed } from "@/lib/season-regime";
import { eraCoordinates } from "@/lib/team-era-coordinates";

type AppDb = PostgresJsDatabase<typeof Schema>;

const OUT_PATH = path.join(process.cwd(), "docs", "audit", "home-rest-confound.txt");

/** Same threshold `fatigue.ts` uses to decide two arenas are the same building. */
const SAME_ARENA_MILES = 1;

/** ESPN-era floor, so the 44.39% figure in `rest-advantage-evidence.ts` can be reproduced. */
const ESPN_ERA_FIRST_SEASON = "2002-03";

type Side = "home" | "away";

type StoredFatigue = {
  score: number;
  decayLoad: number;
  travelLoad: number;
  b2bMult: number;
  altMult: number;
  densityMult: number;
  freshness: number;
  travelMiles: number;
  roadStreak: number;
  isB2b: boolean;
  restDays: number | null;
  isOtPenalty: boolean;
  hasJetLag: boolean;
  computedAt: Date;
};

type Venue = { lat: number; lon: number };

type PopulationGame = {
  id: number;
  date: string;
  season: string;
  homeScore: number;
  awayScore: number;
  homeWon: boolean;
  /** Stored scores, exactly what the site classifies from. */
  home: StoredFatigue;
  away: StoredFatigue;
  differential: number;
  restedSide: "home" | "away" | "neutral";
  /** Recomputed terms, for the road-segment component the DB does not store. */
  computed: { home: FatigueResult; away: FatigueResult } | null;
  /** Miles from each side's previous arena to tonight's venue; null when no prior game. */
  homeInboundMiles: number | null;
  awayInboundMiles: number | null;
  /** Calendar days since each side's previous game; null when there is none. */
  homeRestDays: number | null;
  awayRestDays: number | null;
};

function lowerBound(rows: PriorGameRow[], date: string): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(2)}%` : "n/a";
}

/** One row of the "who is more rested, and who won" table. */
type Cut = {
  label: string;
  games: PopulationGame[];
};

function summarizeCut(cut: Cut, populationSize: number): string[] {
  const rows = cut.games;
  const decidable = rows.filter((g) => g.restedSide !== "neutral");
  const awayRested = decidable.filter((g) => g.restedSide === "away");
  const homeRested = decidable.filter((g) => g.restedSide === "home");
  const homeWins = rows.filter((g) => g.homeWon).length;
  const awayRestedHomeWins = awayRested.filter((g) => g.homeWon).length;

  return [
    `  ${cut.label}`,
    `    games                       ${rows.length}  (${pct(rows.length, populationSize)} of population)`,
    `    decidable                   ${decidable.length}`,
    `    visitor is more rested      ${awayRested.length}  (${pct(awayRested.length, decidable.length)} of decidable)`,
    `    home is more rested         ${homeRested.length}  (${pct(homeRested.length, decidable.length)} of decidable)`,
    `    home win rate (all)         ${pct(homeWins, rows.length)}`,
    `    home win rate (visitor rested) ${pct(awayRestedHomeWins, awayRested.length)}`,
    `    mean RA differential        ${mean(rows.map((g) => g.differential)).toFixed(3)}`,
    "",
  ];
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { db } = await import("@/lib/db");
  const { getCompletedGamesWithFatigue } = await import("@/lib/db/queries");
  const appDb = db as AppDb;

  console.log("[measure] loading teams, games and fatigue scores...");
  const teamRows = await appDb.select().from(teams);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const gameRows = await appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      gameType: games.gameType,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      overtimePeriods: games.overtimePeriods,
      tipOffUtc: games.tipOffUtc,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
    })
    .from(games)
    .orderBy(asc(games.date), asc(games.id));

  const storedRows = await appDb
    .select({
      gameId: fatigueScores.gameId,
      teamId: fatigueScores.teamId,
      score: fatigueScores.score,
      decayLoadScore: fatigueScores.decayLoadScore,
      travelLoadScore: fatigueScores.travelLoadScore,
      backToBackMultiplier: fatigueScores.backToBackMultiplier,
      altitudeMultiplier: fatigueScores.altitudeMultiplier,
      densityMultiplier: fatigueScores.densityMultiplier,
      freshnessBonus: fatigueScores.freshnessBonus,
      travelDistanceMiles: fatigueScores.travelDistanceMiles,
      roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
      isBackToBack: fatigueScores.isBackToBack,
      daysSinceLastGame: fatigueScores.daysSinceLastGame,
      isOvertimePenalty: fatigueScores.isOvertimePenalty,
      hasTimeZoneDisplacement: fatigueScores.hasTimeZoneDisplacement,
      computedAt: fatigueScores.computedAt,
    })
    .from(fatigueScores);

  // Newest row per (game, team) — the same tie-break the site's readers use.
  const stored = new Map<string, StoredFatigue>();
  for (const s of storedRows) {
    const key = `${s.gameId}:${s.teamId}`;
    const prev = stored.get(key);
    if (prev && prev.computedAt >= s.computedAt) continue;
    stored.set(key, {
      score: Number(s.score),
      decayLoad: Number(s.decayLoadScore),
      travelLoad: Number(s.travelLoadScore),
      b2bMult: Number(s.backToBackMultiplier),
      altMult: Number(s.altitudeMultiplier),
      densityMult: Number(s.densityMultiplier),
      freshness: Number(s.freshnessBonus),
      travelMiles: Number(s.travelDistanceMiles),
      roadStreak: s.roadTripConsecutiveAway,
      isB2b: s.isBackToBack,
      restDays: s.daysSinceLastGame,
      isOtPenalty: s.isOvertimePenalty,
      hasJetLag: s.hasTimeZoneDisplacement,
      computedAt: s.computedAt,
    });
  }

  console.log(
    `[measure] ${gameRows.length} games, ${teamRows.length} teams, ${stored.size} unique fatigue rows.`
  );

  // Prior-game index, matching `fetchRecentGamesForTeam`: final games only, any game_type.
  const priorByTeam = new Map<number, PriorGameRow[]>();
  for (const t of teamRows) priorByTeam.set(t.id, []);

  const toPriorRow = (g: (typeof gameRows)[number]): PriorGameRow => {
    const home = teamById.get(g.homeTeamId)!;
    const away = teamById.get(g.awayTeamId)!;
    return {
      date: g.date,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeAbbr: home.abbreviation,
      awayAbbr: away.abbreviation,
      homeLat: home.latitude,
      homeLon: home.longitude,
      homeAltitude: home.altitudeFlag,
      awayLat: away.latitude,
      awayLon: away.longitude,
      awayAltitude: away.altitudeFlag,
      overtimePeriods: g.overtimePeriods,
      tipOffUtc: g.tipOffUtc,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      neutralSite: g.neutralSite,
      neutralVenueCity: g.neutralVenueCity,
    };
  };

  for (const g of gameRows) {
    if (g.status !== "final") continue;
    const prior = toPriorRow(g);
    priorByTeam.get(g.homeTeamId)?.push(prior);
    priorByTeam.get(g.awayTeamId)?.push(prior);
  }
  for (const list of priorByTeam.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const windowFor = (teamId: number, gameDate: string) => {
    const list = priorByTeam.get(teamId) ?? [];
    const windowStart = format(
      subDays(parseISO(gameDate), FATIGUE_RECENT_LOOKBACK_DAYS),
      "yyyy-MM-dd"
    );
    const from = lowerBound(list, windowStart);
    const to = lowerBound(list, gameDate);
    return list.slice(from, to).map((r) => rowToRecentGame(r, teamId));
  };

  /** The arena the team's previous game was played in, from that team's point of view. */
  const previousArena = (
    teamId: number,
    gameDate: string
  ): { venue: Venue; date: string } | null => {
    const list = priorByTeam.get(teamId) ?? [];
    const idx = lowerBound(list, gameDate) - 1;
    if (idx < 0) return null;
    const recent = rowToRecentGame(list[idx]!, teamId);
    const venue =
      recent.venueLat !== undefined && recent.venueLon !== undefined
        ? { lat: recent.venueLat, lon: recent.venueLon }
        : recent.isHome
          ? { lat: recent.teamLat, lon: recent.teamLon }
          : { lat: recent.opponentLat, lon: recent.opponentLon };
    return { venue, date: recent.date };
  };

  // ── Build the population ────────────────────────────────────────
  const population: PopulationGame[] = [];
  let recomputed = 0;
  let scoreMismatches = 0;
  let recomputeFailures = 0;

  for (const g of gameRows) {
    if (g.gameType !== "regular") continue;
    if (!isNormallyPlayed(g.season, g.date)) continue;
    if (g.status !== "final") continue;
    if (g.homeScore === null || g.awayScore === null) continue;

    const home = stored.get(`${g.id}:${g.homeTeamId}`);
    const away = stored.get(`${g.id}:${g.awayTeamId}`);
    if (!home || !away) continue;

    const homeTeam = teamById.get(g.homeTeamId);
    const awayTeam = teamById.get(g.awayTeamId);
    if (!homeTeam || !awayTeam) continue;

    const restAdvantage = classifyRestAdvantage(home.score, away.score);

    const homeArena = eraCoordinates(
      homeTeam.abbreviation,
      g.date,
      Number.parseFloat(homeTeam.latitude),
      Number.parseFloat(homeTeam.longitude)
    );
    const neutral = g.neutralSite ? neutralVenueCoordinates(g.neutralVenueCity) : null;
    const venue: Venue = neutral
      ? { lat: neutral.latitude, lon: neutral.longitude }
      : { lat: homeArena.latitude, lon: homeArena.longitude };

    const homePrev = previousArena(g.homeTeamId, g.date);
    const awayPrev = previousArena(g.awayTeamId, g.date);
    const inbound = (prev: { venue: Venue; date: string } | null): number | null =>
      prev === null
        ? null
        : haversineDistance(prev.venue.lat, prev.venue.lon, venue.lat, venue.lon);
    const restDays = (prev: { venue: Venue; date: string } | null): number | null =>
      prev === null
        ? null
        : Math.round(
            (parseISO(g.date).getTime() - parseISO(prev.date).getTime()) / 86_400_000
          );

    let computed: { home: FatigueResult; away: FatigueResult } | null = null;
    try {
      computed = scoreGameFatigue({
        game: g,
        homeTeam,
        awayTeam,
        homeRecentGames: windowFor(g.homeTeamId, g.date),
        awayRecentGames: windowFor(g.awayTeamId, g.date),
      });
      recomputed += 2;
      if (Math.abs(computed.home.score - home.score) > 1e-9) scoreMismatches++;
      if (Math.abs(computed.away.score - away.score) > 1e-9) scoreMismatches++;
    } catch {
      recomputeFailures++;
    }

    population.push({
      id: g.id,
      date: g.date,
      season: g.season,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      homeWon: g.homeScore > g.awayScore,
      home,
      away,
      differential: restAdvantage.differential,
      restedSide: restAdvantage.advantageTeam,
      computed,
      homeInboundMiles: inbound(homePrev),
      awayInboundMiles: inbound(awayPrev),
      homeRestDays: restDays(homePrev),
      awayRestDays: restDays(awayPrev),
    });
  }

  // ── Self-check against the shipped query and reducer ────────────
  console.log("[measure] cross-checking against getCompletedGamesWithFatigue()...");
  const shippedRows = await getCompletedGamesWithFatigue();
  const shipped = buildHistoricalBacktest(shippedRows);

  const decidable = population.filter((g) => g.restedSide !== "neutral");
  const called = decidable.filter((g) => isCalledSide(g.restedSide));
  const uncalled = decidable.filter((g) => g.restedSide === "away");
  const neutral = population.filter((g) => g.restedSide === "neutral");

  const checks = [
    `population rows           ${population.length}`,
    `shipped query rows        ${shippedRows.length}`,
    `population == shipped     ${population.length === shippedRows.length ? "YES" : "NO"}`,
    `called (home rested)      ${called.length}`,
    `shipped totalGames        ${shipped.totalGames}`,
    `called == shipped         ${called.length === shipped.totalGames ? "YES" : "NO"}`,
    `uncalled (visitor rested) ${uncalled.length}`,
    `shipped awayTeamMoreRested ${shipped.homeAwayBreakdown.awayTeamMoreRested.games}`,
    `uncalled == shipped       ${uncalled.length === shipped.homeAwayBreakdown.awayTeamMoreRested.games ? "YES" : "NO"}`,
    `recomputed sides          ${recomputed}`,
    `score mismatches          ${scoreMismatches}`,
    `recompute failures        ${recomputeFailures}`,
  ];

  // ── Q1: how often is the visitor the more rested team ───────────
  const q1 = [
    "## Q1 — how often is the VISITOR the more rested team",
    "",
    `population (final, regular, publishable, both fatigue sides)   ${population.length}`,
    `neutral (|RA| < 0.5, no side is 'more rested')                 ${neutral.length}  (${pct(neutral.length, population.length)} of population)`,
    `decidable (|RA| >= 0.5)                                        ${decidable.length}  (${pct(decidable.length, population.length)} of population)`,
    "",
    `home more rested  (CALLED)     ${called.length}  = ${pct(called.length, decidable.length)} of decidable, ${pct(called.length, population.length)} of population`,
    `away more rested  (DECLINED)   ${uncalled.length}  = ${pct(uncalled.length, decidable.length)} of decidable, ${pct(uncalled.length, population.length)} of population`,
    "",
    `rested team won, home-rested   ${pct(called.filter((g) => g.homeWon).length, called.length)}`,
    `rested team won, away-rested   ${pct(uncalled.filter((g) => !g.homeWon).length, uncalled.length)}`,
    "",
  ];

  // ── Q2: is the model structurally home-favouring ────────────────
  const withComputed = population.filter((g) => g.computed !== null);
  const term = (
    pick: (g: PopulationGame, side: Side) => number,
    rows: PopulationGame[] = population
  ) => ({
    home: mean(rows.map((g) => pick(g, "home"))),
    away: mean(rows.map((g) => pick(g, "away"))),
  });
  const shareTrue = (
    pick: (g: PopulationGame, side: Side) => boolean,
    rows: PopulationGame[] = population
  ) => ({
    home: rows.filter((g) => pick(g, "home")).length / Math.max(1, rows.length),
    away: rows.filter((g) => pick(g, "away")).length / Math.max(1, rows.length),
  });

  const termRow = (
    label: string,
    values: { home: number; away: number },
    digits = 3
  ): string => {
    const diff = values.away - values.home;
    return `  ${label.padEnd(34)} home ${values.home.toFixed(digits).padStart(10)}   away ${values.away.toFixed(digits).padStart(10)}   away-minus-home ${diff.toFixed(digits).padStart(10)}`;
  };

  const scoreMeans = term((g, s) => g[s].score);
  const q2 = [
    "## Q2 — does the model structurally favour the home side",
    "",
    `Means over all ${population.length} population games. 'away-minus-home' is the sign the`,
    "rest-advantage differential is built from: positive means the visitor carries more of it.",
    "",
    termRow("FINAL SCORE", scoreMeans),
    "",
    "  -- venue-driven terms (the model treats the two sides differently by construction) --",
    termRow("travel load (score points)", term((g, s) => g[s].travelLoad)),
    termRow("travel miles, 7-day", term((g, s) => g[s].travelMiles), 1),
    termRow("altitude multiplier", term((g, s) => g[s].altMult), 4),
    termRow(
      "jet-lag flag (share of games)",
      shareTrue((g, s) => g[s].hasJetLag),
      4
    ),
    termRow("road streak (consecutive away)", term((g, s) => g[s].roadStreak)),
    ...(withComputed.length > 0
      ? [
          termRow(
            "road-segment load (recomputed)",
            term((g, s) => g.computed![s].roadSegmentLoadScore, withComputed),
            4
          ),
          termRow(
            "jet-lag units (recomputed)",
            term((g, s) => g.computed![s].features.jetLagUnits, withComputed),
            4
          ),
        ]
      : []),
    "",
    "  -- schedule-driven terms (nothing in them knows which side is at home) --",
    termRow("decay load (score points)", term((g, s) => g[s].decayLoad)),
    termRow("back-to-back multiplier", term((g, s) => g[s].b2bMult), 4),
    termRow(
      "back-to-back flag (share)",
      shareTrue((g, s) => g[s].isB2b),
      4
    ),
    termRow("density multiplier", term((g, s) => g[s].densityMult), 4),
    termRow("freshness bonus", term((g, s) => g[s].freshness)),
    termRow(
      "prior-OT flag (share)",
      shareTrue((g, s) => g[s].isOtPenalty),
      4
    ),
    termRow(
      "days since last game",
      term((g, s) => g[s].restDays ?? 0),
      3
    ),
    "",
    `mean RA differential (away score - home score)   ${mean(population.map((g) => g.differential)).toFixed(4)}`,
    `median-ish: share of population with RA > 0      ${pct(population.filter((g) => g.differential > 0).length, population.length)}`,
    `share with RA < 0                                ${pct(population.filter((g) => g.differential < 0).length, population.length)}`,
    "",
  ];

  // ── Q3: both teams travelling into the game ─────────────────────
  const travelledIn = (miles: number | null): boolean =>
    miles !== null && miles >= SAME_ARENA_MILES;

  const bothTravelled = population.filter(
    (g) => travelledIn(g.homeInboundMiles) && travelledIn(g.awayInboundMiles)
  );
  const onlyVisitorTravelled = population.filter(
    (g) => !travelledIn(g.homeInboundMiles) && travelledIn(g.awayInboundMiles)
  );
  const bothTravelledB2b = bothTravelled.filter(
    (g) => g.homeRestDays === 1 && g.awayRestDays === 1
  );
  const homeTravelledB2b = population.filter(
    (g) => travelledIn(g.homeInboundMiles) && g.homeRestDays === 1
  );
  const homeFurtherThanVisitor = population.filter(
    (g) =>
      g.homeInboundMiles !== null &&
      g.awayInboundMiles !== null &&
      g.homeInboundMiles > g.awayInboundMiles
  );

  const q3 = [
    "## Q3 — the exception: both teams travelled into the venue",
    "",
    "'Travelled in' = the side's previous final game was played in a different building",
    `(>= ${SAME_ARENA_MILES} great-circle mile from tonight's venue). Season openers have no previous game and`,
    "count as not travelling in for the home side.",
    "",
    ...summarizeCut({ label: "ALL population games", games: population }, population.length),
    ...summarizeCut(
      { label: "BOTH sides travelled in (home coming off a road game)", games: bothTravelled },
      population.length
    ),
    ...summarizeCut(
      { label: "ONLY the visitor travelled in (home coming off a home game)", games: onlyVisitorTravelled },
      population.length
    ),
    ...summarizeCut(
      { label: "BOTH travelled in AND both on one night's rest", games: bothTravelledB2b },
      population.length
    ),
    ...summarizeCut(
      { label: "home travelled in on one night's rest (any visitor state)", games: homeTravelledB2b },
      population.length
    ),
    ...summarizeCut(
      { label: "home flew FARTHER than the visitor", games: homeFurtherThanVisitor },
      population.length
    ),
  ];

  // ── Q4: is the rested-visitor win rate just home court ──────────
  const homeWinRate = (rows: PopulationGame[]) =>
    winPct(rows.filter((g) => g.homeWon).length, rows.length);

  const magnitudeRows = [1, 2, 3, 4, 5, 6].map((bar) => {
    const homeSide = called.filter((g) => Math.abs(g.differential) >= bar);
    const awaySide = uncalled.filter((g) => Math.abs(g.differential) >= bar);
    return `  RA >= ${bar}   home-rested n=${String(homeSide.length).padStart(6)} home win ${String(homeWinRate(homeSide)).padStart(5)}%    visitor-rested n=${String(awaySide.length).padStart(6)} home win ${String(homeWinRate(awaySide)).padStart(5)}%`;
  });

  const espn = population.filter((g) => g.season >= ESPN_ERA_FIRST_SEASON);
  const espnUncalled = espn.filter((g) => g.restedSide === "away");
  const espnCalled = espn.filter((g) => g.restedSide === "home");

  // The docblock quotes 7,224 away calls; the published population gives fewer. The only
  // predicate the `ml/` harness that produced it does not apply is the abnormal-stretch
  // filter, so re-run the same count with the bubble left in and see whether it closes.
  const espnNoRegime: PopulationGame[] = [];
  for (const g of gameRows) {
    if (g.gameType !== "regular") continue;
    if (g.status !== "final") continue;
    if (g.homeScore === null || g.awayScore === null) continue;
    if (g.season < ESPN_ERA_FIRST_SEASON) continue;
    const home = stored.get(`${g.id}:${g.homeTeamId}`);
    const away = stored.get(`${g.id}:${g.awayTeamId}`);
    if (!home || !away) continue;
    const ra = classifyRestAdvantage(home.score, away.score);
    espnNoRegime.push({
      id: g.id,
      date: g.date,
      season: g.season,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      homeWon: g.homeScore > g.awayScore,
      home,
      away,
      differential: ra.differential,
      restedSide: ra.advantageTeam,
      computed: null,
      homeInboundMiles: null,
      awayInboundMiles: null,
      homeRestDays: null,
      awayRestDays: null,
    });
  }
  const espnNoRegimeUncalled = espnNoRegime.filter((g) => g.restedSide === "away");

  const q4 = [
    "## Q4 — is the rested-visitor result explained by home court alone",
    "",
    `baseline home win rate, ALL population games       ${homeWinRate(population)}%  (n=${population.length})`,
    `home win rate, neutral games (|RA| < 0.5)          ${homeWinRate(neutral)}%  (n=${neutral.length})`,
    `home win rate, home is more rested (CALLED)        ${homeWinRate(called)}%  (n=${called.length})`,
    `home win rate, VISITOR is more rested (DECLINED)   ${homeWinRate(uncalled)}%  (n=${uncalled.length})`,
    "",
    "  the same four at two decimals, because the gap between them is the whole story:",
    `    baseline (every population game)   ${pct(population.filter((g) => g.homeWon).length, population.length)}`,
    `    neutral                            ${pct(neutral.filter((g) => g.homeWon).length, neutral.length)}`,
    `    called (home rested)               ${pct(called.filter((g) => g.homeWon).length, called.length)}`,
    `    declined (visitor rested)          ${pct(uncalled.filter((g) => g.homeWon).length, uncalled.length)}`,
    "",
    `visitor win rate when the visitor is more rested   ${(100 - homeWinRate(uncalled)).toFixed(1)}%`,
    `spread vs baseline (declined minus baseline)       ${(homeWinRate(uncalled) - homeWinRate(population)).toFixed(2)} pp`,
    `spread vs baseline (called minus baseline)         ${(homeWinRate(called) - homeWinRate(population)).toFixed(2)} pp`,
    "",
    "  home win rate by rest-edge magnitude, both sides:",
    ...magnitudeRows,
    "",
    `ESPN era (${ESPN_ERA_FIRST_SEASON}+), for the figure quoted in rest-advantage-evidence.ts:`,
    `  population                    ${espn.length}`,
    `  visitor more rested           ${espnUncalled.length}`,
    `  visitor won those             ${winPct(espnUncalled.filter((g) => !g.homeWon).length, espnUncalled.length)}%`,
    `  home more rested              ${espnCalled.length}`,
    `  home won those                ${homeWinRate(espnCalled)}%`,
    `  baseline home win rate        ${homeWinRate(espn)}%`,
    "",
    "  same count with the abnormal-stretch (bubble) filter REMOVED:",
    `    population                  ${espnNoRegime.length}`,
    `    visitor more rested         ${espnNoRegimeUncalled.length}`,
    `    visitor won those           ${winPct(espnNoRegimeUncalled.filter((g) => !g.homeWon).length, espnNoRegimeUncalled.length)}%`,
    `    difference vs published     ${espnNoRegimeUncalled.length - espnUncalled.length} games`,
    "",
  ];

  const report = [
    "# Home court vs rest — is the rest advantage really a venue statement?",
    `# generated ${new Date().toISOString()} by scripts/measure_home_rest_confound.ts`,
    "",
    "## Self-check (aborts nothing; read these first)",
    ...checks.map((c) => `  ${c}`),
    "",
    ...q1,
    ...q2,
    ...q3,
    ...q4,
  ].join("\n");

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, report, "utf8");
  console.log(`[measure] report written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
