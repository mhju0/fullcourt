/**
 * Season win-total market check — data pipeline.
 *
 * Fetches every archived NBA season win-total page from sportsoddshistory
 * (hosted at covers.com since 2026), joins each team-season's closing line and
 * over/under result against this site's own net-edge-games figure, and writes
 * the aggregate benchmark consumed by the Schedule Edge page to
 * src/data/win-total-benchmark.json.
 *
 * The join is self-validating: the archive's "actual wins" must equal the win
 * count derived from our games table for every row, or the script throws.
 * A name that maps to the wrong franchise cannot pass that check silently.
 *
 * Coverage limits (verified 2026-07-29, not assumptions):
 *  - archive has no lines before 1993-94, and none for the 1998-99 lockout;
 *  - 2019-20 is excluded because this site's dataset omits the bubble season;
 *  - a few 1994-95 / 1995-96 teams are listed with line "N/A" and are skipped.
 *
 * Usage: npx tsx scripts/fetch_win_totals.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";

const FIRST_SEASON_WITH_LINES = "1993-94";
const SOURCE_URL = (start: number) =>
  `https://www.sportsoddshistory.com/nba-win/?y=${start}-${start + 1}&sa=nba&t=win&o=t`;

/**
 * Archive team name → this site's franchise abbreviation. Relocated franchises
 * map to their current abbreviation because that is how our games table stores
 * them (Sonics games live under OKC, Vancouver under MEM, Bullets under WAS,
 * and both Charlotte eras under CHA — the same convention team-era-coordinates
 * corrects for geographically).
 */
const NAME_TO_ABBR: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "New Jersey Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Charlotte Bobcats": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Vancouver Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Hornets": "NOP",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Seattle SuperSonics": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Bullets": "WAS",
  "Washington Wizards": "WAS",
};

interface LineRow {
  season: string;
  abbr: string;
  line: number;
  actual: number;
  result: "Over" | "Under" | "Push";
}

function stripTags(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSeasonPage(html: string, season: string): LineRow[] {
  const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/);
  if (!table) return [];
  const rows = [...table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => stripTags(c[1]))
  );
  const out: LineRow[] = [];
  // Row shape: Team | Win Total | Over Odds | Under Odds | settled | Actual | Result
  for (const cells of rows.slice(1)) {
    if (cells.length < 7) continue;
    const [team, line, , , , actual, result] = cells;
    if (line === "N/A") continue;
    const abbr = NAME_TO_ABBR[team];
    if (!abbr) throw new Error(`${season}: unmapped team name "${team}"`);
    if (result !== "Over" && result !== "Under" && result !== "Push")
      throw new Error(`${season} ${team}: unexpected result "${result}"`);
    out.push({ season, abbr, line: Number(line), actual: Number(actual), result });
  }
  return out;
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { games, teams } = await import("../src/lib/db/schema");
  const { getScheduleDisparity } = await import("../src/lib/schedule-disparity-server");
  const { NBA_SEASONS } = await import("../src/lib/nba-season");
  const { and, eq } = await import("drizzle-orm");

  const teamRows = await db.select({ id: teams.id, abbr: teams.abbreviation }).from(teams);
  const abbrById = new Map(teamRows.map((t) => [t.id, t.abbr]));

  const seasons = NBA_SEASONS.filter((s) => s >= FIRST_SEASON_WITH_LINES);
  const joined: Array<LineRow & { netEdgeGames: number }> = [];
  const seasonsWithLines: string[] = [];

  for (const season of seasons) {
    const startYear = Number(season.slice(0, 4));
    const res = await fetch(SOURCE_URL(startYear), {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${season}: HTTP ${res.status}`);
    const lines = parseSeasonPage(await res.text(), season);
    if (lines.length === 0) {
      console.log(`${season}: no lines published, skipping`);
      continue;
    }
    seasonsWithLines.push(season);

    const disparity = await getScheduleDisparity(season);
    const netByAbbr = new Map(
      disparity.teams.map((t) => [abbrById.get(t.teamId), t.netEdgeGames])
    );

    const finals = await db
      .select({
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
      })
      .from(games)
      .where(and(eq(games.season, season), eq(games.gameType, "regular")));
    const winsByTeamId = new Map<number, number>();
    for (const g of finals) {
      if (g.homeScore == null || g.awayScore == null) continue;
      const winner = g.homeScore > g.awayScore ? g.homeTeamId : g.awayTeamId;
      winsByTeamId.set(winner, (winsByTeamId.get(winner) ?? 0) + 1);
    }
    const winsByAbbr = new Map(
      [...winsByTeamId].map(([id, w]) => [abbrById.get(id), w])
    );

    for (const row of lines) {
      const net = netByAbbr.get(row.abbr);
      const dbWins = winsByAbbr.get(row.abbr);
      if (net === undefined || dbWins === undefined)
        throw new Error(`${season} ${row.abbr}: missing in our data`);
      if (dbWins !== row.actual)
        throw new Error(
          `${season} ${row.abbr}: archive says ${row.actual} wins, our games table says ${dbWins}`
        );
      joined.push({ ...row, netEdgeGames: net });
    }
    console.log(`${season}: ${lines.length} lines joined`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const decided = joined.filter((r) => r.result !== "Push");
  const overRate = (rows: typeof decided) => ({
    overs: rows.filter((r) => r.result === "Over").length,
    n: rows.length,
  });

  const buckets = [
    { label: "+10 or better", min: 10, max: Infinity },
    { label: "+5 to +9", min: 5, max: 9 },
    { label: "−4 to +4", min: -4, max: 4 },
    { label: "−9 to −5", min: -9, max: -5 },
    { label: "−10 or worse", min: -Infinity, max: -10 },
  ].map((b) => ({
    label: b.label,
    ...overRate(decided.filter((r) => r.netEdgeGames >= b.min && r.netEdgeGames <= b.max)),
  }));

  const n = joined.length;
  const xs = joined.map((r) => r.netEdgeGames);
  const ys = joined.map((r) => r.actual - r.line);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  const cov = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
  const sx = Math.sqrt(xs.reduce((acc, x) => acc + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((acc, y) => acc + (y - my) ** 2, 0));
  const r = cov / (sx * sy);

  const benchmark = {
    source: "sportsoddshistory.com archive (hosted at covers.com)",
    generated: new Date().toISOString().slice(0, 10),
    firstSeason: seasonsWithLines[0],
    lastSeason: seasonsWithLines[seasonsWithLines.length - 1],
    seasonsCovered: seasonsWithLines.length,
    teamSeasons: n,
    pushes: n - decided.length,
    overall: overRate(decided),
    correlation: { r: Number(r.toFixed(4)), n },
    buckets,
  };

  writeFileSync("src/data/win-total-benchmark.json", JSON.stringify(benchmark, null, 2) + "\n");
  console.log("wrote src/data/win-total-benchmark.json");
  console.log(JSON.stringify(benchmark, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
