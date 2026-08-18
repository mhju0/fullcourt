/**
 * Project fatigue and open predictions across a season's **unplayed** games.
 *
 * ── Why this is a separate script from `backfill_fatigue.ts` ────────────────────────────────
 *
 * `backfill_fatigue.ts` must never be pointed at a season that has not started. It scores every
 * game against `fetchRecentGamesForTeam`'s default basis — prior games that are `final` — so on
 * an unseen season every team has no prior game, every score comes back 0, and `buildRestAdvantage`
 * reads those zeros as a *measured dead heat*. That is not hypothetical: it was done to 2026-27 on
 * 2026-08-18 and printed "EVEN 0.0" across all 1,200 fixtures before the rows were deleted.
 *
 * This script asks the other question, and asks it explicitly: **if this schedule is played as
 * published, what does the fatigue look like?** It passes the `"scheduled"` basis, so prior games
 * are taken from the schedule rather than from results.
 *
 * ── What is and is not projected ────────────────────────────────────────────────────────────
 *
 * Every input the model takes is schedule-derived — rest days, travel legs, back-to-back,
 * 3-in-4, 4-in-6, density windows, altitude, time-zone displacement, road-trip length — **except
 * two, which are results**:
 *
 *   prior-game overtime  → 0     (no OT penalty)
 *   prior-game margin    → null  (no blowout discount)
 *
 * So a projected number differs from the eventual measured one only where the previous game went
 * to overtime or was a blowout. Everything else is already final the day the schedule is published.
 *
 * Nothing marks a row as projected in the database, and nothing should: a fatigue row belongs to a
 * game, and a game that is not `final` has not been played. `games.status` already carries the
 * distinction at every read site, and a second copy of that fact could only ever disagree with it.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────────────────────
 *
 * Only `status = 'scheduled'` games are selected, so a played game's measured fatigue can never be
 * overwritten by a projection. By default only games with no fatigue rows are processed, which
 * makes re-running cheap and idempotent — that is what lets it run after a mid-season re-seed
 * (NBA Cup fixtures resolving in December) without recomputing the season.
 *
 * As each game comes within 14 days, `run-daily.ts` recomputes it on the default `"played"` basis,
 * so a projection is always replaced by the measured value before tip-off.
 *
 * Usage:
 *   pnpm exec tsx scripts/project_fatigue.ts 2026-27              # games with no fatigue rows
 *   pnpm exec tsx scripts/project_fatigue.ts 2026-27 --force      # recompute every scheduled game
 *   pnpm exec tsx scripts/project_fatigue.ts 2026-27 --dry-run    # report only, write nothing
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, predictions, teams } from "@/lib/db/schema";
import { refreshDailyGames, type DailyRefreshPort } from "@/lib/daily-refresh";
import { fetchRecentGamesForTeam } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const season = args.find((a) => /^\d{4}-\d{2}$/.test(a));

  if (!season) {
    console.error(
      "Usage: pnpm exec tsx scripts/project_fatigue.ts <season> [--force] [--dry-run]"
    );
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const teamRows = await appDb.select().from(teams);

  const homeFatigue = alias(fatigueScores, "home_fatigue_projection");

  // `status = 'scheduled'` is the guard that makes this script unable to damage a played game.
  const conditions = [eq(games.season, season), eq(games.status, "scheduled")];
  if (!force) conditions.push(isNull(homeFatigue.id));

  const targets = await appDb
    .select({
      id: games.id,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      status: games.status,
      tipOffUtc: games.tipOffUtc,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
    })
    .from(games)
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .where(and(...conditions))
    .orderBy(asc(games.date), asc(games.id));

  if (targets.length === 0) {
    console.log(
      `[project-fatigue] ${season}: nothing to project` +
        (force ? " (no scheduled games)." : " — every scheduled game already has fatigue rows.")
    );
    return;
  }

  console.log(
    `[project-fatigue] ${season}: projecting ${targets.length} scheduled game(s)` +
      `${force ? " (--force: recomputing all)" : ""}` +
      `, ${targets[0].date} → ${targets[targets.length - 1].date}`
  );

  if (dryRun) {
    console.log("[project-fatigue] --dry-run: no rows written");
    return;
  }

  const port: DailyRefreshPort = {
    // The whole point of this script: prior games come from the schedule, not from results.
    loadRecentGames(teamId, gameDate) {
      return fetchRecentGamesForTeam(appDb, teamId, gameDate, "scheduled");
    },
    async replaceGameRefresh(write) {
      await appDb.transaction(async (tx) => {
        await tx.delete(fatigueScores).where(eq(fatigueScores.gameId, write.gameId));
        await tx.insert(fatigueScores).values(
          write.fatigueRows.map((row) => ({ gameId: write.gameId, ...row }))
        );

        if (write.replaceUnresolvedPrediction) {
          await tx
            .delete(predictions)
            .where(
              and(
                eq(predictions.gameId, write.gameId),
                isNull(predictions.actualWinnerId)
              )
            );
          if (write.prediction !== null) {
            await tx.insert(predictions).values({
              gameId: write.gameId,
              ...write.prediction,
              actualWinnerId: null,
            });
          }
        }
      });
    },
  };

  const summary = await refreshDailyGames({
    games: targets.map((game) => ({ ...game, date: String(game.date) })),
    teams: teamRows,
    port,
  });

  for (const failure of summary.failedGames) {
    console.warn(
      `[project-fatigue] preserved game ${failure.gameId} after failure: ${failure.reason}`
    );
  }

  const [counts] = await appDb
    .select({
      scored: sql<number>`count(distinct ${fatigueScores.gameId})::int`,
    })
    .from(fatigueScores)
    .innerJoin(games, eq(games.id, fatigueScores.gameId))
    .where(eq(games.season, season));

  console.log(
    `[project-fatigue] ${season}: games projected=${summary.gamesRefreshed}, ` +
      `fatigue rows=${summary.fatigueRowsWritten}, predictions=${summary.predictionRowsWritten}, ` +
      `failures=${summary.failedGames.length}\n` +
      `[project-fatigue] ${season} now has fatigue on ${counts?.scored ?? 0} game(s).`
  );
  if (summary.failedGames.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
