import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "./db/schema";
import { fatigueScores, predictions } from "./db/schema";
import type { DailyRefreshGame, DailyRefreshPort } from "./daily-refresh";
import { fetchRecentGamesForTeam } from "./fatigue-recent-games";

type AppDb = PostgresJsDatabase<typeof Schema>;

/**
 * The database side of `refreshDailyGames`, shared by the nightly script and the score route so
 * the two cannot score an upcoming game against different prior games.
 */
export function createDailyRefreshPort(appDb: AppDb): DailyRefreshPort {
  return {
    // Prior games come from the schedule, played or not. Counting only finals dropped last
    // night's game (still in progress when the nightly job runs) and every game between today
    // and the row's own date, so a back-to-back read as rested. A final prior game keeps its
    // real overtime and margin; an unplayed one contributes neither.
    loadRecentGames(teamId, gameDate) {
      return fetchRecentGamesForTeam(appDb, teamId, gameDate, "scheduled");
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
}

/**
 * Which upcoming games to rescore once a night's finals are stored.
 *
 * A game-day fatigue row is written the evening before, while the previous night's games are
 * still being played, so it holds no overtime penalty and no blowout discount from them. Each
 * team that has just gone final gets its next game rescored, and only that one: overtime
 * reaches no further, and the nightly job rewrites the rest of the fortnight anyway.
 *
 * A game that has tipped off is left alone, so a row never changes under a game in progress.
 */
export function gamesToRescoreAfterFinals<T extends DailyRefreshGame>(input: {
  finalizedTeamIds: ReadonlySet<number>;
  upcoming: readonly T[];
  now: Date;
}): T[] {
  const ordered = input.upcoming
    .filter(
      (game) =>
        game.status === "scheduled" &&
        (game.tipOffUtc == null || game.tipOffUtc.getTime() > input.now.getTime())
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const served = new Set<number>();
  const picked: T[] = [];
  for (const game of ordered) {
    const sides = [game.homeTeamId, game.awayTeamId].filter(
      (teamId) => input.finalizedTeamIds.has(teamId) && !served.has(teamId)
    );
    if (sides.length === 0) continue;
    for (const teamId of sides) served.add(teamId);
    picked.push(game);
  }
  return picked;
}
