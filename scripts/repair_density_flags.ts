/**
 * Repair `fatigue_scores.is_three_in_four` / `is_four_in_six` in place.
 *
 * Why this exists rather than `backfill_fatigue.ts --force`: that path DELETEs the whole
 * `fatigue_scores` table before rebuilding ~92k rows over 30–90 minutes. Four live pages read
 * that table, so on production it is an hour-long outage — to correct two columns that no
 * query, route or component reads. This script deletes nothing and only ever writes those two
 * booleans, so the site keeps serving throughout.
 *
 * The flags previously asked whether a dense stretch occurred anywhere in the 30-day lookback
 * rather than whether *this* game is short rest, so a fully rested team stayed flagged for
 * weeks. Fixed in `src/lib/fatigue.ts`; stored rows keep the old values until this runs.
 *
 * Usage:
 *   pnpm exec tsx scripts/repair_density_flags.ts              # dry run — reports, writes nothing
 *   pnpm exec tsx scripts/repair_density_flags.ts --apply      # write the corrections
 *   pnpm exec tsx scripts/repair_density_flags.ts --apply --season 2025-26
 *
 * Idempotent: re-running after a successful pass reports 0 rows to change. Safe to interrupt —
 * one statement per season, so an interrupted run leaves later seasons untouched and re-running
 * finishes the job.
 */

import postgres from "postgres";
import { loadEnvLocal } from "@/lib/load-env-local";

loadEnvLocal();

/** Mirrors `computeIsThreeInFour` / `computeIsFourInSix` in src/lib/fatigue.ts. */
function closesWindow(dates: readonly string[], index: number, needed: number, spanDays: number) {
  const end = Date.parse(dates[index]);
  let count = 0;
  for (let i = index; i >= 0; i--) {
    const gap = Math.round((end - Date.parse(dates[i])) / 86_400_000);
    if (gap >= spanDays) break;
    count++;
  }
  return count >= needed;
}

interface Row {
  id: number;
  team_id: number;
  date: string;
  is_three_in_four: boolean;
  is_four_in_six: boolean;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const seasonIdx = process.argv.indexOf("--season");
  const onlySeason = seasonIdx !== -1 ? process.argv[seasonIdx + 1] : null;

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 10 });

  try {
    const seasons = onlySeason
      ? [{ season: onlySeason }]
      : await sql<{ season: string }[]>`
          SELECT DISTINCT season FROM games ORDER BY season`;

    let totalChecked = 0;
    let totalWrong = 0;

    for (const { season } of seasons) {
      // The fatigue model's lookback never crosses a season, so each season is self-contained.
      const rows = await sql<Row[]>`
        SELECT f.id, f.team_id, g.date::text AS date, f.is_three_in_four, f.is_four_in_six
        FROM fatigue_scores f
        JOIN games g ON g.id = f.game_id
        WHERE g.season = ${season}
        ORDER BY f.team_id, g.date`;

      const byTeam = new Map<number, Row[]>();
      for (const r of rows) {
        const list = byTeam.get(r.team_id);
        if (list) list.push(r);
        else byTeam.set(r.team_id, [r]);
      }

      const fixes: { id: number; threeInFour: boolean; fourInSix: boolean }[] = [];
      for (const teamRows of byTeam.values()) {
        const dates = teamRows.map((r) => r.date);
        teamRows.forEach((r, i) => {
          const threeInFour = closesWindow(dates, i, 3, 4);
          const fourInSix = closesWindow(dates, i, 4, 6);
          if (threeInFour !== r.is_three_in_four || fourInSix !== r.is_four_in_six) {
            fixes.push({ id: r.id, threeInFour, fourInSix });
          }
        });
      }

      totalChecked += rows.length;
      totalWrong += fixes.length;
      const pct = rows.length ? ((fixes.length / rows.length) * 100).toFixed(1) : "0.0";
      console.log(`${season}: ${String(fixes.length).padStart(5)} of ${String(rows.length).padStart(5)} rows wrong (${pct}%)`);

      if (apply && fixes.length > 0) {
        // The corrections travel as ONE json parameter. A multi-row VALUES list hits Postgres'
        // 1664-entry target-list cap, and parallel arrays fight postgres.js's per-element type
        // inference; json sidesteps both, at any row count. One statement per season, so a
        // season is all-or-nothing.
        const payload = fixes.map((c) => ({
          id: c.id,
          three_in_four: c.threeInFour,
          four_in_six: c.fourInSix,
        }));
        // sql.json() — a bare JSON string leaves postgres.js unable to infer the parameter type.
        await sql`
          UPDATE fatigue_scores AS f
          SET is_three_in_four = v.three_in_four, is_four_in_six = v.four_in_six
          FROM jsonb_to_recordset(${sql.json(payload)})
            AS v(id int, three_in_four boolean, four_in_six boolean)
          WHERE f.id = v.id`;
      }
    }

    console.log(
      `\n${apply ? "APPLIED" : "DRY RUN"} — ${totalWrong} of ${totalChecked} rows ` +
        `${apply ? "corrected" : "would change"}.`
    );
    if (!apply && totalWrong > 0) console.log("Re-run with --apply to write these corrections.");
  } finally {
    await sql.end();
  }
}

main();
