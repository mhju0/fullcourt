/**
 * Re-key one season's `external_id` from `espn-<eventId>` to the canonical stats `002…` id,
 * sourced from hoopR.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────────────────────
 *
 * 2026-27 was seeded from ESPN on schedule-release day because no reachable source carried the
 * canonical ids for a schedule that had not been played (`seed_upcoming_season_espn.ts`). That
 * cost nothing at the time — the nightly score path matches on (date, away, home) and is blind
 * to the key — with one exception:
 *
 *   `scripts/analyze_player_shooting.py` filters `external_id LIKE '002%%'` **and** joins hoopR
 *   box scores on that id. A season keyed `espn-` is invisible to it, so Shooting by Rest would
 *   carry no 2026-27 data at all.
 *
 * hoopR's `nba_stats_*` box scores carry the canonical id and are reachable. Measured
 * 2026-08-18: its 2025-26 regular-season ids match this database's `external_id` set exactly,
 * 1,230 of 1,230, with none on either side. It publishes games that have been **played**, which
 * is why this runs in-season rather than at seeding time.
 *
 * ── How the match is made ───────────────────────────────────────────────────────────────────
 *
 * On `(away tricode, away points, home tricode, home points)`. hoopR's box scores carry no date,
 * so `seed_season_from_hoopr.ts` has to date them through the ESPN scoreboard — this script does
 * not, because the rows it is re-keying already hold their own final scores, put there by the
 * nightly sync. Same key, one less network dependency.
 *
 * A repeated fixture with an identical final score inside one season is vanishingly unlikely,
 * and it is not assumed: the key is checked for collisions on **both** sides and the run aborts
 * rather than guessing which row a duplicate belongs to.
 *
 * **Validated against 2025-26**, the one season where the answer is checkable because it already
 * carries canonical ids: building the key from each of its 1,230 rows and looking it up in hoopR
 * yielded the id that row already holds — **1,230 correct, 0 wrong, 0 unmatched, 0 key
 * collisions**. So the key is unique across a full season and resolves to the right game.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────────────────────
 *
 * `external_id` is the ONLY uniqueness guard on `games`. Rewriting it is the most dangerous
 * write in this repo, so:
 *
 *   - **Dry run by default.** `--apply` is required to write, inverting the convention every
 *     other script here follows.
 *   - Only rows currently keyed `espn-` are ever touched. A row already carrying a `002…` id is
 *     counted as done, which makes the script idempotent.
 *   - A target id already present on a *different* row aborts the whole run. That is the
 *     collision that would violate the unique index, and it is checked before anything is written.
 *   - Only `final` games with both scores are considered, so the run is naturally **incremental**:
 *     run it in January for what has been played, run it again later for the rest. A season with
 *     mixed keys is fine — nothing joins on the key except the shooting pipeline, which wants
 *     exactly the played games this will have converted.
 *   - The write is a single `UPDATE … FROM (values …)`, so it is atomic without an explicit
 *     transaction, each row is additionally guarded on its current id, and the affected-row
 *     count is checked against the plan.
 *
 * Nothing else needs re-pointing: `fatigue_scores` and `predictions` reference `games.id`, the
 * integer primary key, which does not move.
 *
 * Usage:
 *   pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27            # dry run, writes nothing
 *   pnpm exec tsx scripts/rekey_season_from_hoopr.ts 2026-27 --apply
 *
 * Prerequisite: `python scripts/fetch_shooting_data.py` must have cached
 * `ml/data/shooting/team_boxscores_<startYear>.csv` for the season (file year is the season
 * START for the `nba_stats_*` family: 2026 → 2026-27).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

const BOX_DIR = "ml/data/shooting";

/** Only regular-season ids. Playoff/play-in rows are seeded by their own scripts. */
const REGULAR_PREFIX = "002";

type HooprGame = { gameId: string; away: string; awayPts: number; home: string; homePts: number };

/** `(away, awayPts, home, homePts)` — the identity both sides are matched on. */
function matchKey(away: string, awayPts: number, home: string, homePts: number): string {
  return `${away}|${awayPts}|${home}|${homePts}`;
}

function loadHoopr(startYear: number): HooprGame[] {
  const path = `${BOX_DIR}/team_boxscores_${startYear}.csv`;
  if (!existsSync(path)) {
    throw new Error(
      `No hoopR box scores at ${path}. Run: python scripts/fetch_shooting_data.py --only teams`
    );
  }
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const head = lines[0].split(",");
  const col = (n: string) => head.indexOf(n);
  const [iSide, iTri, iPts, iGid] = [col("side"), col("team_tricode"), col("points"), col("game_id")];
  if ([iSide, iTri, iPts, iGid].some((i) => i < 0)) {
    throw new Error(`${path} is missing one of: side, team_tricode, points, game_id`);
  }

  const sides = new Map<string, { home?: [string, number]; away?: [string, number] }>();
  for (let i = 1; i < lines.length; i++) {
    // team_boxscores has no quoted commas in the columns read here, so a plain split is safe.
    const c = lines[i].split(",");
    const gid = c[iGid];
    if (!gid || !gid.startsWith(REGULAR_PREFIX)) continue;
    const entry = sides.get(gid) ?? {};
    entry[c[iSide] as "home" | "away"] = [c[iTri], Number(c[iPts] || 0)];
    sides.set(gid, entry);
  }

  const out: HooprGame[] = [];
  for (const [gameId, s] of sides) {
    if (!s.home || !s.away) continue;
    out.push({ gameId, away: s.away[0], awayPts: s.away[1], home: s.home[0], homePts: s.home[1] });
  }
  return out;
}

/** Index by match key, refusing rather than guessing when one key covers two games. */
function indexByKey<T>(items: T[], key: (t: T) => string, label: string): Map<string, T> {
  const byKey = new Map<string, T>();
  const collisions: string[] = [];
  for (const item of items) {
    const k = key(item);
    if (byKey.has(k)) collisions.push(k);
    else byKey.set(k, item);
  }
  if (collisions.length > 0) {
    throw new Error(
      `${label}: ${collisions.length} duplicate match key(s) — ${collisions.slice(0, 5).join(", ")}. ` +
        `Two games share a fixture and an exact final score, so no row can be re-keyed safely.`
    );
  }
  return byKey;
}

type DbRow = {
  id: number;
  externalId: string;
  date: string;
  away: string;
  awayScore: number;
  home: string;
  homeScore: number;
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const season = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  if (!season) {
    console.error("Usage: pnpm exec tsx scripts/rekey_season_from_hoopr.ts <season> [--apply]");
    process.exit(1);
  }
  const startYear = Number(season.slice(0, 4));

  const hoopr = loadHoopr(startYear);
  const hooprByKey = indexByKey(
    hoopr,
    (g) => matchKey(g.away, g.awayPts, g.home, g.homePts),
    "hoopR"
  );
  console.log(`[rekey] hoopR ${season}: ${hoopr.length} regular-season games`);

  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });

  // Only played games can be matched — the key includes both final scores.
  const rows = await sql<DbRow[]>`
    select g.id,
           g.external_id      as "externalId",
           g.date::text       as date,
           at.abbreviation    as away,
           g.away_score       as "awayScore",
           ht.abbreviation    as home,
           g.home_score       as "homeScore"
    from games g
    join teams ht on ht.id = g.home_team_id
    join teams at on at.id = g.away_team_id
    where g.season = ${season}
      and g.game_type = 'regular'
      and g.status = 'final'
      and g.home_score is not null
      and g.away_score is not null
    order by g.date, g.id`;

  const alreadyKeyed = rows.filter((r) => r.externalId.startsWith(REGULAR_PREFIX));
  const candidates = rows.filter((r) => r.externalId.startsWith("espn-"));
  const otherKeys = rows.filter(
    (r) => !r.externalId.startsWith(REGULAR_PREFIX) && !r.externalId.startsWith("espn-")
  );

  console.log(
    `[rekey] db ${season}: ${rows.length} final regular game(s) — ` +
      `${alreadyKeyed.length} already 002…, ${candidates.length} espn-, ${otherKeys.length} other`
  );
  if (otherKeys.length > 0) {
    // Left alone rather than guessed at: `bref-` rows exist from the 2026-07-12 audit and are
    // not this script's business.
    console.warn(
      `[rekey] ${otherKeys.length} row(s) carry neither key shape and will not be touched, ` +
        `e.g. ${otherKeys.slice(0, 3).map((r) => r.externalId).join(", ")}`
    );
  }

  if (candidates.length === 0) {
    console.log(`[rekey] nothing to do — no espn- keyed final games in ${season}.`);
    await sql.end();
    return;
  }

  const dbByKey = indexByKey(
    candidates,
    (r) => matchKey(r.away, r.awayScore, r.home, r.homeScore),
    "database"
  );

  const plan: Array<{ id: number; from: string; to: string; date: string; label: string }> = [];
  const unmatched: DbRow[] = [];
  for (const [key, row] of dbByKey) {
    const g = hooprByKey.get(key);
    if (!g) {
      unmatched.push(row);
      continue;
    }
    plan.push({
      id: row.id,
      from: row.externalId,
      to: g.gameId,
      date: row.date,
      label: `${row.away} ${row.awayScore} @ ${row.home} ${row.homeScore}`,
    });
  }

  console.log(`[rekey] matched ${plan.length} / ${candidates.length} espn- row(s)`);
  if (unmatched.length > 0) {
    // Expected while a season is in progress: hoopR publishes on its own cadence, so the most
    // recent games may not be in the cached file yet. Re-run later rather than forcing it.
    console.warn(
      `[rekey] ${unmatched.length} row(s) had no hoopR match — refresh the cache and re-run:`
    );
    for (const r of unmatched.slice(0, 10)) {
      console.warn(`[rekey]   ${r.date} ${r.away} ${r.awayScore} @ ${r.home} ${r.homeScore}`);
    }
    if (unmatched.length > 10) console.warn(`[rekey]   … and ${unmatched.length - 10} more`);
  }

  if (plan.length === 0) {
    console.log("[rekey] no row can be re-keyed yet.");
    await sql.end();
    return;
  }

  // ── The collision gate ────────────────────────────────────────────────────────────────────
  // `external_id` is uniquely indexed, so a target already present on another row would not
  // merely be wrong — it would abort the transaction halfway. Checked up front, against the
  // whole table rather than this season, because ids are globally unique.
  const targets = plan.map((p) => p.to);
  const taken = await sql<{ external_id: string; id: number }[]>`
    select external_id, id from games where external_id in ${sql(targets)}`;
  const planById = new Map(plan.map((p) => [p.id, p]));
  const conflicts = taken.filter((t) => planById.get(t.id)?.to !== t.external_id);
  if (conflicts.length > 0) {
    console.error(
      `[rekey] ABORTED: ${conflicts.length} target id(s) already belong to a different row — ` +
        conflicts.slice(0, 5).map((c) => `${c.external_id} (game ${c.id})`).join(", ")
    );
    await sql.end();
    process.exit(1);
  }

  console.log(`[rekey] ${plan.length} row(s) ready to re-key. Sample:`);
  for (const p of plan.slice(0, 5)) {
    console.log(`[rekey]   ${p.date} ${p.label}: ${p.from} → ${p.to}`);
  }

  if (!apply) {
    console.log("[rekey] dry run — nothing written. Re-run with --apply to commit.");
    await sql.end();
    return;
  }

  // One statement, so it is atomic without an explicit transaction — a half-re-keyed season is
  // a worse state than either end of the change. Same `UPDATE … FROM (values …)` shape as
  // `sync_scores_espn.ts`.
  //
  // The `and g.external_id = v.old` clause is a second lock on top of the id: it makes the write
  // a no-op rather than a surprise if anything moved between the plan and the commit, and it is
  // what the row-count check below detects.
  const res = await sql`
    update games g set external_id = v.new_id::varchar
    from (values ${sql(plan.map((p) => [p.id, p.from, p.to] as const))})
      as v(id, old_id, new_id)
    where g.id = v.id::int and g.external_id = v.old_id::varchar`;
  const updated = res.count ?? 0;

  if (updated !== plan.length) {
    console.error(`[rekey] WARNING: planned ${plan.length} but updated ${updated}.`);
    process.exitCode = 1;
  }
  console.log(`[rekey] done — ${updated} row(s) re-keyed in ${season}.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
