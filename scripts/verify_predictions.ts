/**
 * Does `predictions` hold exactly the rows the rule says it should?
 *
 * `backfill_predictions.ts` decides what to skip from the set of game ids already present, so a
 * run that dies partway and is resumed can in principle skip a game it never actually wrote.
 * This checks the end state against the rule directly rather than trusting the run's own
 * counters: every called game should hold exactly one prediction, every declined or neutral
 * game none, and no prediction should ever name the away team.
 */
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence";
import { ABNORMAL_STRETCHES } from "@/lib/season-regime";

async function main(): Promise<void> {
  loadEnvLocal();
  const { db } = await import("@/lib/db");
  const appDb = db as PostgresJsDatabase<typeof Schema>;

  // The regime filter, from the single list that defines it, so this cannot drift from the
  // predicate every reader uses.
  const abnormal = ABNORMAL_STRETCHES.map(
    (s) => sql`(g.season = ${s.season} AND g.date BETWEEN ${s.from} AND ${s.to})`
  );
  const normallyPlayed = abnormal.length
    ? sql`NOT (${sql.join(abnormal, sql` OR `)})`
    : sql`true`;

  const rows = (await appDb.execute(sql`
    WITH scored AS (
      SELECT
        g.id,
        (af.score - hf.score) AS ra,
        g.home_team_id,
        g.away_team_id
      FROM games g
      JOIN fatigue_scores hf ON hf.game_id = g.id AND hf.team_id = g.home_team_id
      JOIN fatigue_scores af ON af.game_id = g.id AND af.team_id = g.away_team_id
      WHERE g.status = 'final'
        AND g.game_type = 'regular'
        AND g.home_score IS NOT NULL
        AND g.away_score IS NOT NULL
        AND ${normallyPlayed}
    )
    SELECT
      (SELECT count(*)::int FROM scored)                                             AS in_scope,
      (SELECT count(*)::int FROM scored WHERE ra >= ${NEUTRAL_REST_ADVANTAGE_THRESHOLD}) AS should_be_called,
      (SELECT count(*)::int FROM predictions)                                        AS prediction_rows,
      (SELECT count(DISTINCT game_id)::int FROM predictions)                         AS distinct_games,
      -- Split because Postgres and JavaScript disagree at the threshold itself. Numeric
      -- subtraction is exact decimal, so 4.27 - 3.77 is 0.50 here; in the application it is
      -- 0.4999999999999996 and the game is neutral. Those are correct declines, not gaps, and
      -- the site-wide consequence is documented. Anything strictly above the threshold that is
      -- still missing is a real gap.
      (SELECT count(*)::int
         FROM scored s
         LEFT JOIN predictions p ON p.game_id = s.id
        WHERE s.ra > ${NEUTRAL_REST_ADVANTAGE_THRESHOLD} AND p.id IS NULL)           AS called_but_missing,
      (SELECT count(*)::int
         FROM scored s
         LEFT JOIN predictions p ON p.game_id = s.id
        WHERE s.ra = ${NEUTRAL_REST_ADVANTAGE_THRESHOLD} AND p.id IS NULL)           AS declined_at_float_boundary,
      (SELECT count(*)::int
         FROM scored s
         JOIN predictions p ON p.game_id = s.id
        WHERE s.ra < ${NEUTRAL_REST_ADVANTAGE_THRESHOLD})                            AS predicted_but_should_not_be,
      (SELECT count(*)::int
         FROM predictions p
         JOIN games g ON g.id = p.game_id
        WHERE p.predicted_advantage_team_id = g.away_team_id)                        AS away_team_picks,
      (SELECT count(*)::int FROM predictions WHERE actual_winner_id IS NULL)          AS ungraded
  `)) as unknown as Record<string, number>[];

  const r = rows[0] ?? {};
  const lines = Object.entries(r).map(([k, v]) => `${k.padEnd(30)} ${v}`);
  const ok =
    r.called_but_missing === 0 &&
    r.predicted_but_should_not_be === 0 &&
    r.away_team_picks === 0 &&
    r.prediction_rows === r.distinct_games;
  lines.push("", ok ? "VERDICT: consistent with the rule" : "VERDICT: MISMATCH — see above");

  await writeFile("ml/data/predictions_verify.txt", lines.join("\n") + "\n", "utf8");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
