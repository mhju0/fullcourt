/**
 * Row-count probe for the altitude recompute. Writes to a file rather than stdout because
 * this environment has masked numeric digits in Bash output before, and every number this
 * prints is one a decision rests on.
 */
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";

async function main(): Promise<void> {
  loadEnvLocal();
  const { db } = await import("@/lib/db");
  const appDb = db as PostgresJsDatabase<typeof Schema>;

  const rows = (await appDb.execute(sql`
    SELECT
      (SELECT count(*)::int FROM fatigue_scores)                              AS fatigue_rows,
      (SELECT count(*)::int FROM games)                                       AS games,
      (SELECT count(*)::int FROM predictions)                                 AS predictions,
      (SELECT count(*)::int FROM (
         SELECT game_id FROM fatigue_scores GROUP BY game_id HAVING count(*) <> 2
       ) s)                                                                   AS games_not_holding_two,
      (SELECT count(*)::int FROM fatigue_scores WHERE altitude_multiplier > 1.2) AS rows_at_new_altitude,
      (SELECT count(*)::int FROM fatigue_scores WHERE altitude_multiplier BETWEEN 1.14 AND 1.16) AS rows_at_old_altitude
  `)) as unknown as Record<string, number>[];

  const report = Object.entries(rows[0] ?? {})
    .map(([k, v]) => `${k.padEnd(24)} ${v}`)
    .join("\n");
  await writeFile("ml/data/row_counts.txt", report + "\n", "utf8");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
