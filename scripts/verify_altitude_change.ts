/**
 * Did the altitude recompute actually change the scores it was supposed to?
 *
 * Compares the pre-change backup against the live table for the same (game_id, team_id) pairs.
 * Written because the historical backtest reported byte-identical figures afterwards, which is
 * either a real finding about how little those games mattered or a sign the recompute did
 * nothing — and guessing between those two is exactly what this repo's evidence rule forbids.
 */
import { readFile, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";

async function main(): Promise<void> {
  loadEnvLocal();
  const { db } = await import("@/lib/db");
  const appDb = db as PostgresJsDatabase<typeof Schema>;

  const backup = JSON.parse(
    await readFile("ml/data/fatigue_scores_altitude_backup.json", "utf8")
  ) as Array<Record<string, string | number>>;

  const before = new Map<string, { score: number; alt: number }>();
  for (const r of backup) {
    before.set(`${r.game_id}:${r.team_id}`, {
      score: Number(r.score),
      alt: Number(r.altitude_multiplier),
    });
  }

  const current = (await appDb.execute(sql`
    SELECT f.game_id, f.team_id, f.score, f.altitude_multiplier, g.game_type, g.status
    FROM fatigue_scores f
    JOIN games g ON g.id = f.game_id
    WHERE f.game_id IN (
      SELECT g2.id FROM games g2
      JOIN teams t ON t.id = g2.home_team_id
      WHERE t.altitude_flag = true
    )
  `)) as unknown as Array<Record<string, string | number>>;

  let compared = 0;
  let changed = 0;
  let unchanged = 0;
  let altRaised = 0;
  let biggestDelta = 0;
  const samples: string[] = [];

  for (const row of current) {
    const key = `${row.game_id}:${row.team_id}`;
    const prev = before.get(key);
    if (!prev) continue;
    compared++;
    const nowScore = Number(row.score);
    const nowAlt = Number(row.altitude_multiplier);
    if (nowAlt > 1.2) altRaised++;
    const delta = nowScore - prev.score;
    if (Math.abs(delta) > 1e-9) {
      changed++;
      if (Math.abs(delta) > Math.abs(biggestDelta)) biggestDelta = delta;
      if (samples.length < 8) {
        samples.push(
          `  game ${row.game_id} team ${row.team_id}  ${prev.score.toFixed(2)} → ${nowScore.toFixed(2)}` +
            `  (alt ${prev.alt} → ${nowAlt}, ${row.game_type}/${row.status})`
        );
      }
    } else {
      unchanged++;
    }
  }

  const report = [
    "# Did the altitude recompute change anything?",
    "",
    `rows compared against backup   ${compared}`,
    `rows whose score CHANGED       ${changed}`,
    `rows unchanged                 ${unchanged}`,
    `rows now at the 1.29 multiplier ${altRaised}`,
    `largest single score change    ${biggestDelta.toFixed(3)}`,
    "",
    "Samples:",
    ...samples,
    "",
  ].join("\n");

  await writeFile("ml/data/altitude_change_verify.txt", report, "utf8");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
