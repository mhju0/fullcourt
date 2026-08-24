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
const STYLE_OUT_PATH = "src/data/referee-foul-style.json";
const CONCURRENCY = 10;

/**
 * The published foul taxonomy, mapping ESPN play-by-play `type.text` onto the columns the
 * page shows. Anything foul-flagged and unlisted lands in neither — it is counted in the
 * per-game total and shown in no column, which is what "other" means here.
 *
 * `Offensive Foul Turnover` is DELIBERATELY ABSENT and must stay that way: the NBA logs an
 * offensive foul twice, once as the foul and once as the turnover it causes. Counting both
 * inflates fouls per game by ~3.2. Verified against the box score's own PF total on 249
 * games — including it gives 42.06/game against a box score of 38.84; excluding it gives
 * 38.71, i.e. the play stream and the box score agree to 0.3%.
 */
const FOUL_TYPES = {
  shooting: ["Shooting Foul"],
  personal: ["Personal Foul", "Double Personal Foul", "Inbound Foul"],
  looseBall: ["Loose Ball Foul"],
  offensive: ["Offensive Foul"],
  technical: [
    "Technical Foul",
    "Double Technical Foul",
    "Hanging Technical Foul",
    "Taunting Technical Foul",
  ],
} as const;
type FoulKey = keyof typeof FOUL_TYPES;
const FOUL_KEYS = Object.keys(FOUL_TYPES) as FoulKey[];
const TYPE_LOOKUP = new Map<string, FoulKey>(
  FOUL_KEYS.flatMap((k) => FOUL_TYPES[k].map((label) => [label, k] as const))
);
const DUPLICATE_OF_OFFENSIVE = "Offensive Foul Turnover";

/**
 * Crew-chief role is read off ESPN's `order` field, which is only trustworthy from this
 * season on. Validated against archived official.nba.com pages carrying an explicit Crew
 * Chief column: 10/10 games in 2024-25 and 2025-26, but 2/4 in 2023-24 and a clear failure
 * in 2015-16. Widening this without new validation would invent a role.
 */
const CREW_CHIEF_FIRST_SEASON = "2024-25";

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

type FoulCounts = Record<FoulKey, number>;

interface GameWhistle {
  season: string;
  date: string;
  home: string;
  away: string;
  officials: string[];
  /** Slot 1 first, as ESPN orders them. Slot 1 is the crew chief from 2024-25 on. */
  crewChief: string | null;
  fouls: FoulCounts;
  /** Every foul-flagged play bar the offensive-foul duplicate, including unpublished types. */
  totalFouls: number;
  /** 4 in a regulation game. Overtime inflates every foul count, so those games are dropped. */
  periods: number;
  homeFta: number;
  awayFta: number;
  homeWon: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */
function parseSummary(summary: any): {
  officials: string[];
  crewChief: string | null;
  fta: Record<string, number>;
  fouls: FoulCounts;
  totalFouls: number;
  periods: number;
} | null {
  const raw: any[] = summary?.gameInfo?.officials ?? [];
  // The WORKING crew: sorted by `order`, deduplicated, first three. Taking the array as-is
  // broke this file's own contract ("every game credits all three") two ways, both found by
  // the 2026-08-24 replication gate (ml/referee_career_preregistration.md, M0): ESPN lists
  // the same name twice at one order in 228 payloads — overwhelmingly Gediminas Petraitis,
  // whose published G read 721 for 604 real games with his z inflated ~9% by the double
  // weighting — and playoff-style payloads carry a standby at order 4 who did not work the
  // game (the rule ml/extract_referee_corpus.py already enforces).
  const officials: string[] = [
    ...new Set(
      raw
        .slice()
        .sort((a: any, b: any) => (Number(a?.order) || 99) - (Number(b?.order) || 99))
        .map((o: any) => String(o.displayName))
    ),
  ].slice(0, 3);
  // ESPN sometimes omits `order`; without it there is no slot 1 to read a role from.
  const first = raw.find((o: any) => Number(o?.order) === 1);
  const crewChief = first ? String(first.displayName) : null;

  const fta: Record<string, number> = {};
  for (const t of summary?.boxscore?.teams ?? []) {
    const stat = (t.statistics ?? []).find(
      (s: any) => s.name === "freeThrowsMade-freeThrowsAttempted"
    );
    const attempted = stat ? Number(String(stat.displayValue).split("-")[1]) : NaN;
    fta[toOurAbbr(String(t.team.abbreviation))] = attempted;
  }

  const fouls = Object.fromEntries(FOUL_KEYS.map((k) => [k, 0])) as FoulCounts;
  let totalFouls = 0;
  let periods = 0;
  for (const p of summary?.plays ?? []) {
    periods = Math.max(periods, Number(p?.period?.number) || 0);
    const label = String(p?.type?.text ?? "");
    if (!label.toLowerCase().includes("foul")) continue;
    if (label === "No Foul" || label === DUPLICATE_OF_OFFENSIVE) continue;
    totalFouls++;
    const key = TYPE_LOOKUP.get(label);
    if (key) fouls[key]++;
  }

  if (officials.length === 0) return null;
  return { officials, crewChief, fta, fouls, totalFouls, periods };
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
        crewChief: parsed.crewChief,
        fouls: parsed.fouls,
        totalFouls: parsed.totalFouls,
        periods: parsed.periods,
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

  writeFileSync(STYLE_OUT_PATH, JSON.stringify(buildFoulStyle(collected, seasons), null, 2) + "\n");
  console.log(`wrote ${STYLE_OUT_PATH}`);
  console.log("Officials pipeline complete");
  process.exit(0);
}

/**
 * Foul-style aggregate — how each official's mix of foul types differs from the league's.
 *
 * Three deliberate choices, each of which changes the answer:
 *
 * 1. **Shares, not counts.** A share removes pace and how foul-prone the two teams are, so
 *    what is left is the mix. Measured in percentage points of a game's own fouls.
 * 2. **Baselined per season, never pooled.** The taxonomy moves under the league's feet —
 *    take fouls ran 2.3 a game in 2020-21 and 0.6 by 2023-24 after the rule change, and
 *    an official who worked one era and not the other would inherit the difference.
 * 3. **Regulation games only.** Overtime adds fouls to the total but not proportionally
 *    across types, so an official with more overtime would drift on mix alone.
 *
 * The number that cannot be fixed here is attribution: a call belongs to one of three
 * officials and ESPN does not say which, so every game credits all three and each measured
 * effect is roughly a third of the real one. What rescues it is that crews barely repeat —
 * 87% of trios in this data occur exactly once — so an official's partners are effectively
 * randomised across their career and wash out as noise rather than bias.
 */
function buildFoulStyle(collected: GameWhistle[], seasons: string[]) {
  const round = (v: number, d: number) => Number(v.toFixed(d));
  const MIN_FOULS = 20; // a game whose play stream is too thin to trust a mix from
  const games = collected.filter((g) => g.periods === 4 && g.totalFouls >= MIN_FOULS);

  const shareOf = (g: GameWhistle, k: FoulKey) => (100 * g.fouls[k]) / g.totalFouls;

  // Season baselines: mean share per type, and mean fouls per game.
  const bySeason = new Map<string, GameWhistle[]>();
  for (const g of games) {
    if (!bySeason.has(g.season)) bySeason.set(g.season, []);
    bySeason.get(g.season)!.push(g);
  }
  const seasonMean = new Map<string, { shares: Record<FoulKey, number>; fouls: number }>();
  for (const [season, gs] of bySeason) {
    const shares = Object.fromEntries(
      FOUL_KEYS.map((k) => [k, gs.reduce((a, g) => a + shareOf(g, k), 0) / gs.length])
    ) as Record<FoulKey, number>;
    seasonMean.set(season, {
      shares,
      fouls: gs.reduce((a, g) => a + g.totalFouls, 0) / gs.length,
    });
  }

  // Per official, the per-game deviations from that game's own season baseline.
  const per = new Map<
    string,
    {
      games: number;
      chiefGames: number;
      firstSeason: string;
      lastSeason: string;
      foulDev: number[];
      dev: Record<FoulKey, number[]>;
    }
  >();
  for (const g of games) {
    const base = seasonMean.get(g.season)!;
    const isChiefSeason = g.season >= CREW_CHIEF_FIRST_SEASON;
    for (const name of g.officials) {
      let r = per.get(name);
      if (!r) {
        r = {
          games: 0,
          chiefGames: 0,
          firstSeason: g.season,
          lastSeason: g.season,
          foulDev: [],
          dev: Object.fromEntries(FOUL_KEYS.map((k) => [k, [] as number[]])) as Record<
            FoulKey,
            number[]
          >,
        };
        per.set(name, r);
      }
      r.games++;
      // The span in THIS data, not a career: the corpus opens at FIRST_SEASON, so a tenure
      // that began earlier reads as starting there. The column guide carries the caveat.
      if (g.season < r.firstSeason) r.firstSeason = g.season;
      if (g.season > r.lastSeason) r.lastSeason = g.season;
      if (isChiefSeason && g.crewChief === name) r.chiefGames++;
      r.foulDev.push(g.totalFouls - base.fouls);
      for (const k of FOUL_KEYS) r.dev[k].push(shareOf(g, k) - base.shares[k]);
    }
  }

  /** Mean of the deviations, and how many standard errors it sits from zero. */
  const meanAndZ = (v: number[]) => {
    const n = v.length;
    const mean = v.reduce((a, x) => a + x, 0) / n;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
    return { mean, z: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0 };
  };

  const officials = [...per.entries()]
    .map(([name, r]) => {
      const fouls = meanAndZ(r.foulDev);
      const row: Record<string, unknown> = {
        name,
        games: r.games,
        chiefGames: r.chiefGames,
        firstSeason: r.firstSeason,
        lastSeason: r.lastSeason,
        fouls: round(fouls.mean, 2),
        foulsZ: round(fouls.z, 1),
      };
      for (const k of FOUL_KEYS) {
        const { mean, z } = meanAndZ(r.dev[k]);
        row[k] = round(mean, 2);
        row[`${k}Z`] = round(z, 1);
      }
      return row;
    })
    .sort((a, b) => (b.games as number) - (a.games as number));

  // League shares averaged across seasons, for the column captions.
  const leagueShares = Object.fromEntries(
    FOUL_KEYS.map((k) => [
      k,
      round([...seasonMean.values()].reduce((a, s) => a + s.shares[k], 0) / seasonMean.size, 1),
    ])
  );

  return {
    source: "ESPN play-by-play",
    generated: new Date().toISOString().slice(0, 10),
    firstSeason: seasons[0],
    lastSeason: seasons[seasons.length - 1],
    gamesCovered: games.length,
    gamesExcluded: collected.length - games.length,
    crewChiefFirstSeason: CREW_CHIEF_FIRST_SEASON,
    foulsPerGame: round(
      [...seasonMean.values()].reduce((a, s) => a + s.fouls, 0) / seasonMean.size,
      1
    ),
    leagueShares,
    officials,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
