/**
 * Daily pipeline (invoked from `scripts/daily_update.py` in GitHub Actions):
 * 1. Recompute fatigue_scores for all games on the target date (usually "today" ET).
 * 2. Replace unresolved predictions for scheduled games on that date.
 *
 * Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD
 */

import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, predictions, teams } from "@/lib/db/schema";
import {
  refreshDailyGames,
  type DailyRefreshPort,
} from "@/lib/daily-refresh";
import { fetchRecentGamesForTeam } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const dateArg = process.argv[2];
  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD");
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const teamRows = await appDb.select().from(teams);

  const endDate = format(addDays(parseISO(dateArg), 14), "yyyy-MM-dd");
  const todaysGames = await appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      status: games.status,
    })
    .from(games)
    .where(and(gte(games.date, dateArg), lte(games.date, endDate)))
    .orderBy(asc(games.date), asc(games.id));

  if (todaysGames.length === 0) {
    console.log(`[run-daily] No games in DB for ${dateArg}–${endDate}; skipping fatigue & predictions.`);
    return;
  }

  const port: DailyRefreshPort = {
    loadRecentGames(teamId, gameDate) {
      return fetchRecentGamesForTeam(appDb, teamId, gameDate);
    },
    async replaceGameRefresh(write) {
      await appDb.transaction(async (tx) => {
        await tx
          .delete(fatigueScores)
          .where(eq(fatigueScores.gameId, write.gameId));
        await tx.insert(fatigueScores).values(
          write.fatigueRows.map((row) => ({
            gameId: write.gameId,
            ...row,
          }))
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
    games: todaysGames.map((game) => ({ ...game, date: String(game.date) })),
    teams: teamRows,
    port,
  });

  for (const failure of summary.failedGames) {
    console.warn(
      `[run-daily] preserved game ${failure.gameId} after refresh failure: ${failure.reason}`
    );
  }

  console.log(
    `[run-daily] ${dateArg}–${endDate}: games refreshed=${summary.gamesRefreshed}, fatigue rows written=${summary.fatigueRowsWritten}, predictions written=${summary.predictionRowsWritten}, failures=${summary.failedGames.length}`
  );
  if (summary.failedGames.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
