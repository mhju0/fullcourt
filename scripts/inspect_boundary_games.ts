/**
 * The games where Postgres and JavaScript disagree about the neutral threshold.
 *
 * `verify_predictions.ts` computes the rest advantage in SQL, where `numeric` subtraction is
 * exact decimal. The application computes it in JavaScript, where it is binary floating point.
 * A game whose true gap is exactly 0.50 can therefore be a call in one and neutral in the other
 * — 5.26 − 4.76 is 0.5 in Postgres and 0.4999999999999996 in JS.
 *
 * This lists the disputed games so the difference can be confirmed rather than assumed, since
 * the alternative reading — that the backfill left real gaps — would need repairing.
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
    SELECT g.id, g.date::text AS date, hf.score AS home, af.score AS away,
           (af.score - hf.score) AS ra_sql
    FROM games g
    JOIN fatigue_scores hf ON hf.game_id = g.id AND hf.team_id = g.home_team_id
    JOIN fatigue_scores af ON af.game_id = g.id AND af.team_id = g.away_team_id
    LEFT JOIN predictions p ON p.game_id = g.id
    WHERE g.status = 'final' AND g.game_type = 'regular'
      AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
      AND (af.score - hf.score) >= 0.5
      AND p.id IS NULL
    ORDER BY g.id
  `)) as unknown as Array<Record<string, string>>;

  const lines = ["# Games SQL calls and JavaScript declines", ""];
  for (const r of rows) {
    const js = Number(r.away) - Number(r.home);
    lines.push(
      `game ${r.id} (${r.date})  home ${r.home}  away ${r.away}` +
        `  SQL ra=${r.ra_sql}  JS ra=${js}  JS clears 0.5? ${js >= 0.5}`
    );
  }
  lines.push("", `total disputed: ${rows.length}`);
  await writeFile("ml/data/boundary_games.txt", lines.join("\n") + "\n", "utf8");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
