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
 *   status              scheduled | live | final
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
import postgres from "postgres";

import {
  parseScoreboard,
  reconcileScores,
  type EspnScoreboardGame,
  type ScoreUpdate,
  type StoredGameRow,
} from "@/lib/espn-scoreboard";

const CACHE_DIR = "ml/data/officials";
const CONCURRENCY = 6;

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
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  const parsed = JSON.parse(body); // never cache a non-JSON error page
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

  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });

  // ::text is load-bearing: postgres.js hydrates date columns as JS Date objects, so
  // String(row.date) would yield "Sun Dec 21 2014 09:00:00 GMT+0900", not "2014-12-21".
  const rows = await sql<
    (StoredGameRow & { date: string })[]
  >`
    select g.id,
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
    where g.date >= ${from} and g.date <= ${to}
    order by g.date, g.id`;

  if (rows.length === 0) {
    console.log(`[sync-scores] no games stored in ${from}..${to}; nothing to do.`);
    await sql.end();
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

    const result = reconcileScores(byDate.get(dateKey)!, events);
    updates.push(...result.updates);
    unmatchedStored += result.unmatchedStored.length;
    refusedDowngrades += result.refusedDowngrades.length;
    for (const game of result.unmatchedEspn) unmatchedEspn.push({ date: dateKey, game });
  });

  const finals = updates.filter((u) => u.status === "final");
  const overtime = updates.filter((u) => (u.overtimePeriods ?? 0) > 0);
  console.log(
    `[sync-scores] ${updates.length} row(s) to write — ${finals.length} final, ` +
      `${updates.filter((u) => u.status === "live").length} live\n` +
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
    console.log("[sync-scores] --dry-run: no rows written");
    await sql.end();
    return;
  }

  // Chunked UPDATE ... FROM (values …). overtime_periods coalesces so a live or unfinished
  // game leaves the stored value alone rather than zeroing it.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const res = await sql`
      update games g set
        status = v.status::varchar,
        home_score = v.home_score::int,
        away_score = v.away_score::int,
        overtime_periods = coalesce(v.ot::int, g.overtime_periods)
      from (values ${sql(
        chunk.map(
          (u) => [u.gameId, u.status, u.homeScore, u.awayScore, u.overtimePeriods] as const
        )
      )}) as v(id, status, home_score, away_score, ot)
      where g.id = v.id::int`;
    written += res.count ?? chunk.length;
  }

  console.log(`[sync-scores] done — ${written} row(s) updated`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
