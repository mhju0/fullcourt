/**
 * Targeted recompute for the 2026-08-02 `ALTITUDE_MULTIPLIER` change (1.15 → 1.29).
 *
 * A full `backfill_fatigue.ts --force` is ~4 hours and leaves the site with no fatigue data
 * while it runs. It is not needed here, because **altitude does not cascade**: the only input
 * this constant touches is tonight's `isVisitingAltitude`, and `calculateFatigue` reads prior
 * *games* from the `games` table, never prior *scores* from `fatigue_scores`. So exactly one
 * class of row changes — the side that was visiting altitude — and every other score in the
 * database is already correct.
 *
 * `ALTITUDE_CARRYOVER_MULTIPLIER` was deliberately not changed, so carryover rows are untouched
 * too.
 *
 * The affected games are those where the visitor met thin air:
 *   - the home team carries `altitude_flag` (Denver, Utah), or
 *   - the game was at a neutral venue that sits at altitude (Mexico City).
 *
 * Both fatigue rows for such a game are deleted rather than just the visitor's, so the default
 * (non-`--force`) backfill can find them: it looks for games missing a *home*-side row. The
 * home row is then recomputed to an identical value, which is harmless.
 *
 * Usage:
 *   pnpm exec tsx scripts/recompute_altitude_games.ts            # report only, writes nothing
 *   pnpm exec tsx scripts/recompute_altitude_games.ts --apply    # back up, then delete
 *
 * After `--apply`, run `backfill_fatigue.ts` with no arguments to rebuild the deleted rows.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { ALTITUDE_NEUTRAL_CITIES } from "@/lib/neutral-venues";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

const BACKUP_DIR = path.join(process.cwd(), "ml", "data");

async function main(): Promise<void> {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const cities = ALTITUDE_NEUTRAL_CITIES;
  if (cities.length === 0) throw new Error("no altitude neutral venues resolved");

  // Each city is bound as its own parameter. Passing the array to `= ANY(...)` instead makes
  // postgres.js hand Postgres a JS array it cannot parse as an array literal (22P02).
  const cityList = sql.join(
    cities.map((city) => sql`${city}`),
    sql`, `
  );

  // One predicate, defined once and reused for the count, the backup and the delete, so the
  // rows that get reported cannot be a different set from the rows that get removed.
  const affected = sql`
    SELECT g.id
    FROM games g
    JOIN teams t ON t.id = g.home_team_id
    WHERE t.altitude_flag = true
       OR (g.neutral_site = true AND g.neutral_venue_city IN (${cityList}))
  `;

  const countRows = (await appDb.execute(
    sql`SELECT count(*)::int AS n FROM (${affected}) s`
  )) as unknown as { n: number }[];
  const gameCount = countRows[0]?.n ?? 0;

  const rowCountRows = (await appDb.execute(
    sql`SELECT count(*)::int AS n FROM fatigue_scores WHERE game_id IN (${affected})`
  )) as unknown as { n: number }[];
  const rowCount = rowCountRows[0]?.n ?? 0;

  const totalRows = (await appDb.execute(
    sql`SELECT count(*)::int AS n FROM fatigue_scores`
  )) as unknown as { n: number }[];

  console.log(`[altitude] neutral altitude cities : ${cities.join(", ")}`);
  console.log(`[altitude] affected games          : ${gameCount}`);
  console.log(`[altitude] fatigue rows to replace : ${rowCount}`);
  console.log(`[altitude] fatigue rows in total   : ${totalRows[0]?.n ?? 0}`);

  if (!apply) {
    console.log("\n[altitude] report only. Re-run with --apply to back up and delete.");
    return;
  }

  const backup = (await appDb.execute(
    sql`SELECT * FROM fatigue_scores WHERE game_id IN (${affected})`
  )) as unknown as Record<string, unknown>[];
  await mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, "fatigue_scores_altitude_backup.json");
  await writeFile(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`[altitude] backed up ${backup.length} rows to ${backupPath}`);

  if (backup.length !== rowCount) {
    throw new Error(
      `backup holds ${backup.length} rows but ${rowCount} were counted — refusing to delete`
    );
  }

  const deleted = await appDb.execute(
    sql`DELETE FROM fatigue_scores WHERE game_id IN (${affected})`
  );
  console.log(`[altitude] deleted. ${JSON.stringify(deleted ?? {})}`);
  console.log("\n[altitude] now run: pnpm exec tsx scripts/backfill_fatigue.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
