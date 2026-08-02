/**
 * Backs up and clears `predictions` so `backfill_predictions.ts` can rebuild them.
 *
 * Needed after any change to the fatigue model or to the prediction rule, because
 * `backfill_predictions.ts` has no `--force`: it skips games that already hold a prediction, so
 * a plain rerun leaves every stale row in place and silently writes nothing.
 *
 * Both applied on 2026-08-02 — `ALTITUDE_MULTIPLIER` 1.15 → 1.29 changed the differential on
 * games at altitude, and `isCalledSide` withdrew every pick that backed a rested visitor.
 *
 * Usage:
 *   pnpm exec tsx scripts/reset_predictions.ts            # report only, writes nothing
 *   pnpm exec tsx scripts/reset_predictions.ts --apply    # back up, then delete
 *
 * After `--apply`, run `backfill_predictions.ts` to rebuild.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

const BACKUP_PATH = path.join(process.cwd(), "ml", "data", "predictions_backup.json");

async function main(): Promise<void> {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const counts = (await appDb.execute(sql`
    SELECT
      count(*)::int                                            AS total,
      count(*) FILTER (WHERE actual_winner_id IS NOT NULL)::int AS graded,
      count(*) FILTER (WHERE actual_winner_id IS NULL)::int     AS open
    FROM predictions
  `)) as unknown as Record<string, number>[];

  console.log(`[predictions] total  : ${counts[0]?.total ?? 0}`);
  console.log(`[predictions] graded : ${counts[0]?.graded ?? 0}`);
  console.log(`[predictions] open   : ${counts[0]?.open ?? 0}`);

  if (!apply) {
    console.log("\n[predictions] report only. Re-run with --apply to back up and delete.");
    return;
  }

  const rows = (await appDb.execute(
    sql`SELECT * FROM predictions`
  )) as unknown as Record<string, unknown>[];
  await mkdir(path.dirname(BACKUP_PATH), { recursive: true });
  await writeFile(BACKUP_PATH, JSON.stringify(rows, null, 2), "utf8");
  console.log(`[predictions] backed up ${rows.length} rows to ${BACKUP_PATH}`);

  if (rows.length !== (counts[0]?.total ?? -1)) {
    throw new Error(
      `backup holds ${rows.length} rows but ${counts[0]?.total} were counted — refusing to delete`
    );
  }

  await appDb.execute(sql`DELETE FROM predictions`);
  console.log("[predictions] deleted.");
  console.log("\n[predictions] now run: pnpm exec tsx scripts/backfill_predictions.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
