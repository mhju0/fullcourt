/**
 * Seed one season into `games` from the cached hoopR box scores, dated via ESPN.
 *
 * This exists because the project's normal ingest is unreachable. `fetch_schedule.py` drives
 * nba_api against stats.nba.com, which times out from Seoul *and* from GitHub's runners — so
 * no historical season can be fetched from anywhere this project can run code. The seasons
 * already in the database were ingested when that endpoint still answered.
 *
 * Two sources, each for the thing it actually has:
 *
 *   hoopR (`ml/data/shooting/team_boxscores_<year>.csv`, already on disk for the shot and
 *   player-rest work) supplies **identity and result** — canonical NBA game ids in the
 *   `0021900001` form, home/away sides, tricodes and points. Using its ids is the whole point:
 *   `analyze_player_shooting.py` joins its box scores to `games.external_id`, so a row carrying
 *   any other id would be invisible to the surface this seed exists to feed.
 *
 *   ESPN's scoreboard supplies **the date**, which hoopR's box scores do not carry.
 *
 * The two are matched on (away tricode, away points, home tricode, home points). A repeated
 * fixture with an identical final score inside one season is vanishingly unlikely, and the
 * script refuses to write anything if any game fails to match rather than guessing.
 *
 * Usage:
 *   npx tsx scripts/seed_season_from_hoopr.ts 2019-20 --dry-run
 *   npx tsx scripts/seed_season_from_hoopr.ts 2019-20
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const CACHE_DIR = "ml/data/officials"; // shared with fetch_officials/fetch_game_context
const BOX_DIR = "ml/data/shooting";
const CONCURRENCY = 8;

/** ESPN scoreboard abbreviation → this project's abbreviation, where they differ. */
const ESPN_ABBR: Record<string, string> = {
  GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS",
  SEA: "OKC", NJ: "BKN", NJN: "BKN", NOH: "NOP", NOK: "NOP", CHH: "CHA", CHO: "CHA", VAN: "MEM",
};
const toOurAbbr = (a: string) => ESPN_ABBR[a] ?? a;

/** Game-id prefix → the `game_type` the row gets. */
const TYPE_BY_PREFIX: Record<string, string> = {
  "002": "regular",
  "004": "playoffs",
  "005": "play_in",
};

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

async function scoreboard(date: string): Promise<unknown> {
  const compact = date.replaceAll("-", "");
  const path = `${CACHE_DIR}/sb-${compact}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${date}`);
  const body = await res.text();
  JSON.parse(body);
  writeFileSync(path, body);
  return JSON.parse(body);
}

/** Every calendar date from `from` to `to`, inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

interface HooprGame {
  gameId: string;
  gameType: string;
  home: string;
  away: string;
  homePts: number;
  awayPts: number;
}

function loadHoopr(startYear: number): HooprGame[] {
  const path = `${BOX_DIR}/team_boxscores_${startYear}.csv`;
  if (!existsSync(path)) throw new Error(`No hoopR box scores at ${path}`);
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const head = lines[0].split(",");
  const col = (n: string) => head.indexOf(n);
  const [iSide, iTri, iPts, iGid] = [col("side"), col("team_tricode"), col("points"), col("game_id")];

  const sides = new Map<string, { home?: [string, number]; away?: [string, number] }>();
  for (let i = 1; i < lines.length; i++) {
    // team_boxscores has no quoted commas in the columns we read, so a plain split is safe.
    const c = lines[i].split(",");
    const gid = c[iGid];
    if (!gid) continue;
    const entry = sides.get(gid) ?? {};
    entry[c[iSide] as "home" | "away"] = [c[iTri], Number(c[iPts] || 0)];
    sides.set(gid, entry);
  }

  const out: HooprGame[] = [];
  for (const [gameId, s] of sides) {
    const gameType = TYPE_BY_PREFIX[gameId.slice(0, 3)];
    if (!gameType || !s.home || !s.away) continue;
    out.push({ gameId, gameType, home: s.home[0], away: s.away[0], homePts: s.home[1], awayPts: s.away[1] });
  }
  return out;
}

async function main() {
  const season = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a));
  const dryRun = process.argv.includes("--dry-run");
  if (!season) {
    console.error('Usage: seed_season_from_hoopr.ts <season, e.g. "2019-20"> [--dry-run]');
    process.exit(1);
  }
  const startYear = Number(season.slice(0, 4));

  const hoopr = loadHoopr(startYear);
  console.log(`hoopR ${season}: ${hoopr.length} games (${new Set(hoopr.map((g) => g.gameType)).size} types)`);

  // A season can run to October of the following year — 2019-20 finished in the bubble on
  // 2020-10-11 — so the scan is deliberately wider than a normal October-to-June season.
  const dates = dateRange(`${startYear}-10-01`, `${startYear + 1}-10-31`);
  const dated = new Map<string, string>(); // match key -> date
  let fetched = 0;
  await pool(dates, CONCURRENCY, async (date) => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const sb: any = await scoreboard(date);
      for (const ev of sb?.events ?? []) {
        const c = ev?.competitions?.[0];
        const h = c?.competitors?.find((x: { homeAway: string }) => x.homeAway === "home");
        const a = c?.competitors?.find((x: { homeAway: string }) => x.homeAway === "away");
        if (!h || !a || h.score == null || a.score == null) continue;
        const key = `${toOurAbbr(a.team.abbreviation)}|${Number(a.score)}|${toOurAbbr(h.team.abbreviation)}|${Number(h.score)}`;
        if (!dated.has(key)) dated.set(key, date);
      }
    } catch (e) {
      console.log(`  [warn] ${date}: ${e instanceof Error ? e.message : e}`);
    }
    if (++fetched % 100 === 0) console.log(`  ${fetched}/${dates.length} dates`);
  });
  console.log(`ESPN: ${dated.size} dated results across ${dates.length} dates`);

  const rows: { externalId: string; date: string; season: string; gameType: string; home: string; away: string; homeScore: number; awayScore: number }[] = [];
  const unmatched: string[] = [];
  for (const g of hoopr) {
    const date = dated.get(`${g.away}|${g.awayPts}|${g.home}|${g.homePts}`);
    if (!date) {
      unmatched.push(`${g.gameId} ${g.away} ${g.awayPts} @ ${g.home} ${g.homePts}`);
      continue;
    }
    rows.push({
      externalId: g.gameId, date, season, gameType: g.gameType,
      home: g.home, away: g.away, homeScore: g.homePts, awayScore: g.awayPts,
    });
  }

  console.log(`matched ${rows.length} / ${hoopr.length}`);
  const byType = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.gameType]: (acc[r.gameType] ?? 0) + 1 }), {});
  console.log("  by type:", byType);
  console.log(`  date span: ${rows.map((r) => r.date).sort()[0]} → ${rows.map((r) => r.date).sort().at(-1)}`);

  if (unmatched.length) {
    console.log(`\nUNMATCHED (${unmatched.length}) — refusing to write a partial season:`);
    unmatched.slice(0, 15).forEach((u) => console.log("   " + u));
    process.exit(1);
  }
  if (dryRun) {
    console.log("\n--dry-run: nothing written");
    process.exit(0);
  }

  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
  const teams = await sql<{ id: number; abbreviation: string }[]>`select id, abbreviation from teams`;
  const idByAbbr = new Map(teams.map((t) => [t.abbreviation, t.id]));
  const missing = [...new Set(rows.flatMap((r) => [r.home, r.away]))].filter((a) => !idByAbbr.has(a));
  if (missing.length) {
    console.error("Unknown tricodes, refusing to write:", missing.join(", "));
    process.exit(1);
  }

  let written = 0;
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await sql`
      insert into games ${sql(
        chunk.map((r) => ({
          external_id: r.externalId,
          date: r.date,
          season: r.season,
          home_team_id: idByAbbr.get(r.home)!,
          away_team_id: idByAbbr.get(r.away)!,
          home_score: r.homeScore,
          away_score: r.awayScore,
          status: "final",
          game_type: r.gameType,
        }))
      )}
      on conflict (external_id) do update set
        date = excluded.date,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        status = excluded.status,
        game_type = excluded.game_type`;
    written += res.count ?? chunk.length;
  }
  console.log(`\ndone — ${written} rows upserted`);
  await sql.end();
}

main();
