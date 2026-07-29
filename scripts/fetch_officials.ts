/**
 * Referee Effect — data pipeline.
 *
 * For every regular-season game in the DB from FIRST_SEASON on, finds the game's
 * ESPN event via the date scoreboard, pulls its summary, and extracts the three
 * assigned officials plus each side's free-throw attempts. Aggregates per
 * official into src/data/referee-whistle.json for the /referees page.
 *
 * ESPN is used because it is reachable where nba.com endpoints are not (see
 * docs/audit + memory: cdn.nba.com 403s, stats.nba.com times out), and its
 * summaries carry named officials back to at least 2002. Every HTTP response is
 * cached under ml/data/officials/ (gitignored), so reruns and extensions to
 * earlier seasons only fetch what is missing.
 *
 * FTA — not personal fouls — is the whistle metric: it is the whistle's direct
 * scoreboard consequence, and ESPN's `fouls` field is missing (rendered as 0)
 * for a nontrivial slice of games while FTA is present throughout. A small
 * number of games (scattered, mostly Oct–Nov 2015) have no box statistics at
 * all in the summary payload; they are counted and skipped.
 *
 * Usage: npx tsx scripts/fetch_officials.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FIRST_SEASON = "2015-16";
const CACHE_DIR = "ml/data/officials";
const OUT_PATH = "src/data/referee-whistle.json";
const CONCURRENCY = 10;

/** ESPN scoreboard abbreviation → this site's abbreviation, where they differ. */
const ESPN_ABBR: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};
const toOurAbbr = (espn: string) => ESPN_ABBR[espn] ?? espn;

/** Run fn over items with at most `limit` in flight. Results keep item order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJsonCached(url: string, cacheFile: string): Promise<unknown> {
  const path = `${CACHE_DIR}/${cacheFile}`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = await res.text();
  JSON.parse(body); // never cache a non-JSON error page
  writeFileSync(path, body);
  return JSON.parse(body);
}

interface GameWhistle {
  season: string;
  date: string;
  home: string;
  away: string;
  officials: string[];
  homeFta: number;
  awayFta: number;
  homeWon: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */
function parseSummary(summary: any): { officials: string[]; fta: Record<string, number> } | null {
  const officials: string[] = (summary?.gameInfo?.officials ?? []).map(
    (o: any) => String(o.displayName)
  );
  const fta: Record<string, number> = {};
  for (const t of summary?.boxscore?.teams ?? []) {
    const stat = (t.statistics ?? []).find(
      (s: any) => s.name === "freeThrowsMade-freeThrowsAttempted"
    );
    const attempted = stat ? Number(String(stat.displayValue).split("-")[1]) : NaN;
    fta[toOurAbbr(String(t.team.abbreviation))] = attempted;
  }
  if (officials.length === 0) return null;
  return { officials, fta };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const { db } = await import("../src/lib/db");
  const { games, teams } = await import("../src/lib/db/schema");
  const { NBA_SEASONS } = await import("../src/lib/nba-season");
  const { and, eq, gte } = await import("drizzle-orm");

  const teamRows = await db.select({ id: teams.id, abbr: teams.abbreviation }).from(teams);
  const abbrById = new Map(teamRows.map((t) => [t.id, t.abbr]));

  const seasons = NBA_SEASONS.filter((s) => s >= FIRST_SEASON);
  const rows = await db
    .select({
      season: games.season,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
    })
    .from(games)
    .where(and(gte(games.season, FIRST_SEASON), eq(games.gameType, "regular")));

  const playable = rows.filter(
    (g) => seasons.includes(g.season) && g.homeScore != null && g.awayScore != null
  );
  const byDate = new Map<string, typeof playable>();
  for (const g of playable) {
    const date = String(g.date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(g);
  }
  const dates = [...byDate.keys()].sort();
  console.log(
    `${playable.length} games across ${dates.length} dates, seasons ${seasons[0]}–${seasons[seasons.length - 1]}`
  );

  // Phase A: scoreboards — one per date, matched to our games by away@home.
  let sbErrors = 0;
  let sbDone = 0;
  const matched: Array<{ game: (typeof playable)[number]; eventId: string }> = [];
  let unmatched = 0;
  await pool(dates, CONCURRENCY, async (date) => {
    const compact = date.replaceAll("-", "");
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const sb: any = await fetchJsonCached(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`,
        `sb-${compact}.json`
      );
      const events = new Map<string, string>();
      for (const ev of sb?.events ?? []) {
        const comp = ev?.competitions?.[0];
        const home = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
        const away = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");
        if (!home || !away) continue;
        events.set(
          `${toOurAbbr(String(away.team.abbreviation))}@${toOurAbbr(String(home.team.abbreviation))}`,
          String(ev.id)
        );
      }
      for (const g of byDate.get(date)!) {
        const key = `${abbrById.get(g.awayTeamId)}@${abbrById.get(g.homeTeamId)}`;
        const eventId = events.get(key);
        if (eventId) matched.push({ game: g, eventId });
        else {
          unmatched++;
          console.log(`[UNMATCHED] ${date} ${key}`);
        }
      }
    } catch (e) {
      sbErrors++;
      console.log(`[ERROR] scoreboard ${date}: ${e instanceof Error ? e.message : e}`);
    }
    if (++sbDone % 200 === 0) console.log(`  ${sbDone}/${dates.length} scoreboards done`);
  });
  console.log(`matched ${matched.length} events, unmatched ${unmatched}, scoreboard errors ${sbErrors}`);

  // Phase B: summaries — officials + FTA per matched event.
  const collected: GameWhistle[] = [];
  let missingData = 0;
  let sumErrors = 0;
  let sumDone = 0;
  await pool(matched, CONCURRENCY, async ({ game: g, eventId }) => {
    const home = abbrById.get(g.homeTeamId)!;
    const away = abbrById.get(g.awayTeamId)!;
    try {
      const summary = await fetchJsonCached(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
        `ev-${eventId}.json`
      );
      const parsed = parseSummary(summary);
      const homeFta = parsed?.fta[home];
      const awayFta = parsed?.fta[away];
      if (!parsed || homeFta == null || awayFta == null || Number.isNaN(homeFta) || Number.isNaN(awayFta)) {
        missingData++;
        console.log(`[MISSING] ${g.date} ${away}@${home} event=${eventId}`);
        return;
      }
      collected.push({
        season: g.season,
        date: String(g.date),
        home,
        away,
        officials: parsed.officials,
        homeFta,
        awayFta,
        homeWon: g.homeScore! > g.awayScore!,
      });
    } catch (e) {
      sumErrors++;
      console.log(`[ERROR] summary ${g.date} ${away}@${home}: ${e instanceof Error ? e.message : e}`);
    }
    if (++sumDone % 500 === 0) console.log(`  ${sumDone}/${matched.length} summaries done`);
  });

  console.log(
    `collected ${collected.length}, unmatched ${unmatched}, missing ${missingData}, errors ${sbErrors + sumErrors}`
  );
  collected.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeFileSync(`${CACHE_DIR}/officials-games.json`, JSON.stringify(collected));

  // Aggregate. A game counts once per assigned official — whistles cannot be
  // attributed to individuals within a three-person crew, and the page says so.
  const perRef = new Map<string, { games: number; ftaEdgeSum: number; ftaTotalSum: number; homeWins: number }>();
  let leagueFtaEdge = 0;
  let leagueFtaTotal = 0;
  let leagueHomeWins = 0;
  for (const g of collected) {
    leagueFtaEdge += g.homeFta - g.awayFta;
    leagueFtaTotal += g.homeFta + g.awayFta;
    leagueHomeWins += g.homeWon ? 1 : 0;
    for (const name of g.officials) {
      const r = perRef.get(name) ?? { games: 0, ftaEdgeSum: 0, ftaTotalSum: 0, homeWins: 0 };
      r.games++;
      r.ftaEdgeSum += g.homeFta - g.awayFta;
      r.ftaTotalSum += g.homeFta + g.awayFta;
      r.homeWins += g.homeWon ? 1 : 0;
      perRef.set(name, r);
    }
  }

  const round = (v: number, d: number) => Number(v.toFixed(d));
  const n = collected.length;
  const meanEdge = leagueFtaEdge / n;
  const meanTotal = leagueFtaTotal / n;
  const pHome = leagueHomeWins / n;
  const sd = (values: number[], mean: number) =>
    Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1));
  const sdEdge = sd(collected.map((g) => g.homeFta - g.awayFta), meanEdge);
  const sdTotal = sd(collected.map((g) => g.homeFta + g.awayFta), meanTotal);

  // z-scores against the league mean at each official's own sample size, so the
  // page can say which deviations exceed what chance predicts (|z| > 2) instead
  // of letting every raw difference read as a tendency.
  const officials = [...perRef.entries()]
    .map(([name, r]) => ({
      name,
      games: r.games,
      homeFtaEdge: round(r.ftaEdgeSum / r.games, 2),
      homeFtaEdgeZ: round((r.ftaEdgeSum / r.games - meanEdge) / (sdEdge / Math.sqrt(r.games)), 1),
      totalFta: round(r.ftaTotalSum / r.games, 1),
      totalFtaZ: round((r.ftaTotalSum / r.games - meanTotal) / (sdTotal / Math.sqrt(r.games)), 1),
      homeWinPct: round((r.homeWins / r.games) * 100, 1),
      homeWinPctZ: round(
        (r.homeWins / r.games - pHome) / Math.sqrt((pHome * (1 - pHome)) / r.games),
        1
      ),
    }))
    .sort((a, b) => b.games - a.games);

  const out = {
    source: "ESPN game summaries",
    generated: new Date().toISOString().slice(0, 10),
    firstSeason: seasons[0],
    lastSeason: seasons[seasons.length - 1],
    seasonsCovered: seasons.length,
    gamesCovered: collected.length,
    gamesSkipped: unmatched + missingData,
    league: {
      n,
      homeFtaEdge: round(meanEdge, 2),
      sdHomeFtaEdge: round(sdEdge, 2),
      totalFta: round(meanTotal, 1),
      sdTotalFta: round(sdTotal, 1),
      homeWinPct: round(pHome * 100, 1),
    },
    officials,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${OUT_PATH} — ${officials.length} officials`);
  console.log("Officials pipeline complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
