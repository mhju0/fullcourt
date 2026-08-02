/**
 * Collapses `predictions` to one row per game.
 *
 * The schema tolerates several rows per game and readers take the newest, so duplicates are not
 * a correctness fault — but they are still wrong, and here they came from a specific mistake
 * worth naming: two `backfill_predictions.ts` processes ran at the same time. Each builds its
 * skip-list by reading every existing `game_id` *once, at startup*, so two overlapping runs both
 * decide the same games are missing and both insert them.
 *
 * Every duplicate was produced by the same rule from the same fatigue scores, so the rows are
 * interchangeable and the newest is kept purely because that is what the readers would have
 * picked anyway.
 *
 * Usage:
 *   pnpm exec tsx scripts/dedupe_predictions.ts            # report only
 *   pnpm exec tsx scripts/dedupe_predictions.ts --apply
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";

async function main(): Promise<void> {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");

  const { db } = await import("@/lib/db");
  const appDb = db as PostgresJsDatabase<typeof Schema>;

  const before = (await appDb.execute(sql`
    SELECT count(*)::int AS rows, count(DISTINCT game_id)::int AS games FROM predictions
  `)) as unknown as Record<string, number>[];
  console.log(`[dedupe] rows ${before[0]?.rows}  distinct games ${before[0]?.games}`);

  // Guard against dropping a game entirely: every duplicate group must agree on the team it
  // predicted. If two rows for one game disagree, they did not come from one rule and deleting
  // the older silently picks a winner.
  const disagreeing = (await appDb.execute(sql`
    SELECT count(*)::int AS n FROM (
      SELECT game_id FROM predictions
      GROUP BY game_id
      HAVING count(DISTINCT predicted_advantage_team_id) > 1
    ) s
  `)) as unknown as Record<string, number>[];
  console.log(`[dedupe] games whose duplicates disagree on the pick: ${disagreeing[0]?.n}`);
  if ((disagreeing[0]?.n ?? 0) > 0) {
    throw new Error("duplicates disagree — refusing to collapse them automatically");
  }

  if (!apply) {
    console.log("\n[dedupe] report only. Re-run with --apply.");
    return;
  }

  await appDb.execute(sql`
    DELETE FROM predictions p
    USING predictions keep
    WHERE p.game_id = keep.game_id
      AND p.id < keep.id
  `);

  const after = (await appDb.execute(sql`
    SELECT count(*)::int AS rows, count(DISTINCT game_id)::int AS games FROM predictions
  `)) as unknown as Record<string, number>[];
  console.log(`[dedupe] rows ${after[0]?.rows}  distinct games ${after[0]?.games}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
