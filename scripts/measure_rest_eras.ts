/**
 * Era structure of the rest-advantage result, and what pooling the two venue rows would do to it.
 *
 * Five questions, all over the published backtest population — `getCompletedGamesWithFatigue()`,
 * so `publishableGames()` (regular season, no abnormal stretch) plus final + both-scores-present
 * apply identically to every figure below. There is no second copy of the classification rule:
 * `classifyRestAdvantage` and `isCalledSide` are imported from the evidence module.
 *
 *   Q1  per-season home baseline, 1985-86 onward — the zero line a per-season chart needs.
 *   Q2  the road (declined) ladder in the last 10 and last 5 seasons, against each era's own
 *       ROAD baseline, derived as (games - homeWins)/games and never as 100 - homeWinPct.
 *   Q3  the home (called) row over the same eras, reporting LIFT next to the raw rate.
 *   Q4  the pooling question: what a single combined category would actually be measured against.
 *   Q5  whether a pooled headline hides a systematically losing sub-strategy.
 *
 * Percentages are four decimals from raw counts, not the site's rounded `winPct()`.
 *
 * The output goes to a file rather than stdout because this environment has masked numeric digits
 * in Bash output before, and every number here is one that matters.
 *
 * Read-only. Writes one report and touches nothing else.
 *
 * Usage:
 *   pnpm exec tsx scripts/measure_rest_eras.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "@/lib/load-env-local";
import {
  buildHistoricalBacktest,
  classifyRestAdvantage,
  isCalledSide,
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  type HistoricalGameEvidenceRow,
} from "@/lib/rest-advantage-evidence";

const OUT_PATH = path.join(process.cwd(), "ml", "data", "rest_eras_report.txt");

/** The neutral cutoff plus the site's published bars. */
const LADDER = [NEUTRAL_REST_ADVANTAGE_THRESHOLD, 2, 3, 5] as const;

type Scored = {
  season: string;
  differential: number;
  restedSide: "home" | "away" | "neutral";
  /** Only meaningful when `restedSide` is not neutral. */
  restedTeamWon: boolean;
  homeWon: boolean;
};

/** Four decimals, from raw counts. */
function pct(n: number, total: number): string {
  return total > 0 ? ((n / total) * 100).toFixed(4) : "n/a";
}

/** A rate as a number in percentage points, or NaN when the denominator is empty. */
function rate(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : Number.NaN;
}

function num(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

/** Explicit sign, so a lift of zero and a lift of +0.01 cannot be confused when scanning. */
function signed(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}`;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function section(title: string): string {
  return `\n${"=".repeat(94)}\n${title}\n${"=".repeat(94)}`;
}

/**
 * One era's venue baselines, over ALL its games — neutral included. The road baseline is derived
 * from its own counts rather than as `100 - homeWinPct`, which is what the task asks for and
 * which also keeps the two independently checkable.
 */
type EraBaselines = {
  label: string;
  seasons: string[];
  rows: Scored[];
  games: number;
  homeWins: number;
  roadWins: number;
  homeBaseline: number;
  roadBaseline: number;
};

function baselines(label: string, rows: Scored[]): EraBaselines {
  const homeWins = rows.filter((r) => r.homeWon).length;
  const roadWins = rows.length - homeWins;
  return {
    label,
    seasons: [...new Set(rows.map((r) => r.season))].sort(),
    rows,
    games: rows.length,
    homeWins,
    roadWins,
    homeBaseline: rate(homeWins, rows.length),
    roadBaseline: rate(roadWins, rows.length),
  };
}

/** One rung of a ladder: the rested-team win rate at a rest-edge bar, and its lift vs a baseline. */
function ladderRow(
  bar: number,
  bucket: Scored[],
  baseline: number
): string {
  const wins = bucket.filter((r) => r.restedTeamWon).length;
  const r = rate(wins, bucket.length);
  return (
    `  |RA| >= ${pad(bar, 3)}   n=${pad(bucket.length.toLocaleString(), 7)}` +
    `   restedWins=${pad(wins.toLocaleString(), 7)}` +
    `   restedWin%=${pad(num(r), 9)}` +
    `   baseline=${pad(num(baseline), 8)}` +
    `   LIFT=${pad(signed(r - baseline), 9)} pp` +
    `   vs50=${pad(signed(r - 50), 9)} pp`
  );
}

/** Everything the pooling question needs for one era. */
type Pooled = {
  era: EraBaselines;
  decidable: number;
  homeRested: number;
  roadRested: number;
  homeRestedWins: number;
  roadRestedWins: number;
  homeRow: number;
  roadRow: number;
  homeLift: number;
  roadLift: number;
  observedWins: number;
  observedRate: number;
  expectedCount: number;
  expectedRate: number;
  pooledLift: number;
  balancedLift: number;
  homeShare: number;
};

function pooled(era: EraBaselines): Pooled {
  const decided = era.rows.filter((r) => r.restedSide !== "neutral");
  const home = decided.filter((r) => isCalledSide(r.restedSide));
  const road = decided.filter((r) => r.restedSide === "away");
  const homeRestedWins = home.filter((r) => r.restedTeamWon).length;
  const roadRestedWins = road.filter((r) => r.restedTeamWon).length;

  const homeRow = rate(homeRestedWins, home.length);
  const roadRow = rate(roadRestedWins, road.length);
  const homeLift = homeRow - era.homeBaseline;
  const roadLift = roadRow - era.roadBaseline;

  const observedWins = homeRestedWins + roadRestedWins;
  const observedRate = rate(observedWins, decided.length);

  // Venue-mix-weighted expectation: if rest did nothing and only the building mattered.
  const expectedCount =
    (home.length * era.homeBaseline + road.length * era.roadBaseline) / 100;
  const expectedRate = rate(expectedCount, decided.length);

  return {
    era,
    decidable: decided.length,
    homeRested: home.length,
    roadRested: road.length,
    homeRestedWins,
    roadRestedWins,
    homeRow,
    roadRow,
    homeLift,
    roadLift,
    observedWins,
    observedRate,
    expectedCount,
    expectedRate,
    pooledLift: observedRate - expectedRate,
    balancedLift: (homeLift + roadLift) / 2,
    homeShare: rate(home.length, decided.length),
  };
}

async function main(): Promise<void> {
  loadEnvLocal();

  // Dynamic import so `.env.local` is merged before the db module reads DATABASE_URL.
  const { getCompletedGamesWithFatigue } = await import("@/lib/db/queries");
  const rows: HistoricalGameEvidenceRow[] = await getCompletedGamesWithFatigue();

  const all: Scored[] = [];
  for (const row of rows) {
    if (row.homeScore === null || row.awayScore === null) continue;
    const ra = classifyRestAdvantage(
      Number.parseFloat(row.homeFatigueScore),
      Number.parseFloat(row.awayFatigueScore)
    );
    const homeWon = row.homeScore > row.awayScore;
    all.push({
      season: row.season,
      differential: ra.differential,
      restedSide: ra.advantageTeam,
      restedTeamWon: isCalledSide(ra.advantageTeam) ? homeWon : !homeWon,
      homeWon,
    });
  }

  const seasons = [...new Set(all.map((r) => r.season))].sort();
  const full = baselines(`FULL POPULATION (${seasons.length} seasons)`, all);
  const last10Seasons = new Set(seasons.slice(-10));
  const last5Seasons = new Set(seasons.slice(-5));
  const era10 = baselines(
    "LAST 10 SEASONS",
    all.filter((r) => last10Seasons.has(r.season))
  );
  const era5 = baselines(
    "LAST 5 SEASONS",
    all.filter((r) => last5Seasons.has(r.season))
  );

  // ── Self-check against the shipped reducer ──────────────────────────────
  const shipped = buildHistoricalBacktest(rows);
  const decidedAll = all.filter((r) => r.restedSide !== "neutral");
  const homeAll = decidedAll.filter((r) => isCalledSide(r.restedSide));
  const roadAll = decidedAll.filter((r) => r.restedSide === "away");

  const out: string[] = [
    "# Rest advantage by era, and what pooling the two venue rows would measure against",
    "",
    `generated              ${new Date().toISOString()}`,
    "script                 scripts/measure_rest_eras.ts",
    "source                 getCompletedGamesWithFatigue()  (publishableGames + final + both scores)",
    "classification         classifyRestAdvantage / isCalledSide  (imported, not reimplemented)",
    `neutral cutoff         |RA| < ${NEUTRAL_REST_ADVANTAGE_THRESHOLD} is no call`,
    "percentages            4 decimals, from raw counts (not the site's rounded winPct)",
    "",
    "## Self-check against the shipped backtest reducer",
    `  population (scored)            ${all.length.toLocaleString()}`,
    `  neutral (|RA| < 0.5)           ${(all.length - decidedAll.length).toLocaleString()}`,
    `  decidable                      ${decidedAll.length.toLocaleString()}`,
    `  home-rested (published)        ${homeAll.length.toLocaleString()}   shipped totalGames ${shipped.totalGames.toLocaleString()}   match ${homeAll.length === shipped.totalGames ? "YES" : "NO"}`,
    `  road-rested (not published)    ${roadAll.length.toLocaleString()}   shipped awayTeamMoreRested ${shipped.homeAwayBreakdown.awayTeamMoreRested.games.toLocaleString()}   match ${roadAll.length === shipped.homeAwayBreakdown.awayTeamMoreRested.games ? "YES" : "NO"}`,
    `  home-rested won                ${homeAll.filter((r) => r.restedTeamWon).length.toLocaleString()}  = ${pct(homeAll.filter((r) => r.restedTeamWon).length, homeAll.length)}%   shipped ${shipped.overallWinRate}%`,
    `  road-rested won                ${roadAll.filter((r) => r.restedTeamWon).length.toLocaleString()}  = ${pct(roadAll.filter((r) => r.restedTeamWon).length, roadAll.length)}%   shipped ${shipped.homeAwayBreakdown.awayTeamMoreRested.winPct}%`,
    `  seasons                        ${seasons.length}  (${seasons[0]} .. ${seasons[seasons.length - 1]})`,
  ];

  // ── Q1: per-season home baseline ────────────────────────────────────────
  out.push(
    section("Q1 — PER-SEASON HOME BASELINE (the zero line a per-season chart needs)"),
    "",
    "Population is identical to the backtest population, neutral games included: this is the",
    "home win rate of every game the site could publish, not of the called subset.",
    "",
    "  season      games   homeWins   homeWin%     roadWins   roadWin%"
  );

  type SeasonRow = { season: string; games: number; homeWins: number; homeRate: number };
  const perSeason: SeasonRow[] = seasons.map((season) => {
    const bucket = all.filter((r) => r.season === season);
    const homeWins = bucket.filter((r) => r.homeWon).length;
    return {
      season,
      games: bucket.length,
      homeWins,
      homeRate: rate(homeWins, bucket.length),
    };
  });

  for (const s of perSeason) {
    out.push(
      `  ${s.season}  ${pad(s.games.toLocaleString(), 6)}   ${pad(
        s.homeWins.toLocaleString(),
        8
      )}   ${pad(num(s.homeRate), 8)}     ${pad(
        (s.games - s.homeWins).toLocaleString(),
        8
      )}   ${pad(num(rate(s.games - s.homeWins, s.games)), 8)}`
    );
  }

  const spread = (label: string, list: SeasonRow[]): string[] => {
    const sorted = [...list].sort((a, b) => a.homeRate - b.homeRate);
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const games = list.reduce((t, s) => t + s.games, 0);
    const wins = list.reduce((t, s) => t + s.homeWins, 0);
    const mean = list.reduce((t, s) => t + s.homeRate, 0) / list.length;
    return [
      "",
      `  ${label}  (${list.length} seasons, ${list[0]!.season} .. ${list[list.length - 1]!.season})`,
      `    pooled home win%             ${num(rate(wins, games))}   (${wins.toLocaleString()} / ${games.toLocaleString()})`,
      `    mean of season rates         ${num(mean)}`,
      `    MIN season                   ${min.season}  ${num(min.homeRate)}   (n=${min.games.toLocaleString()})`,
      `    MAX season                   ${max.season}  ${num(max.homeRate)}   (n=${max.games.toLocaleString()})`,
      `    RANGE (max - min)            ${num(max.homeRate - min.homeRate)} pp`,
      `    first season                 ${first.season}  ${num(first.homeRate)}`,
      `    last season                  ${last.season}  ${num(last.homeRate)}`,
      `    last minus first             ${signed(last.homeRate - first.homeRate)} pp`,
    ];
  };

  out.push(
    ...spread("ALL SEASONS", perSeason),
    ...spread("LAST 10 SEASONS", perSeason.slice(-10)),
    ...spread("LAST 5 SEASONS", perSeason.slice(-5)),
    "",
    "  => A per-season chart cannot use one flat zero line: the home baseline itself moves by",
    "     the amount printed as RANGE above, which is the same order as the effect being charted."
  );

  // ── Q2 / Q3: the two rows by era ────────────────────────────────────────
  const eras = [full, era10, era5];

  out.push(
    section("Q2 — ROAD LADDER (the declined half), by era, against that era's ROAD baseline")
  );
  for (const era of eras) {
    const road = era.rows.filter((r) => r.restedSide === "away");
    out.push(
      "",
      `${era.label}  (${era.seasons[0]} .. ${era.seasons[era.seasons.length - 1]})`,
      `  era games ${era.games.toLocaleString()}   homeWins ${era.homeWins.toLocaleString()}   roadWins ${era.roadWins.toLocaleString()}`,
      `  HOME baseline ${num(era.homeBaseline)}   ROAD baseline (games - homeWins)/games = ${num(era.roadBaseline)}`,
      `  road-rested (rested team is the VISITOR) games ${road.length.toLocaleString()}`
    );
    for (const bar of LADDER) {
      out.push(
        ladderRow(bar, road.filter((r) => Math.abs(r.differential) >= bar), era.roadBaseline)
      );
    }
    const rescuedVs50 = LADDER.some((bar) => {
      const b = road.filter((r) => Math.abs(r.differential) >= bar);
      return b.length > 0 && rate(b.filter((r) => r.restedTeamWon).length, b.length) > 50;
    });
    const rescuedVsBaseline = LADDER.some((bar) => {
      const b = road.filter((r) => Math.abs(r.differential) >= bar);
      return (
        b.length > 0 &&
        rate(b.filter((r) => r.restedTeamWon).length, b.length) > era.roadBaseline
      );
    });
    out.push(
      `  -> any bar above 50%?              ${rescuedVs50 ? "YES" : "NO"}`,
      `  -> any bar above the ROAD baseline? ${rescuedVsBaseline ? "YES" : "NO"}`
    );
  }

  out.push(
    section("Q3 — HOME ROW (the published half), by era, against that era's HOME baseline")
  );
  for (const era of eras) {
    const home = era.rows.filter((r) => isCalledSide(r.restedSide));
    out.push(
      "",
      `${era.label}  (${era.seasons[0]} .. ${era.seasons[era.seasons.length - 1]})`,
      `  HOME baseline ${num(era.homeBaseline)}   (${era.homeWins.toLocaleString()} / ${era.games.toLocaleString()})`,
      `  home-rested games ${home.length.toLocaleString()}`
    );
    for (const bar of LADDER) {
      out.push(
        ladderRow(bar, home.filter((r) => Math.abs(r.differential) >= bar), era.homeBaseline)
      );
    }
  }

  out.push(
    "",
    "  RAW RATE vs LIFT, side by side at each bar — the comparison the question asks for:",
    "  bar        FULL raw    FULL lift     L10 raw     L10 lift      L5 raw      L5 lift"
  );
  for (const bar of LADDER) {
    const cell = (era: EraBaselines) => {
      const b = era.rows.filter(
        (r) => isCalledSide(r.restedSide) && Math.abs(r.differential) >= bar
      );
      const r = rate(b.filter((x) => x.restedTeamWon).length, b.length);
      return { raw: r, lift: r - era.homeBaseline };
    };
    const f = cell(full);
    const t = cell(era10);
    const v = cell(era5);
    out.push(
      `  >= ${pad(bar, 3)}   ${pad(num(f.raw), 9)}   ${pad(signed(f.lift), 9)}   ${pad(
        num(t.raw),
        9
      )}   ${pad(signed(t.lift), 9)}   ${pad(num(v.raw), 9)}   ${pad(signed(v.lift), 9)}`
    );
  }

  // ── Q4: the pooling question ────────────────────────────────────────────
  const pFull = pooled(full);
  const p10 = pooled(era10);
  const p5 = pooled(era5);

  out.push(
    section("Q4 — THE POOLING QUESTION: what would a single combined category be measured against?")
  );
  out.push(
    "",
    "(a) POOLED OBSERVED — both rows together, how often did the more rested team win?",
    `    decidable games              ${pFull.decidable.toLocaleString()}`,
    `      home-rested                ${pFull.homeRested.toLocaleString()}  won ${pFull.homeRestedWins.toLocaleString()}`,
    `      road-rested                ${pFull.roadRested.toLocaleString()}  won ${pFull.roadRestedWins.toLocaleString()}`,
    `    more rested team won         ${pFull.observedWins.toLocaleString()}`,
    `    POOLED OBSERVED RATE         ${num(pFull.observedRate)}%`,
    "",
    "(b) POOLED NULL — expected if rest did NOTHING and only the venue mattered",
    "    expected = (homeRestedGames x homeBaseline + roadRestedGames x roadBaseline) / decidable",
    `    homeBaseline                 ${num(full.homeBaseline)}%   (${full.homeWins.toLocaleString()} / ${full.games.toLocaleString()})`,
    `    roadBaseline                 ${num(full.roadBaseline)}%   (${full.roadWins.toLocaleString()} / ${full.games.toLocaleString()})`,
    `    expected wins (count)        ${pFull.expectedCount.toFixed(4)}`,
    `      = ${pFull.homeRested.toLocaleString()} x ${num(full.homeBaseline)}% + ${pFull.roadRested.toLocaleString()} x ${num(full.roadBaseline)}%`,
    `      = ${((pFull.homeRested * full.homeBaseline) / 100).toFixed(4)} + ${((pFull.roadRested * full.roadBaseline) / 100).toFixed(4)}`,
    `    POOLED NULL RATE             ${num(pFull.expectedRate)}%`,
    "",
    "(c) POOLED LIFT = observed - expected",
    `    pooled lift                  ${signed(pFull.pooledLift)} pp`,
    `    home-row lift                ${signed(pFull.homeLift)} pp   (raw ${num(pFull.homeRow)}% vs home baseline ${num(full.homeBaseline)}%)`,
    `    road-row lift                ${signed(pFull.roadLift)} pp   (raw ${num(pFull.roadRow)}% vs road baseline ${num(full.roadBaseline)}%)`,
    "    identity check — pooled lift must equal the COUNT-weighted average of the two row lifts:",
    `      count-weighted average     ${signed((pFull.homeRested * pFull.homeLift + pFull.roadRested * pFull.roadLift) / pFull.decidable)} pp`,
    "",
    "(d) IS THE POOLED NULL 50%?",
    `    pooled null                  ${num(pFull.expectedRate)}%`,
    `    distance from 50             ${signed(pFull.expectedRate - 50)} pp`,
    `    answer                       ${Math.abs(pFull.expectedRate - 50) < 0.01 ? "yes, within 0.01 pp" : "NO"}`,
    "",
    "(e) WHY IT IS NOT 50 — the venue mix, and what happens when the mix and baselines change",
    `    share of decidable games with the rested team AT HOME   ${num(pFull.homeShare)}%   (${pFull.homeRested.toLocaleString()} / ${pFull.decidable.toLocaleString()})`,
    `    share with the rested team ON THE ROAD                  ${num(rate(pFull.roadRested, pFull.decidable))}%   (${pFull.roadRested.toLocaleString()} / ${pFull.decidable.toLocaleString()})`,
    "    The pool is 70/30 toward the home side, and the home side wins ~60% of everything, so a",
    "    pooled 'more rested team' bet inherits most of home court before rest says a word.",
    "",
    "    era          decidable   home%mix    homeBase    roadBase   POOLED NULL   POOLED OBS   POOLED LIFT"
  );
  for (const p of [pFull, p10, p5]) {
    out.push(
      `    ${pad(p.era.label.replace(" SEASONS", "").replace(/ \(.*\)/, ""), 11)}  ${pad(
        p.decidable.toLocaleString(),
        9
      )}   ${pad(num(p.homeShare, 2), 8)}   ${pad(num(p.era.homeBaseline, 2), 9)}   ${pad(
        num(p.era.roadBaseline, 2),
        9
      )}   ${pad(num(p.expectedRate, 2), 11)}   ${pad(num(p.observedRate, 2), 10)}   ${pad(
        signed(p.pooledLift, 2),
        11
      )}`
    );
  }
  out.push(
    "",
    "    same three eras in full precision:"
  );
  for (const p of [pFull, p10, p5]) {
    out.push(
      `      ${p.era.label}`,
      `        decidable ${p.decidable.toLocaleString()}   homeRested ${p.homeRested.toLocaleString()}   roadRested ${p.roadRested.toLocaleString()}`,
      `        homeBaseline ${num(p.era.homeBaseline)}   roadBaseline ${num(p.era.roadBaseline)}`,
      `        expected wins ${p.expectedCount.toFixed(4)}   POOLED NULL ${num(p.expectedRate)}%   (50 ${signed(p.expectedRate - 50)} pp)`,
      `        observed wins ${p.observedWins.toLocaleString()}   POOLED OBS  ${num(p.observedRate)}%`,
      `        POOLED LIFT ${signed(p.pooledLift)} pp`
    );
  }

  out.push(
    "",
    "(f) A FAIRER POOLED FRAMING — venue-balanced lift (the two row lifts averaged 50/50,",
    "    rather than weighted by how many games each row happens to contain)",
    "",
    "    era          homeLift     roadLift    BALANCED (50/50)   COUNT-WEIGHTED (= c)   difference"
  );
  for (const p of [pFull, p10, p5]) {
    out.push(
      `    ${pad(p.era.label.replace(" SEASONS", "").replace(/ \(.*\)/, ""), 11)}  ${pad(
        signed(p.homeLift, 2),
        9
      )}   ${pad(signed(p.roadLift, 2), 9)}   ${pad(signed(p.balancedLift, 2), 16)}   ${pad(
        signed(p.pooledLift, 2),
        20
      )}   ${pad(signed(p.balancedLift - p.pooledLift, 2), 10)}`
    );
  }
  out.push(
    "",
    "    full precision, full population:",
    `      home-row lift              ${signed(pFull.homeLift)} pp`,
    `      road-row lift              ${signed(pFull.roadLift)} pp`,
    `      BALANCED (equal weight)    ${signed(pFull.balancedLift)} pp`,
    `      count-weighted (c)         ${signed(pFull.pooledLift)} pp`,
    `      balanced minus (c)         ${signed(pFull.balancedLift - pFull.pooledLift)} pp`
  );

  // ── Q5: does pooling hide losing picks ──────────────────────────────────
  const roadLosses = pFull.roadRested - pFull.roadRestedWins;
  const withoutRoadWins = pFull.homeRestedWins;
  const withoutRoadGames = pFull.homeRested;

  out.push(
    section("Q5 — DOES POOLING HIDE A LOSING SUB-STRATEGY?")
  );
  out.push(
    "",
    "A pooled headline advertises one instruction: 'back the more rested team'. Following it on",
    "every decidable game means placing every road-rested pick below as well.",
    "",
    `  pooled picks made                      ${pFull.decidable.toLocaleString()}`,
    `  pooled correct                         ${pFull.observedWins.toLocaleString()}`,
    `  POOLED ACCURACY (with road picks)      ${num(pFull.observedRate)}%`,
    "",
    `  road-rested picks made                 ${pFull.roadRested.toLocaleString()}   (${num(rate(pFull.roadRested, pFull.decidable))}% of all pooled picks)`,
    `  road-rested picks that WON             ${pFull.roadRestedWins.toLocaleString()}   = ${num(pFull.roadRow)}%`,
    `  road-rested picks that LOST            ${roadLosses.toLocaleString()}   = ${num(rate(roadLosses, pFull.roadRested))}%`,
    `  is that sub-strategy a net loser?       ${pFull.roadRow < 50 ? `YES — it loses ${roadLosses.toLocaleString()} of ${pFull.roadRested.toLocaleString()}, a losing record by ${num(50 - pFull.roadRow)} pp` : "no"}`,
    `  net units at even money (wins - losses) ${(pFull.roadRestedWins - roadLosses).toLocaleString()}`,
    "",
    `  POOLED ACCURACY (road picks removed)   ${num(rate(withoutRoadWins, withoutRoadGames))}%   (${withoutRoadWins.toLocaleString()} / ${withoutRoadGames.toLocaleString()})`,
    `  cost of pooling                        ${signed(pFull.observedRate - rate(withoutRoadWins, withoutRoadGames))} pp`,
    "",
    "  the same, last 10 and last 5 seasons:"
  );
  for (const p of [p10, p5]) {
    const losses = p.roadRested - p.roadRestedWins;
    out.push(
      `    ${p.era.label}`,
      `      pooled accuracy (with road)   ${num(p.observedRate)}%   (${p.observedWins.toLocaleString()} / ${p.decidable.toLocaleString()})`,
      `      road picks ${p.roadRested.toLocaleString()}  won ${p.roadRestedWins.toLocaleString()} (${num(p.roadRow)}%)  LOST ${losses.toLocaleString()}`,
      `      pooled accuracy (road removed) ${num(rate(p.homeRestedWins, p.homeRested))}%   (${p.homeRestedWins.toLocaleString()} / ${p.homeRested.toLocaleString()})`
    );
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, out.join("\n") + "\n", "utf8");
  console.log(`[measure] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
