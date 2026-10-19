/**
 * Daily pipeline (invoked from `scripts/daily_update.py` in GitHub Actions):
 * 1. Recompute prospective fatigue_scores for scheduled games with a known future tip from
 *    the requested date through the next 14 days.
 * 2. Replace unresolved predictions in that window. Played/unknown-tip rows are skipped;
 *    historical repair remains the separate manual backfill.
 *
 * Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD
 */

import { reportDailyFreshness } from "./daily-freshness";
import { writeStageSummary } from "./pipeline-stage-summary";
import { and, asc, gte, lte } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as Schema from "@/lib/db/schema";
import { games } from "@/lib/db/schema";
import { refreshProspectiveGames } from "@/lib/daily-refresh";
import { createDailyRefreshPort } from "@/lib/daily-refresh-port";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = NodePgDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const dateArg = process.argv[2];
  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD");
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const endDate = format(addDays(parseISO(dateArg), 14), "yyyy-MM-dd");
  const todaysGames = await appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      status: games.status,
      tipOffUtc: games.tipOffUtc,
      neutralSite: games.neutralSite,
      neutralVenueCity: games.neutralVenueCity,
    })
    .from(games)
    .where(and(gte(games.date, dateArg), lte(games.date, endDate)))
    .orderBy(asc(games.date), asc(games.id));

  if (todaysGames.length === 0) {
    writeStageSummary("fatigue", { rows_written: 0, games_refreshed: 0 });
    writeStageSummary("predictions", { rows_written: 0 });
    await reportDailyFreshness(appDb, dateArg, endDate);
    console.log(`[run-daily] No games in DB for ${dateArg}–${endDate}; skipping fatigue & predictions.`);
    return;
  }

  const port = createDailyRefreshPort(appDb);

  const summary = await refreshProspectiveGames({
    gameIds: todaysGames.map(game => game.id),
    port,
  });

  writeStageSummary("fatigue", { rows_written: summary.fatigueRowsWritten,
    games_refreshed: summary.gamesRefreshed, failed_games: summary.failedGames.length,
    skipped_games: summary.skippedGames.length, deferred_games: summary.deferredGames.length });
  writeStageSummary("predictions", { rows_written: summary.predictionRowsWritten,
    failed_games: summary.failedGames.length, deferred_games: summary.deferredGames.length });
  for (const failure of summary.failedGames) {
    console.warn(
      `[run-daily] preserved game ${failure.gameId} after refresh failure: ${failure.reason}`
    );
  }

  console.log(
    `[run-daily] ${dateArg}–${endDate}: games refreshed=${summary.gamesRefreshed}, fatigue rows written=${summary.fatigueRowsWritten}, predictions written=${summary.predictionRowsWritten}, failures=${summary.failedGames.length}, skipped=${summary.skippedGames.length}, deferred=${summary.deferredGames.length}`
  );
  await reportDailyFreshness(appDb, dateArg, endDate);
  if (summary.failedGames.length > 0 || summary.deferredGames.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
