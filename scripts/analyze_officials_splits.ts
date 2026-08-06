/**
 * Officiating splits — axes A and C of the pre-registration in
 * `docs/adr/0007-referee-analysis-axes-are-pre-registered.md`. Read that first: the axis list is
 * closed, the bar is fixed, and an axis added here after seeing output is a protocol violation
 * rather than an improvement.
 *
 * **A — foul type × home/away.** Per game, per foul type, fouls committed by the home team minus
 * fouls committed by the away team. Paired within official: both sides are the same game, the
 * same night, the same arena, so venue cannot leak in the way it does for a per-official rate.
 * The 2026-07-31 home-tilt null measured FTA volume and home win rate, never the split by *type*.
 *
 * **C — timing, coarse.** Fouls per quarter, regulation only. If officials do not separate on a
 * whole quarter they cannot separate on the last two minutes of one, so this rules the narrow cut
 * in or out before it is worth spending the sample on.
 *
 * Offline by construction: reads only the `ev-*.json` summaries already cached in
 * `ml/data/officials/` and fetches nothing, which is why it sits apart from
 * `scripts/fetch_officials.ts` rather than inside it.
 *
 * Deliberately shared with that script, because a second copy of any of them would be a second
 * answer: the foul taxonomy, the `Offensive Foul Turnover` exclusion (the NBA logs an offensive
 * foul twice, and counting both inflates fouls per game by ~3.2), regulation-only games, the
 * 20-foul floor, per-season baselining, and mean-over-standard-error for z.
 *
 * Run from the repo root:  pnpm exec tsx scripts/analyze_officials_splits.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { isNotable, MIN_GAMES, NOTABLE_Z } from "../src/lib/referee-foul-style";

const CACHE_DIR = "ml/data/officials";
/** The full working table, gitignored. Cite the published summary below, never this. */
const OUT_PATH = "ml/data/officials-splits.json";
/** The publishable subset, committed, so page copy pins to a figure instead of typing one. */
const PUBLISHED_PATH = "src/data/referee-timing.json";

/** Mirrors `scripts/fetch_officials.ts`. Any change belongs in both or in neither. */
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

/** A game whose play stream is too thin to trust a split from. Same floor as the shipped mix. */
const MIN_FOULS = 20;
const QUARTERS = [1, 2, 3, 4] as const;

/** The "swallow the whistle" window. Runs only because the per-quarter shares separated first. */
const LATE_SECONDS = 120;

/** `"9:46"` → 586. Anything unparseable sorts outside the late window rather than into it. */
function secondsLeft(display: unknown): number {
  const parts = String(display ?? "").split(":");
  if (parts.length !== 2) return Number.POSITIVE_INFINITY;
  const [m, s] = parts.map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : Number.POSITIVE_INFINITY;
}

/**
 * Two-sided normal tail beyond |z| >= 2. The bar is a *description* threshold, not a discovery
 * one — the finding is always the count of officials past it against this expectation, never the
 * fact that some official cleared it.
 */
const CHANCE_RATE = 0.0455;

interface GameSplit {
  season: string;
  officials: string[];
  totalFouls: number;
  /** Fouls committed by the home team, by type. */
  home: Record<FoulKey, number>;
  away: Record<FoulKey, number>;
  /** Foul count in each regulation quarter, index 0 = Q1. */
  byQuarter: number[];
  /** Fouls in the last 2:00 of Q4 — the sharp cut, gated on the coarse one separating first. */
  q4Late: number;
}

const zeros = () => Object.fromEntries(FOUL_KEYS.map((k) => [k, 0])) as Record<FoulKey, number>;

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */
/**
 * One cached summary reduced to its splits, or null if it cannot carry them.
 *
 * Season comes from `header.season` rather than from the game date: `type === 2` is the league's
 * own regular-season marker, so this needs no UTC-to-Eastern conversion and cannot mislabel a
 * game that tipped after midnight UTC.
 */
function parseSplit(summary: any): GameSplit | null {
  const season = summary?.header?.season;
  if (Number(season?.type) !== 2) return null;
  const year = Number(season?.year);
  if (!Number.isFinite(year)) return null;

  const officials: string[] = (summary?.gameInfo?.officials ?? []).map((o: any) =>
    String(o.displayName)
  );
  if (officials.length === 0) return null;

  const competitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  const homeId = competitors.find((c) => c?.homeAway === "home")?.team?.id;
  const awayId = competitors.find((c) => c?.homeAway === "away")?.team?.id;
  if (!homeId || !awayId) return null;

  const home = zeros();
  const away = zeros();
  const byQuarter = [0, 0, 0, 0];
  let totalFouls = 0;
  let periods = 0;
  let unattributed = 0;
  let q4Late = 0;

  for (const p of summary?.plays ?? []) {
    const period = Number(p?.period?.number) || 0;
    periods = Math.max(periods, period);
    const label = String(p?.type?.text ?? "");
    if (!label.toLowerCase().includes("foul")) continue;
    if (label === "No Foul" || label === DUPLICATE_OF_OFFENSIVE) continue;
    totalFouls++;
    if (period >= 1 && period <= 4) byQuarter[period - 1]++;
    if (period === 4 && secondsLeft(p?.clock?.displayValue) <= LATE_SECONDS) q4Late++;

    const key = TYPE_LOOKUP.get(label);
    if (!key) continue;
    const teamId = String(p?.team?.id ?? "");
    if (teamId === String(homeId)) home[key]++;
    else if (teamId === String(awayId)) away[key]++;
    else unattributed++;
  }

  // Overtime inflates counts unevenly across types and adds a fifth period C cannot use.
  if (periods !== 4 || totalFouls < MIN_FOULS) return null;
  UNATTRIBUTED.count += unattributed;
  UNATTRIBUTED.total += totalFouls;

  return {
    season: `${year - 1}-${String(year).slice(2)}`,
    officials,
    totalFouls,
    home,
    away,
    byQuarter,
    q4Late,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** How often a foul play names neither side. Reported, so a silent drop cannot pass as data. */
const UNATTRIBUTED = { count: 0, total: 0 };

/** Mean of the deviations, and how many standard errors it sits from zero. */
function meanAndZ(v: number[]): { mean: number; z: number } {
  const n = v.length;
  const mean = v.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  return { mean, z: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0 };
}

const round = (v: number, d: number) => Number(v.toFixed(d));

/**
 * Per-official deviations from each game's own season baseline, for one named family of metrics.
 *
 * Baselining per season is what keeps an era out of an official's row: the taxonomy moves under
 * the league's feet — take fouls ran 2.3 a game in 2020-21 and 0.6 by 2023-24 — so an official
 * who worked one era and not the other would otherwise inherit the difference as a tendency.
 */
function deviationTable(
  games: GameSplit[],
  metrics: string[],
  valueOf: (g: GameSplit, metric: string) => number
) {
  const bySeason = new Map<string, GameSplit[]>();
  for (const g of games) {
    if (!bySeason.has(g.season)) bySeason.set(g.season, []);
    bySeason.get(g.season)!.push(g);
  }
  const baseline = new Map<string, Record<string, number>>();
  for (const [season, gs] of bySeason) {
    baseline.set(
      season,
      Object.fromEntries(
        metrics.map((m) => [m, gs.reduce((a, g) => a + valueOf(g, m), 0) / gs.length])
      )
    );
  }

  const per = new Map<string, { games: number; dev: Record<string, number[]> }>();
  for (const g of games) {
    const base = baseline.get(g.season)!;
    for (const name of g.officials) {
      let r = per.get(name);
      if (!r) {
        r = { games: 0, dev: Object.fromEntries(metrics.map((m) => [m, [] as number[]])) };
        per.set(name, r);
      }
      r.games++;
      for (const m of metrics) r.dev[m].push(valueOf(g, m) - base[m]);
    }
  }

  const officials = [...per.entries()]
    .map(([name, r]) => {
      const row: Record<string, unknown> = { name, games: r.games };
      for (const m of metrics) {
        const { mean, z } = meanAndZ(r.dev[m]);
        row[m] = round(mean, 3);
        row[`${m}Z`] = round(z, 1);
      }
      return row;
    })
    .sort((a, b) => (b.games as number) - (a.games as number));

  // The finding is this comparison, never an individual cell.
  const eligible = officials.filter((o) => (o.games as number) >= MIN_GAMES);
  const expected = round(eligible.length * CHANCE_RATE, 1);
  const verdict = metrics.map((m) => {
    const observed = eligible.filter((o) => isNotable(o[`${m}Z`] as number)).length;
    return { metric: m, observed, expected, ratio: expected > 0 ? round(observed / expected, 2) : 0 };
  });

  return {
    leagueMean: Object.fromEntries(
      metrics.map((m) => [
        m,
        round([...baseline.values()].reduce((a, b) => a + b[m], 0) / baseline.size, 3),
      ])
    ),
    eligibleOfficials: eligible.length,
    expectedByChance: expected,
    verdict,
    officials,
  };
}

function main() {
  if (!existsSync(CACHE_DIR)) {
    throw new Error(`${CACHE_DIR} is missing — this reads the cache, it does not build it.`);
  }
  const files = readdirSync(CACHE_DIR).filter((f) => f.startsWith("ev-") && f.endsWith(".json"));
  console.log(`reading ${files.length} cached summaries from ${CACHE_DIR}`);

  const games: GameSplit[] = [];
  let unreadable = 0;
  for (const [i, f] of files.entries()) {
    if (i > 0 && i % 2000 === 0) console.log(`  ${i}/${files.length} — ${games.length} usable`);
    let parsed;
    try {
      parsed = parseSplit(JSON.parse(readFileSync(`${CACHE_DIR}/${f}`, "utf8")));
    } catch {
      unreadable++;
      continue;
    }
    if (parsed) games.push(parsed);
  }
  console.log(`${games.length} usable regular-season regulation games, ${unreadable} unreadable`);

  // ── Axis A: foul type x home/away, paired within official ──────────────
  const homeAwayCounts = deviationTable(
    games,
    FOUL_KEYS,
    (g, m) => g.home[m as FoulKey] - g.away[m as FoulKey]
  );
  // The pace control: if a count effect vanishes here it was pace, and the write-up must say so.
  const homeAwayShares = deviationTable(
    games,
    FOUL_KEYS,
    (g, m) => (100 * (g.home[m as FoulKey] - g.away[m as FoulKey])) / g.totalFouls
  );

  // ── Axis C: timing, coarse ─────────────────────────────────────────────
  const quarterMetrics = QUARTERS.map((q) => `q${q}`);
  const quarterCounts = deviationTable(games, quarterMetrics, (g, m) =>
    g.byQuarter[Number(m.slice(1)) - 1]
  );
  // "Lets the fourth go" as a share, so it is not just an official who calls fewer fouls overall.
  const quarterShares = deviationTable(
    games,
    quarterMetrics,
    (g, m) => (100 * g.byQuarter[Number(m.slice(1)) - 1]) / g.totalFouls
  );

  /**
   * The sharp cut, and the reason it is reported next to the coarse one rather than instead of
   * it. A game averages ~1.5 fouls in the last two minutes across three officials, so this is
   * the thinnest slice in the pre-registration and the one most likely to look like a finding
   * when it is sampling noise. Read the coarse table first.
   */
  const lateCounts = deviationTable(games, ["q4Late"], (g) => g.q4Late);
  const lateShares = deviationTable(games, ["q4Late"], (g) =>
    g.byQuarter[3] > 0 ? (100 * g.q4Late) / g.byQuarter[3] : 0
  );

  const report = {
    generated: new Date().toISOString().slice(0, 10),
    source: "ESPN play-by-play, cached",
    preRegistration: "docs/adr/0007-referee-analysis-axes-are-pre-registered.md",
    bar: { notableZ: NOTABLE_Z, minGames: MIN_GAMES, chanceRate: CHANCE_RATE },
    gamesUsed: games.length,
    filesRead: files.length,
    unreadableFiles: unreadable,
    seasons: [...new Set(games.map((g) => g.season))].sort(),
    unattributedFoulPct: round((100 * UNATTRIBUTED.count) / UNATTRIBUTED.total, 2),
    axisA: { counts: homeAwayCounts, shares: homeAwayShares },
    axisC: {
      counts: quarterCounts,
      shares: quarterShares,
      lateWindowSeconds: LATE_SECONDS,
      late: { counts: lateCounts, shares: lateShares },
    },
  };

  mkdirSync("ml/data", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  /**
   * The published summary. Three verdicts and the league context they sit in — never a raw cell,
   * because the claim on the page is always "N officials past the bar against M expected", and a
   * page that quoted one official's z would be making the finding out of the noise.
   *
   * Shifters are the exception, and they are per-official on purpose: the quarter result is only
   * legible if a reader can see one. Gated at |z| >= 2 on either end of the game.
   */
  const shareRows = quarterShares.officials.filter((o) => (o.games as number) >= MIN_GAMES);
  const shifters = shareRows
    .filter((o) => isNotable(o.q1Z as number) || isNotable(o.q4Z as number))
    .map((o) => ({
      name: o.name as string,
      games: o.games as number,
      q1: o.q1 as number,
      q1Z: o.q1Z as number,
      q4: o.q4 as number,
      q4Z: o.q4Z as number,
      // Positive means fouls move from the start of the game toward the end of it.
      shift: round((o.q4 as number) - (o.q1 as number), 2),
    }))
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));

  const verdictOf = (t: ReturnType<typeof deviationTable>, metric: string) => {
    const v = t.verdict.find((x) => x.metric === metric)!;
    return { observed: v.observed, expected: v.expected, ratio: v.ratio };
  };

  writeFileSync(
    PUBLISHED_PATH,
    JSON.stringify(
      {
        source: "ESPN play-by-play",
        generated: report.generated,
        firstSeason: report.seasons[0],
        lastSeason: report.seasons[report.seasons.length - 1],
        gamesCovered: games.length,
        eligibleOfficials: quarterShares.eligibleOfficials,
        expectedByChance: quarterShares.expectedByChance,
        minGames: MIN_GAMES,
        notableZ: NOTABLE_Z,
        lateWindowSeconds: LATE_SECONDS,
        leagueQuarterShares: quarterShares.leagueMean,
        leagueLateFoulsPerGame: lateCounts.leagueMean.q4Late,
        leagueLateShareOfQ4: lateShares.leagueMean.q4Late,
        /** Home minus away, fouls per game. Negative means the home team commits fewer. */
        leagueHomeAwayCounts: homeAwayCounts.leagueMean,
        homeAway: Object.fromEntries(
          FOUL_KEYS.map((k) => [k, verdictOf(homeAwayShares, k)])
        ),
        byQuarter: Object.fromEntries(
          quarterMetrics.map((m) => [m, verdictOf(quarterShares, m)])
        ),
        lateWindow: verdictOf(lateShares, "q4Late"),
        shifters,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`\nwrote ${OUT_PATH} and ${PUBLISHED_PATH}`);
  for (const [axis, table] of [
    ["A counts", homeAwayCounts],
    ["A shares", homeAwayShares],
    ["C counts", quarterCounts],
    ["C shares", quarterShares],
    ["C late counts", lateCounts],
    ["C late shares", lateShares],
  ] as const) {
    const line = table.verdict
      .map((v) => `${v.metric} ${v.observed}/${v.expected} (${v.ratio}x)`)
      .join("  ");
    console.log(`${axis}: ${line}`);
  }
}

main();
