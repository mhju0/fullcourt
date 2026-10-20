/**
 * Prediction backfill script — retroactively generates predictions for all
 * completed regular-season games that have fatigue scores.
 *
 * Prediction rule: the more rested team is predicted to win, but only when that team is
 * also the home side. A rested visitor is not picked — that row (`RESTED_ON_ROAD` in
 * src/lib/rest-split-facts.ts) is measured against its road baseline. Current generated
 * facts and ADR 0006 hold the evidence; `isCalledSide` owns the selection rule.
 *
 * Games with |differential| < 0.5 are skipped as neutral, as before.
 *
 * Existing entries are skipped. This legacy reconstruction tool is not a repair path
 * for preserved production history: missing calls under today's recomputed scores are
 * diagnostics, not permission to add or replace past picks. Never delete predictions
 * to make this backfill run. Use a reviewed correction manifest for eligible future
 * forecasts; historical reconstruction requires a separate explicit owner decision.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill_predictions.ts
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, predictions } from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";
import { classifyRestAdvantage, isCalledSide } from "@/lib/rest-advantage-evidence";
import { isNormallyPlayed } from "@/lib/season-regime";

type AppDb = NodePgDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  // ── Find game IDs that already have predictions ──────────────────
  const existingRows = await appDb
    .select({ gameId: predictions.gameId })
    .from(predictions);
  const existingGameIds = new Set(existingRows.map((r) => r.gameId));
  console.log(`Found ${existingGameIds.size} games with existing predictions (will skip).`);

  // ── Query all final regular-season games with both fatigue scores ──
  const homeFatigue = alias(fatigueScores, "home_fatigue");
  const awayFatigue = alias(fatigueScores, "away_fatigue");

  const allGames = await appDb
    .select({
      id: games.id,
      date: games.date,
      season: games.season,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
      neutralSite: games.neutralSite,
    })
    .from(games)
    .innerJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .innerJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(
      and(
        eq(games.status, "final"),
        eq(games.gameType, "regular"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore)
      )
    )
    .orderBy(games.date);

  // Regime filter, matching every reader of `predictions`. Bubble games carry fatigue rows
  // because the backfill scores whatever is in `games`, but a prediction for one would be a
  // row no surface reads and no backtest counts.
  const inScope = allGames.filter((g) => isNormallyPlayed(g.season, g.date));
  const toProcess = inScope.filter((g) => !existingGameIds.has(g.id));
  if (inScope.length !== allGames.length) {
    console.log(`Excluded ${allGames.length - inScope.length} games inside an abnormal stretch.`);
  }
  console.log(`\nFound ${inScope.length} in-scope regular-season games with fatigue scores.`);
  console.log(`Processing ${toProcess.length} new games...\n`);

  if (toProcess.length === 0) {
    console.log("Nothing to do — all games already have predictions.");
    return;
  }

  let inserted = 0;
  let skippedNoCall = 0;
  let errors = 0;
  let correctPredictions = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const game = toProcess[i];

    try {
      const homeFat = parseFloat(game.homeFatigueScore);
      const awayFat = parseFloat(game.awayFatigueScore);

      const restAdvantage = classifyRestAdvantage(homeFat, awayFat);
      // Neutral is "no edge"; not-called is "an edge pointing at the visitor", where rest has
      // never been enough to outweigh home court. Both are skipped, and `isCalledSide` is the
      // single place that knows the difference.
      if (!isCalledSide(restAdvantage.advantageTeam, game.neutralSite)) {
        skippedNoCall++;
        continue;
      }

      // Predicted winner = the home team, which by the line above is also the rested one.
      const predictedTeamId = game.homeTeamId;

      // Actual winner
      const homeScore = game.homeScore as number;
      const awayScore = game.awayScore as number;
      const actualWinnerId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;

      if (predictedTeamId === actualWinnerId) correctPredictions++;

      await appDb.insert(predictions).values({
        gameId: game.id,
        predictedAdvantageTeamId: predictedTeamId,
        restAdvantageDifferential: String(
          Math.round(restAdvantage.differential * 100) / 100
        ),
        actualWinnerId,
        createdAt: new Date(game.date),
      });

      inserted++;
    } catch (err) {
      console.error(`  [ERROR] game ${game.id} (${game.date}):`, err);
      errors++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(
        `  ${i + 1}/${toProcess.length} games processed (${inserted} inserted, ${skippedNoCall} no-call, ${errors} errors)`
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  const total = inserted;
  const accuracy =
    total > 0 ? Math.round((correctPredictions / total) * 1000) / 10 : 0;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Backfill complete.`);
  console.log(`  Total predictions inserted : ${inserted.toLocaleString()}`);
  console.log(`  Skipped (no call — neutral, or the edge favours the visitor): ${skippedNoCall.toLocaleString()}`);
  console.log(`  Errors                     : ${errors}`);
  console.log(`  Correct predictions        : ${correctPredictions.toLocaleString()}`);
  console.log(`  Overall accuracy           : ${accuracy}%`);
  console.log(`${"─".repeat(50)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
