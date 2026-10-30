import { createDatabase, createDbPool, dbPoolConfig } from "@/lib/db/pool";
import { writeGameStatus } from "@/lib/game-status-write";
/**
 * Nightly score + status sync, from ESPN, matched on **(date, away, home)**.
 *
 * ── Why this replaced the NBA-owned path ────────────────────────────────────────────────────
 *
 * `daily_update.py` used to seed and score games from `cdn.nba.com` and `stats.nba.com`. Both
 * are blocked, and the block is a datacenter block rather than a geo one — re-probed from a US
 * GitHub runner (Des Moines) on 2026-08-18:
 *
 *     stats.nba.com scheduleleaguev2      timeout (25s, 0 bytes)
 *     cdn.nba.com   staticData schedule   403
 *     ESPN scoreboard (node fetch)        200, 8 events
 *
 * The consequence was not a degraded pipeline but a dead one: `fetch_cdn_schedule()` raised
 * `HTTPError: 403` as the FIRST network call of the run, so every in-season night since at
 * least 2026-05-11 failed before updating a score, before reading overtime, and before
 * recomputing any fatigue. The runs that show green are offseason no-ops from the season gate.
 *
 * ── Why it matches on the pairing rather than the id ────────────────────────────────────────
 *
 * `games.external_id` is the only uniqueness guard on the table. 2026-27 is keyed
 * `espn-<eventId>` because stats `002…` ids are not derivable, so an id-keyed writer fed from
 * a different source would INSERT a duplicate of all 1,200 rows rather than update them.
 * Matching on (date, away, home) makes this writer blind to the id, so it maintains `espn-`
 * and `002…` rows identically. `fetch_game_context.ts` has always matched this way.
 *
 * ── What it writes ──────────────────────────────────────────────────────────────────────────
 *
 *   status              scheduled | final (a game in progress is left alone, never written)
 *   home_score / away_score
 *   overtime_periods    from the same payload, so a finalized game carries its overtime in the
 *                       same write. `fetch_game_context.ts` also sets this, but it runs after
 *                       this script and is deliberately non-fatal, so leaning on it alone would
 *                       let a third-party hiccup drop the overtime term out of that night's
 *                       fatigue scoring.
 *
 * It never inserts, never deletes, and never touches `external_id`, `date`, `season` or the
 * team columns. New fixtures (an NBA Cup knockout resolving mid-season) are reported, not
 * written — seeding is `seed_upcoming_season_espn.ts`'s job and has its own invariants.
 *
 * A stored `final` is never walked backwards. Re-running over old dates is therefore safe.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync_scores_espn.ts <from> <to>           # ET date range, inclusive
 *   pnpm exec tsx scripts/sync_scores_espn.ts <from> <to> --dry-run # report only, write nothing
 *
 * Scoreboards are cached in the same directory and under the same `sb-YYYYMMDD.json` name as
 * `fetch_officials.ts` / `fetch_game_context.ts`. This script always re-fetches: a scoreboard
 * cached while a game was in progress has no final score, and refreshing it here means the
 * `fetch_game_context.ts` run that follows reads a fresh file for free.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Pool } from "pg";
import { writeStageSummary } from "./pipeline-stage-summary";

import {
  parseScoreboard,
  reconcileScores,
  type EspnScoreboardGame,
  type ScoreUpdate,
  type StoredGameRow,
} from "@/lib/espn-scoreboard";

const CACHE_DIR = "ml/data/officials";
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 25_000;

/** Run fn over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * Always re-fetches, and writes the response through to the shared cache.
 *
 * The `User-Agent` is deliberate and load-bearing in an unobvious way: ESPN's edge fingerprints
 * the whole header set, not this header alone. `curl -A '<Chrome UA>'` is a browser UA with
 * none of a browser's other headers and gets a 403; Node's `fetch` sends the rest of the set
 * and gets a 200 with the same UA. Both were measured from a GitHub runner on 2026-08-18.
 */
async function fetchScoreboard(dateKey: string): Promise<unknown> {
  const compact = dateKey.replaceAll("-", "");
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  const parsed = JSON.parse(body); // never cache a non-JSON error page
  if (!Array.isArray(parsed?.events)) throw new Error("Invalid scoreboard: events must be an array");
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}/sb-${compact}.json`, body);
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const [from, to] = dates;

  if (!from || !to) {
    console.error("Usage: pnpm exec tsx scripts/sync_scores_espn.ts <from> <to> [--dry-run]");
    process.exit(1);
  }

  const sql = createDbPool({ ...dbPoolConfig(process.env.DATABASE_URL!), max: 4 });
  try {
    await syncScores(sql, from, to, dryRun);
  } finally {
    await sql.end();
  }
}

async function syncScores(sql: Pool, from: string, to: string, dryRun: boolean) {
  const { rows } = await sql.query<StoredGameRow & { date: string }>(`
    select g.id,
           g.external_id          as "externalId",
           g.tip_off_utc          as "tipOffUtc",
           g.date::text            as date,
           ht.abbreviation         as "homeAbbr",
           at.abbreviation         as "awayAbbr",
           g.status,
           g.home_score            as "homeScore",
           g.away_score            as "awayScore",
           g.overtime_periods      as "overtimePeriods"
    from games g
    join teams ht on ht.id = g.home_team_id
    join teams at on at.id = g.away_team_id
    where g.date >= $1 and g.date <= $2
    order by g.date, g.id`, [from, to]);

  if (rows.length === 0) {
    writeStageSummary("scores", { rows_written: 0, stored_games: 0 });
    console.log(`[sync-scores] no games stored in ${from}..${to}; nothing to do.`);
    return;
  }

  const byDate = new Map<string, StoredGameRow[]>();
  for (const r of rows) {
    const { date, ...row } = r;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }
  const dateKeys = [...byDate.keys()].sort();
  console.log(`[sync-scores] ${rows.length} stored games across ${dateKeys.length} dates`);

  const updates: ScoreUpdate[] = [];
  const unmatchedEspn: Array<{ date: string; game: EspnScoreboardGame }> = [];
  let unmatchedStored = 0;
  let refusedDowngrades = 0;
  let inProgress = 0;
  let dateErrors = 0;

  await pool(dateKeys, CONCURRENCY, async (dateKey) => {
    let events: EspnScoreboardGame[];
    try {
      events = parseScoreboard(await fetchScoreboard(dateKey));
    } catch (e) {
      // One bad date must not cost the whole night. The rows keep their stored values and the
      // next run picks them up, because the lookback window is wider than one day.
      dateErrors++;
      console.warn(`[sync-scores] ${dateKey}: ${e instanceof Error ? e.message : e}`);
      return;
    }

    const result = reconcileScores(byDate.get(dateKey)!, events, dateKey);
    updates.push(...result.updates);
    unmatchedStored += result.unmatchedStored.length;
    refusedDowngrades += result.refusedDowngrades.length;
    inProgress += result.inProgress.length;
    for (const game of result.unmatchedEspn) unmatchedEspn.push({ date: dateKey, game });
  });

  const finals = updates.filter((u) => u.status === "final");
  const overtime = updates.filter((u) => (u.overtimePeriods ?? 0) > 0);
  console.log(
    `[sync-scores] ${updates.length} row(s) to write — ${finals.length} final\n` +
      `[sync-scores]   games in progress (left alone): ${inProgress}\n` +
      `[sync-scores]   overtime games: ${overtime.length}\n` +
      `[sync-scores]   stored rows ESPN did not carry: ${unmatchedStored}\n` +
      `[sync-scores]   stored finals ESPN contradicted (refused): ${refusedDowngrades}\n` +
      `[sync-scores]   date fetch errors: ${dateErrors}`
  );

  // Loud rather than silent: this is how a resolved NBA Cup knockout, or a game moved to a new
  // date, announces itself. Seeding is deliberately not done here.
  if (unmatchedEspn.length > 0) {
    console.warn(
      `[sync-scores] ${unmatchedEspn.length} ESPN event(s) have no stored row — ` +
        `re-run scripts/seed_upcoming_season_espn.ts if these are real fixtures:`
    );
    for (const { date, game } of unmatchedEspn.slice(0, 20)) {
      console.warn(`[sync-scores]   ${date} ${game.awayAbbr}@${game.homeAbbr} (espn-${game.eventId})`);
    }
    if (unmatchedEspn.length > 20) {
      console.warn(`[sync-scores]   … and ${unmatchedEspn.length - 20} more`);
    }
  }

  if (dryRun) {
    writeStageSummary("scores", { rows_written: 0, stored_games: rows.length, date_errors: dateErrors, unmatched: unmatchedStored });
    console.log("[sync-scores] --dry-run: no rows written");
    if (dateErrors > 0) process.exitCode = 2;
    return;
  }

  let written = 0;
  let writeTimeRefusedDowngrades = 0;
  let writeFailures = 0;
  const appDb = createDatabase(sql);
  for (const update of updates) {
    // A write failure is still fatal (exit 1), but one locked row must not cost the night's
    // other finals.
    try {
      const result = await writeGameStatus(appDb, update);
      written += Number(result.written);
      if (!result.written) writeTimeRefusedDowngrades++;
    } catch (e) {
      writeFailures++;
      console.error(`[sync-scores] write failed for game ${update.gameId}:`, e);
    }
  }

  writeStageSummary("scores", { rows_written: written, stored_games: rows.length, date_errors: dateErrors, unmatched: unmatchedStored });
  console.log(`[sync-scores] done — ${written} row(s) updated`);
  console.log(`[sync-scores] write-time final downgrades refused: ${writeTimeRefusedDowngrades}`);
  if (writeFailures > 0) {
    console.error(`[sync-scores] ${writeFailures} write(s) failed`);
    process.exitCode = 1;
  } else if (dateErrors > 0) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
