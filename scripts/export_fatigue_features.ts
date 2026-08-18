/**
 * Exports the raw fatigue features for every game-side to a single CSV, for the fitting
 * harness in `ml/`.
 *
 * Why this exists: `backfill_fatigue.ts` makes four database round trips per game, which is
 * ~4 hours for a full pass and leaves the site without fatigue data while it runs. Searching
 * for weights needs tens of passes, so it cannot go through the database at all. This loads
 * every game once and slices each team's 30-day window in memory.
 *
 * It calls the real `scoreGameFatigue` and the real `rowToRecentGame`. There is deliberately
 * no second implementation of the model here — the whole point of the CSV hop is that Python
 * fits weights without ever re-deriving what the weights apply to.
 *
 * Verification: the `score` column is recomputed from scratch and compared against the
 * `fatigue_scores` rows already in the database. A faithful harness reproduces them exactly.
 *
 * Usage:
 *   pnpm exec tsx scripts/export_fatigue_features.ts
 *   pnpm exec tsx scripts/export_fatigue_features.ts --verify-only   # no CSV, just the check
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { format, parseISO, subDays } from "date-fns";
import { asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, teams } from "@/lib/db/schema";
import {
  DECAY_RATE_GRID,
  FATIGUE_RECENT_LOOKBACK_DAYS,
  scoreGameFatigue,
  type FatigueResult,
  type FatigueTeam,
} from "@/lib/fatigue";
import { rowToRecentGame, type PriorGameRow } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

const OUT_DIR = path.join(process.cwd(), "ml", "data");
const CSV_PATH = path.join(OUT_DIR, "fatigue_features.csv");
const REPORT_PATH = path.join(OUT_DIR, "fatigue_export_report.txt");

/** First index whose date is >= `date`. The lists are sorted, so both window ends are O(log n). */
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

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

const DECAY_COLUMNS = DECAY_RATE_GRID.map(
  (rate) => `decay_u_${String(rate).replace(".", "")}`
);

const HEADER = [
  "game_id",
  "external_id",
  "date",
  "season",
  "game_type",
  "status",
  "neutral_site",
  "team_id",
  "team_abbr",
  "opp_team_id",
  "is_home",
  "team_score",
  "opp_score",
  "won",
  // ── what today's ratified model produces ──
  "score",
  "decay_load",
  "travel_load",
  "road_load",
  "b2b_mult",
  "alt_mult",
  "density_mult",
  "freshness_bonus",
  "ot_bonus",
  "games_7",
  "games_30",
  "road_streak",
  "travel_miles_7",
  "is_b2b",
  "rest_days",
  "is_ot_penalty",
  "is_3in4",
  "is_4in6",
  "has_jetlag",
  // ── raw, unweighted measurement ──
  ...DECAY_COLUMNS,
  "travel_miles_14",
  "travel_miles_30",
  "home_stand",
  "jetlag_units",
  "zones_crossed",
  "zone_shift_hours",
  "turnaround_hours",
  "prior_ot",
  "density_points",
  "body_clock_hour",
].join(",");

function row(
  game: {
    id: number;
    externalId: string;
    date: string;
    season: string;
    gameType: string;
    status: string;
    neutralSite: boolean;
    homeScore: number | null;
    awayScore: number | null;
  },
  team: FatigueTeam,
  oppTeamId: number,
  isHome: boolean,
  r: FatigueResult
): string {
  const teamScore = isHome ? game.homeScore : game.awayScore;
  const oppScore = isHome ? game.awayScore : game.homeScore;
  const won =
    teamScore === null || oppScore === null ? null : teamScore > oppScore ? 1 : 0;

  return [
    game.id,
    game.externalId,
    game.date,
    game.season,
    game.gameType,
    game.status,
    game.neutralSite,
    team.id,
    team.abbreviation,
    oppTeamId,
    isHome,
    teamScore,
    oppScore,
    won,
    r.score,
    r.decayLoadScore,
    r.travelLoadScore,
    r.roadSegmentLoadScore,
    r.backToBackMultiplier,
    r.altitudeMultiplier,
    r.densityMultiplier,
    r.freshnessBonus,
    r.overtimeFatigueBonus,
    r.gamesInLast7Days,
    r.gamesInLast30Days,
    r.roadTripConsecutiveAway,
    r.travelDistanceMiles,
    r.isBackToBack,
    r.daysSinceLastGame,
    r.isOvertimePenalty,
    r.isThreeInFour,
    r.isFourInSix,
    r.hasTimeZoneDisplacement,
    ...r.features.decayUnits,
    r.features.travelMiles14,
    r.features.travelMiles30,
    r.features.homeStandLength,
    r.features.jetLagUnits,
    r.features.zonesCrossed,
    r.features.zoneShiftHours,
    r.features.turnaroundHours,
    r.features.priorOvertimePeriods,
    r.features.densityStressPoints,
    r.features.bodyClockHour,
  ]
    .map(csvCell)
    .join(",");
}

async function main(): Promise<void> {
  loadEnvLocal();
  const verifyOnly = process.argv.includes("--verify-only");

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  console.log("[export] loading teams and games...");
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

  console.log(`[export] ${gameRows.length} games, ${teamRows.length} teams.`);

  // `fetchRecentGamesForTeam` reads final games only, of any game_type, in
  // [date − FATIGUE_RECENT_LOOKBACK_DAYS, date). This index has to match that predicate
  // exactly or every score downstream is wrong in a way nothing would flag.
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

  console.log("[export] loading existing fatigue_scores for the fidelity check...");
  const stored = await appDb
    .select({
      gameId: fatigueScores.gameId,
      teamId: fatigueScores.teamId,
      score: fatigueScores.score,
      computedAt: fatigueScores.computedAt,
    })
    .from(fatigueScores);

  // A game can hold more than one row per team after a partial rerun; the readers take the
  // newest by computed_at, so the check compares against the same row the site displays.
  const storedScore = new Map<string, { score: string; computedAt: Date }>();
  for (const s of stored) {
    const key = `${s.gameId}:${s.teamId}`;
    const prev = storedScore.get(key);
    if (!prev || s.computedAt > prev.computedAt) {
      storedScore.set(key, { score: s.score, computedAt: s.computedAt });
    }
  }
  console.log(
    `[export] ${stored.length} stored rows, ${storedScore.size} unique (game, team).`
  );

  await mkdir(OUT_DIR, { recursive: true });
  const out = verifyOnly ? null : createWriteStream(CSV_PATH, { encoding: "utf8" });
  if (out) out.write(HEADER + "\n");

  let written = 0;
  let compared = 0;
  let missingStored = 0;
  const mismatches: Array<{
    gameId: number;
    teamId: number;
    date: string;
    status: string;
    stored: number;
    computed: number;
  }> = [];
  const failures: Array<{ gameId: number; date: string; error: string }> = [];
  /** Stored rows on unplayed games — projections, not comparable to a played-basis rebuild. */
  let skippedUnplayed = 0;

  for (const g of gameRows) {
    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away) {
      failures.push({ gameId: g.id, date: g.date, error: "missing team record" });
      continue;
    }

    let scored: { home: FatigueResult; away: FatigueResult };
    try {
      scored = scoreGameFatigue({
        game: g,
        homeTeam: home,
        awayTeam: away,
        homeRecentGames: windowFor(g.homeTeamId, g.date),
        awayRecentGames: windowFor(g.awayTeamId, g.date),
      });
    } catch (err) {
      failures.push({ gameId: g.id, date: g.date, error: String(err) });
      continue;
    }

    for (const [team, oppId, isHome, result] of [
      [home, g.awayTeamId, true, scored.home],
      [away, g.homeTeamId, false, scored.away],
    ] as const) {
      if (out) {
        out.write(row(g, team, oppId, isHome, result) + "\n");
        written++;
      }

      const prior = storedScore.get(`${g.id}:${team.id}`);
      if (!prior) {
        missingStored++;
        continue;
      }
      // Only played games are comparable. Since 2026-08-18 a released-but-unplayed season
      // carries *projected* fatigue (`scripts/project_fatigue.ts`), scored against prior games
      // taken from the schedule — while this exporter deliberately rebuilds every score from
      // `final` priors only, which is the basis the research question is asked on. Comparing
      // the two measures nothing but the difference between the bases, and it was reporting
      // 2,322 "mismatches" that were simply the other question's answer.
      if (g.status !== "final") {
        skippedUnplayed++;
        continue;
      }
      compared++;
      const storedNum = Number(prior.score);
      if (Math.abs(storedNum - result.score) > 1e-9) {
        if (mismatches.length < 5000) {
          mismatches.push({
            gameId: g.id,
            teamId: team.id,
            date: g.date,
            status: g.status,
            stored: storedNum,
            computed: result.score,
          });
        }
      }
    }
  }

  if (out) await new Promise<void>((resolve) => out.end(resolve));

  const byStatus = new Map<string, number>();
  for (const m of mismatches) {
    byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
  }

  const report = [
    "# Fatigue feature export — fidelity report",
    "",
    `games read              ${gameRows.length}`,
    `csv rows written        ${written}`,
    `stored rows compared    ${compared}`,
    `no stored row           ${missingStored}`,
    `skipped (unplayed)      ${skippedUnplayed}`,
    `scoring failures        ${failures.length}`,
    "",
    `SCORE MISMATCHES        ${mismatches.length}`,
    ...[...byStatus.entries()].map(([s, n]) => `  status=${s}  ${n}`),
    "",
    "First 20 mismatches (game_id, team_id, date, status, stored, computed):",
    ...mismatches
      .slice(0, 20)
      .map(
        (m) =>
          `  ${m.gameId} ${m.teamId} ${m.date} ${m.status} stored=${m.stored} computed=${m.computed}`
      ),
    "",
    "First 20 failures:",
    ...failures.slice(0, 20).map((f) => `  ${f.gameId} ${f.date} ${f.error}`),
    "",
  ].join("\n");

  await writeFile(REPORT_PATH, report, "utf8");
  console.log(`[export] report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
