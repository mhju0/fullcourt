import { applyGameInputCorrection, lookupGameInputCorrection, canonicalGameType, lookupAcceptedAddedFixture } from "@/lib/game-input-corrections";
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
 * The two are matched on (away tricode, away points, home tricode, home points). Repeated
 * keys are ambiguous and refused before any write. Existing identical finals are no-ops;
 * changed identities or results require a reviewed correction or re-key operation.
 *
 * Usage:
 *   npx tsx scripts/seed_season_from_hoopr.ts 2019-20 --dry-run
 *   npx tsx scripts/seed_season_from_hoopr.ts 2019-20
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { assertUniqueHooprMatches, historicalScoreboardResults, HistoricalSeedIndex, validateSeedScoreboard } from "./seed-season-contract";
import { seedHistoricalRows } from "./seed-season-write";
import { toOurAbbr } from "@/lib/espn-scoreboard";
import { pathToFileURL } from "node:url";

const CACHE_DIR = "ml/data/officials"; // shared with fetch_officials/fetch_game_context
const BOX_DIR = "ml/data/shooting";
const CONCURRENCY = 8;

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

export async function scoreboard(date: string, cacheDirectory = CACHE_DIR): Promise<unknown> {
  const compact = date.replaceAll("-", "");
  const path = `${cacheDirectory}/sb-${compact}.json`;
  if (existsSync(path)) {
    const cached: unknown = JSON.parse(readFileSync(path, "utf8"));
    validateSeedScoreboard(cached);
    return cached;
  }
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25_000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${date}`);
  const body = await res.text();
  const parsed: unknown = JSON.parse(body);
  validateSeedScoreboard(parsed);
  mkdirSync(cacheDirectory, { recursive: true });
  writeFileSync(path, body);
  return parsed;
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
  if ([iSide, iTri, iPts, iGid].some(index => index < 0)) throw new Error("Missing hoopR identity/result columns");

  const sides = new Map<string, { home?: [string, number]; away?: [string, number] }>();
  for (let i = 1; i < lines.length; i++) {
    // team_boxscores has no quoted commas in the columns we read, so a plain split is safe.
    const c = lines[i].split(",");
    const gid = c[iGid];
    if (!gid) continue;
    const side = c[iSide];
    if (side !== "home" && side !== "away") throw new Error(`Invalid hoopR side for ${gid}`);
    const entry = sides.get(gid) ?? {};
    if (entry[side] || !c[iPts]?.trim()) throw new Error(`Missing or duplicate hoopR result for ${gid}`);
    entry[side] = [toOurAbbr(c[iTri]), Number(c[iPts])];
    sides.set(gid, entry);
  }

  const out: HooprGame[] = [];
  for (const [gameId, s] of sides) {
    const gameType = canonicalGameType(gameId);
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
  assertUniqueHooprMatches(hoopr);
  console.log(`hoopR ${season}: ${hoopr.length} games (${new Set(hoopr.map((g) => g.gameType)).size} types)`);

  // A season can run to October of the following year — 2019-20 finished in the bubble on
  // 2020-10-11 — so the scan is deliberately wider than a normal October-to-June season.
  const dates = dateRange(`${startYear}-10-01`, `${startYear + 1}-10-31`);
  const dated = new HistoricalSeedIndex();
  let fetched = 0;
  let errors = 0;
  await pool(dates, CONCURRENCY, async (date) => {
    try {
      for (const game of historicalScoreboardResults(await scoreboard(date), startYear + 1)) dated.add(game);
    } catch (e) {
      errors++;
      console.log(`  [warn] ${date}: ${e instanceof Error ? e.message : e}`);
    }
    if (++fetched % 100 === 0) console.log(`  ${fetched}/${dates.length} dates`);
  });
  console.log(`ESPN: ${dated.size} dated results across ${dates.length} dates`);
  if (errors) throw new Error(`REFUSING TO WRITE — ${errors} ESPN dates failed or had ambiguous/malformed results`);

  const rows: { externalId: string; date: string; season: string; gameType: string; home: string; away: string; homeScore: number; awayScore: number }[] = [];
  const unmatched: string[] = [];
  for (const g of hoopr) {
    const date = dated.get(g)?.date;
    if (!date) {
      unmatched.push(`${g.gameId} ${g.away} ${g.awayPts} @ ${g.home} ${g.homePts}`);
      continue;
    }
    rows.push(applyGameInputCorrection({
      homeAbbr: g.home, awayAbbr: g.away,
      externalId: g.gameId, date, season, gameType: g.gameType,
      home: g.home, away: g.away, homeScore: g.homePts, awayScore: g.awayPts,
    }));
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
  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
  try {
    const teams = await sql<{ id: number; abbreviation: string }[]>`select id, abbreviation from teams`;
    const idByAbbr = new Map(teams.map((t) => [t.abbreviation, t.id]));
    const missing = [...new Set(rows.flatMap((r) => [r.home, r.away]))].filter((a) => !idByAbbr.has(a));
    if (missing.length) throw new Error(`Unknown tricodes, refusing to write: ${missing.join(", ")}`);

    const candidates = rows.map((r) => {
      const identity = { date: r.date, homeAbbr: r.home, awayAbbr: r.away };
      const correction = lookupGameInputCorrection(identity)?.fields;
      const addition = lookupAcceptedAddedFixture(identity);
      return {
        externalId: r.externalId, date: r.date, season: r.season, gameType: r.gameType,
        homeTeamId: idByAbbr.get(r.home)!, awayTeamId: idByAbbr.get(r.away)!,
        homeScore: r.homeScore, awayScore: r.awayScore,
        overtimePeriods: correction?.overtimePeriods?.after ?? addition?.overtimePeriods ?? 0,
        neutralSite: correction?.neutralSite?.after ?? addition?.neutralSite ?? false,
        neutralVenueCity: correction?.neutralVenueCity?.after ?? addition?.neutralVenueCity ?? null,
        tipOffUtc: correction?.tipOffUtc?.after ?? addition?.tipOffUtc ?? null,
      };
    });
    const written = await seedHistoricalRows(sql, candidates, { dryRun });
    console.log(dryRun ? `\n--dry-run: ${written} missing rows eligible; nothing written` : `\ndone — ${written} missing rows inserted; existing identical finals preserved`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
