/**
 * ADVERSARIAL RE-CHECK of scripts/measure_rest_eras.ts and ml/data/rest_eras_report.txt.
 *
 * Read-only. Writes one report file and touches nothing else.
 *
 * Two independent passes:
 *   PASS A — pure arithmetic reproduction from the counts printed in rest_eras_report.txt,
 *            hardcoded below, with no DB access. If PASS A disagrees with the report the
 *            report's own arithmetic is wrong.
 *   PASS B — re-derive everything from the database with a hand-rolled classifier (NOT the
 *            imported one) as a cross-check, then compute the baseline variants the original
 *            report never tested: neutral-only, complement (leave-the-treated-out), and
 *            season-matched, plus ladders extended past |RA| >= 5.
 *
 * Usage: pnpm exec tsx scripts/verify_rest_eras_adversarial.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "@/lib/load-env-local";
import {
  classifyRestAdvantage,
  type HistoricalGameEvidenceRow,
} from "@/lib/rest-advantage-evidence";

const OUT_PATH = path.join(
  process.cwd(),
  "ml",
  "data",
  "rest_eras_adversarial_check.txt"
);

const out: string[] = [];
const say = (...lines: string[]) => out.push(...lines);
const f = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
const sg = (v: number, d = 4) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(d)}` : "n/a";
const ok = (b: boolean) => (b ? "REPRODUCES" : "*** MISMATCH ***");

/** two-sided-ish z against a fixed p0 */
function z(wins: number, n: number, p0: number): number {
  const p = wins / n;
  return (p - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}

// ───────────────────────────── PASS A: pure arithmetic ─────────────────────────────
// Counts transcribed from ml/data/rest_eras_report.txt.
const R = {
  population: 47143,
  neutral: 8195,
  decidable: 38948,
  homeRested: 27400,
  homeRestedWins: 16761,
  roadRested: 11548,
  roadRestedWins: 4894,
  homeWinsAll: 28248,
  roadWinsAll: 18895,
};

// per-season table, transcribed from rest_eras_report.txt:28-68 (season, games, homeWins)
const SEASON_TABLE: Array<[string, number, number]> = [
  ["1985-86", 943, 617],
  ["1986-87", 943, 627],
  ["1987-88", 943, 640],
  ["1988-89", 1025, 695],
  ["1989-90", 1107, 713],
  ["1990-91", 1107, 730],
  ["1991-92", 1107, 699],
  ["1992-93", 1107, 676],
  ["1993-94", 1107, 677],
  ["1994-95", 1107, 661],
  ["1995-96", 1189, 718],
  ["1996-97", 1189, 684],
  ["1997-98", 1189, 708],
  ["1998-99", 725, 452],
  ["1999-00", 1189, 726],
  ["2000-01", 1189, 711],
  ["2001-02", 1189, 703],
  ["2002-03", 1189, 747],
  ["2003-04", 1189, 730],
  ["2004-05", 1230, 744],
  ["2005-06", 1230, 742],
  ["2006-07", 1230, 727],
  ["2007-08", 1230, 739],
  ["2008-09", 1230, 748],
  ["2009-10", 1230, 731],
  ["2010-11", 1230, 743],
  ["2011-12", 990, 580],
  ["2012-13", 1229, 752],
  ["2013-14", 1230, 714],
  ["2014-15", 1230, 707],
  ["2015-16", 1230, 724],
  ["2016-17", 1230, 718],
  ["2017-18", 1230, 712],
  ["2018-19", 1230, 729],
  ["2019-20", 971, 535],
  ["2020-21", 1080, 587],
  ["2021-22", 1230, 669],
  ["2022-23", 1230, 714],
  ["2023-24", 1230, 668],
  ["2024-25", 1230, 669],
  ["2025-26", 1230, 682],
];

function passA(): void {
  say(
    "==========================================================================",
    "PASS A — pure arithmetic reproduction from the report's own printed counts",
    "==========================================================================",
    ""
  );

  const tGames = SEASON_TABLE.reduce((t, s) => t + s[1], 0);
  const tHome = SEASON_TABLE.reduce((t, s) => t + s[2], 0);
  say(
    `A1  per-season table sums: games ${tGames} (report says ${R.population})   ${ok(tGames === R.population)}`,
    `A1  per-season table sums: homeWins ${tHome} (report says ${R.homeWinsAll})   ${ok(tHome === R.homeWinsAll)}`,
    `A1  seasons listed ${SEASON_TABLE.length}   ${ok(SEASON_TABLE.length === 41)}`,
    ""
  );

  const homeBase = (R.homeWinsAll / R.population) * 100;
  const roadBase = (R.roadWinsAll / R.population) * 100;
  say(
    `A2  homeBaseline  ${f(homeBase)}  (report 59.9198)   ${ok(Math.abs(homeBase - 59.9198) < 5e-4)}`,
    `A2  roadBaseline  ${f(roadBase)}  (report 40.0802)   ${ok(Math.abs(roadBase - 40.0802) < 5e-4)}`,
    `A2  homeWins+roadWins = ${R.homeWinsAll + R.roadWinsAll}   ${ok(R.homeWinsAll + R.roadWinsAll === R.population)}`,
    ""
  );

  const observedWins = R.homeRestedWins + R.roadRestedWins;
  const observedRate = (observedWins / R.decidable) * 100;
  const expectedCount =
    (R.homeRested * homeBase + R.roadRested * roadBase) / 100;
  const expectedRate = (expectedCount / R.decidable) * 100;
  const pooledLift = observedRate - expectedRate;
  const homeRow = (R.homeRestedWins / R.homeRested) * 100;
  const roadRow = (R.roadRestedWins / R.roadRested) * 100;
  const homeLift = homeRow - homeBase;
  const roadLift = roadRow - roadBase;
  const cw = (R.homeRested * homeLift + R.roadRested * roadLift) / R.decidable;

  say(
    `A3  pooled observed wins ${observedWins}  rate ${f(observedRate)}  (report 55.5998)   ${ok(Math.abs(observedRate - 55.5998) < 5e-4)}`,
    `A3  expected count ${expectedCount.toFixed(4)}  (report 21046.4896)   ${ok(Math.abs(expectedCount - 21046.4896) < 5e-3)}`,
    `A3  POOLED NULL ${f(expectedRate)}  (report 54.0374)   ${ok(Math.abs(expectedRate - 54.0374) < 5e-4)}`,
    `A3  pooled null minus 50 = ${sg(expectedRate - 50)} pp  (report +4.0374)   ${ok(Math.abs(expectedRate - 50 - 4.0374) < 5e-4)}`,
    `A3  pooled lift ${sg(pooledLift)}  (report +1.5624)   ${ok(Math.abs(pooledLift - 1.5624) < 5e-4)}`,
    `A3  home row ${f(homeRow)} lift ${sg(homeLift)}  (report 61.1715 / +1.2517)`,
    `A3  road row ${f(roadRow)} lift ${sg(roadLift)}  (report 42.3796 / +2.2995)`,
    `A3  count-weighted avg of row lifts ${sg(cw)}  == pooled lift?   ${ok(Math.abs(cw - pooledLift) < 1e-9)}`,
    "",
    `A4  IS pooled lift smaller than BOTH row lifts?  pooled ${sg(pooledLift)} vs home ${sg(homeLift)} vs road ${sg(roadLift)}`,
    `A4  pooled > home row lift? ${pooledLift > homeLift ? "YES" : "no"}   (the deliverable prose claims it is smaller than EITHER row)`,
    `A4  a count-weighted average MUST lie between its two inputs, so 'smaller than either' is arithmetically impossible.`,
    ""
  );

  // "always bet home" on the very same decidable pool
  const homeWinsOnDecidable = R.homeRestedWins + (R.roadRested - R.roadRestedWins);
  say(
    "A5  COMPARATOR THE REPORT NEVER COMPUTES — 'always bet the home team' on the same games",
    `A5    home wins among the 38,948 decidable games = ${homeWinsOnDecidable}  = ${f((homeWinsOnDecidable / R.decidable) * 100)}%`,
    `A5    pooled 'more rested team'                   = ${observedWins}  = ${f(observedRate)}%`,
    `A5    pooling is WORSE than flat home betting on the identical pool by ${f((homeWinsOnDecidable / R.decidable) * 100 - observedRate)} pp`,
    `A5    home-only rule 61.1715% vs flat-home-on-decidable ${f((homeWinsOnDecidable / R.decidable) * 100)}% = ${sg(61.1715 - (homeWinsOnDecidable / R.decidable) * 100)} pp`,
    ""
  );

  // neutral-slice baseline, derivable from the printed counts alone
  const neutralHomeWins =
    R.homeWinsAll - R.homeRestedWins - (R.roadRested - R.roadRestedWins);
  say(
    "A6  NEUTRAL-SLICE BASELINE, derivable from the report's own counts (it never prints it)",
    `A6    home wins in neutral games = ${R.homeWinsAll} - ${R.homeRestedWins} - ${R.roadRested - R.roadRestedWins} = ${neutralHomeWins}`,
    `A6    neutral home win rate = ${neutralHomeWins}/${R.neutral} = ${f((neutralHomeWins / R.neutral) * 100)}%`,
    `A6    (task brief independently states 58.97% — ${ok(Math.abs((neutralHomeWins / R.neutral) * 100 - 58.97) < 0.02)})`,
    ""
  );
}

// ───────────────────────────── PASS B: DB re-derivation ─────────────────────────────

type Row = {
  season: string;
  d: number; // away - home fatigue
  side: "home" | "away" | "neutral";
  homeWon: boolean;
  restedWon: boolean;
};

type Slice = {
  label: string;
  rows: Row[];
};

function stats(rows: Row[]) {
  const games = rows.length;
  const homeWins = rows.filter((r) => r.homeWon).length;
  const home = rows.filter((r) => r.side === "home");
  const road = rows.filter((r) => r.side === "away");
  const neutral = rows.filter((r) => r.side === "neutral");
  const homeWins_home = home.filter((r) => r.homeWon).length; // == rested wins
  const homeWins_road = road.filter((r) => r.homeWon).length; // == rested losses
  const homeWins_neutral = neutral.filter((r) => r.homeWon).length;
  return {
    games,
    homeWins,
    roadWins: games - homeWins,
    home,
    road,
    neutral,
    homeRestedWins: homeWins_home,
    roadRestedWins: road.length - homeWins_road,
    neutralHomeWins: homeWins_neutral,
  };
}

async function passB(): Promise<void> {
  loadEnvLocal();
  const { getCompletedGamesWithFatigue } = await import("@/lib/db/queries");
  const raw: HistoricalGameEvidenceRow[] = await getCompletedGamesWithFatigue();

  let disagreements = 0;
  const all: Row[] = [];
  for (const r of raw) {
    if (r.homeScore === null || r.awayScore === null) continue;
    const hf = Number.parseFloat(r.homeFatigueScore);
    const af = Number.parseFloat(r.awayFatigueScore);
    // hand-rolled, deliberately not the imported helper
    const d = af - hf;
    const side: Row["side"] =
      Math.abs(d) < 0.5 ? "neutral" : d >= 0 ? "home" : "away";
    const imported = classifyRestAdvantage(hf, af);
    if (imported.advantageTeam !== side) disagreements++;
    const homeWon = r.homeScore > r.awayScore;
    all.push({
      season: r.season,
      d,
      side,
      homeWon,
      restedWon: side === "home" ? homeWon : !homeWon,
    });
  }

  const seasons = [...new Set(all.map((r) => r.season))].sort();
  const l10 = new Set(seasons.slice(-10));
  const l5 = new Set(seasons.slice(-5));
  const slices: Slice[] = [
    { label: "FULL (41 seasons)", rows: all },
    { label: "LAST 10", rows: all.filter((r) => l10.has(r.season)) },
    { label: "LAST 5", rows: all.filter((r) => l5.has(r.season)) },
    {
      label: "2002-03+ (harness slice)",
      rows: all.filter((r) => Number.parseInt(r.season.slice(0, 4), 10) >= 2002),
    },
  ];

  const s0 = stats(all);
  say(
    "==========================================================================",
    "PASS B — independent re-derivation from the database",
    "==========================================================================",
    "",
    `B0  hand-rolled classifier vs imported classifyRestAdvantage: ${disagreements} disagreements over ${all.length} games`,
    `B0  population ${s0.games} (report 47,143) ${ok(s0.games === 47143)}`,
    `B0  neutral ${s0.neutral.length} (8,195) ${ok(s0.neutral.length === 8195)}`,
    `B0  home-rested ${s0.home.length} (27,400) ${ok(s0.home.length === 27400)}   wins ${s0.homeRestedWins} (16,761) ${ok(s0.homeRestedWins === 16761)}`,
    `B0  road-rested ${s0.road.length} (11,548) ${ok(s0.road.length === 11548)}   wins ${s0.roadRestedWins} (4,894) ${ok(s0.roadRestedWins === 4894)}`,
    `B0  home wins all ${s0.homeWins} (28,248) ${ok(s0.homeWins === 28248)}`,
    ""
  );

  // ── B1: ladders extended past the report's top bar of 5 ──
  say(
    "--------------------------------------------------------------------------",
    "B1  ROAD LADDER EXTENDED — the report's LADDER stops at |RA| >= 5",
    "--------------------------------------------------------------------------"
  );
  const BARS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const s of slices) {
    const st = stats(s.rows);
    const roadBase = (st.roadWins / st.games) * 100;
    say("", `${s.label}   road baseline ${f(roadBase)}%`);
    for (const bar of BARS) {
      const b = st.road.filter((r) => Math.abs(r.d) >= bar);
      if (b.length === 0) continue;
      const w = b.filter((r) => r.restedWon).length;
      const p = (w / b.length) * 100;
      say(
        `  >=${String(bar).padStart(4)}  n=${String(b.length).padStart(6)}  wins=${String(w).padStart(6)}  ${f(p)}%  above50=${p > 50 ? "YES" : "no "}  z_vs50=${sg(z(w, b.length, 0.5), 2)}  liftVsRoadBase=${sg(p - roadBase, 2)}`
      );
    }
    const anyAbove = BARS.some((bar) => {
      const b = st.road.filter((r) => Math.abs(r.d) >= bar);
      return b.length > 0 && b.filter((r) => r.restedWon).length / b.length > 0.5;
    });
    say(`  -> ANY bar above 50% across the FULL ladder? ${anyAbove ? "YES" : "NO"}`);
  }

  // ── B2: baseline variants ──
  say(
    "",
    "--------------------------------------------------------------------------",
    "B2  BASELINE VARIANTS — the report uses only the self-contaminated pooled one",
    "--------------------------------------------------------------------------",
    "  variantA  pooled  : baseline over ALL era games (includes the treated games)  [the report]",
    "  variantB  neutral : baseline over |RA| < 0.5 games only (no rest signal by construction)",
    "  variantC  complement : each row vs the games NOT in that row (leave-the-treated-out)",
    "  variantD  season-matched pooled : every game vs its own season's pooled baseline",
    ""
  );

  for (const s of slices) {
    const st = stats(s.rows);
    const decidable = st.home.length + st.road.length;
    const observedWins = st.homeRestedWins + st.roadRestedWins;
    const observed = (observedWins / decidable) * 100;
    const homeRow = (st.homeRestedWins / st.home.length) * 100;
    const roadRow = (st.roadRestedWins / st.road.length) * 100;

    // A: pooled
    const A_home = (st.homeWins / st.games) * 100;
    const A_road = 100 - A_home;
    // B: neutral only
    const B_home = (st.neutralHomeWins / st.neutral.length) * 100;
    const B_road = 100 - B_home;
    // C: complement
    const C_home =
      ((st.homeWins - st.homeRestedWins) / (st.games - st.home.length)) * 100;
    const roadWinsInRoadRow = st.roadRestedWins;
    const C_road =
      ((st.roadWins - roadWinsInRoadRow) / (st.games - st.road.length)) * 100;

    const nulls = (bh: number, br: number) =>
      (st.home.length * bh + st.road.length * br) / 100 / decidable * 100;

    // D: season-matched
    let expD = 0;
    for (const season of [...new Set(s.rows.map((r) => r.season))]) {
      const sr = s.rows.filter((r) => r.season === season);
      const sst = stats(sr);
      const hb = sst.homeWins / sst.games;
      expD += sst.home.length * hb + sst.road.length * (1 - hb);
    }
    const D_null = (expD / decidable) * 100;

    say(
      `${s.label}`,
      `  decidable ${decidable}  observed ${f(observed)}%  homeRow ${f(homeRow)}%  roadRow ${f(roadRow)}%  homeMix ${f((st.home.length / decidable) * 100, 2)}%`,
      `  A pooled      homeBase ${f(A_home)}  roadBase ${f(A_road)}  ->  homeLift ${sg(homeRow - A_home)}  roadLift ${sg(roadRow - A_road)}  NULL ${f(nulls(A_home, A_road))}  pooledLift ${sg(observed - nulls(A_home, A_road))}`,
      `  B neutral     homeBase ${f(B_home)}  roadBase ${f(B_road)}  ->  homeLift ${sg(homeRow - B_home)}  roadLift ${sg(roadRow - B_road)}  NULL ${f(nulls(B_home, B_road))}  pooledLift ${sg(observed - nulls(B_home, B_road))}`,
      `  C complement  homeBase ${f(C_home)}  roadBase ${f(C_road)}  ->  homeLift ${sg(homeRow - C_home)}  roadLift ${sg(roadRow - C_road)}  NULL ${f(nulls(C_home, C_road))}  pooledLift ${sg(observed - nulls(C_home, C_road))}`,
      `  D seasonMatched pooled NULL ${f(D_null)}   pooledLift ${sg(observed - D_null)}`,
      `  which row has the BIGGER lift?  A: ${roadRow - A_road > homeRow - A_home ? "ROAD" : "HOME"}   B: ${roadRow - B_road > homeRow - B_home ? "ROAD" : "HOME"}   C: ${roadRow - C_road > homeRow - C_home ? "ROAD" : "HOME"}`,
      `  balanced(50/50) minus count-weighted:  A ${sg(((homeRow - A_home + roadRow - A_road) / 2) - (observed - nulls(A_home, A_road)))}   B ${sg(((homeRow - B_home + roadRow - B_road) / 2) - (observed - nulls(B_home, B_road)))}   C ${sg(((homeRow - C_home + roadRow - C_road) / 2) - (observed - nulls(C_home, C_road)))}`,
      `  home win rate on the DECIDABLE pool (flat-home comparator) ${f(((st.homeRestedWins + (st.road.length - st.roadRestedWins)) / decidable) * 100)}%`,
      ""
    );
  }

  // ── B3: attenuation identity ──
  say(
    "--------------------------------------------------------------------------",
    "B3  WHY variant A shrinks the two lifts by DIFFERENT amounts",
    "--------------------------------------------------------------------------",
    "  liftA = (1 - w) * liftC, where w = that row's share of the baseline population.",
    ""
  );
  for (const s of slices) {
    const st = stats(s.rows);
    const wHome = st.home.length / st.games;
    const wRoad = st.road.length / st.games;
    say(
      `  ${s.label}:  w_home ${f(wHome, 4)} -> attenuation ${f(1 - wHome, 4)} ;  w_road ${f(wRoad, 4)} -> attenuation ${f(1 - wRoad, 4)}  ;  ratio ${f((1 - wRoad) / (1 - wHome), 4)}x`
    );
  }

  // ── B4: significance of the headline claims ──
  say(
    "",
    "--------------------------------------------------------------------------",
    "B4  SIGNIFICANCE of the claims the report leans on",
    "--------------------------------------------------------------------------"
  );
  const full = stats(all);
  const fullHomeBase = full.homeWins / full.games;
  const fullNeutralBase = full.neutralHomeWins / full.neutral.length;
  say(
    `  home row vs pooled home baseline:      z=${sg(z(full.homeRestedWins, full.home.length, fullHomeBase), 3)}`,
    `  home row vs NEUTRAL home baseline:     z=${sg(z(full.homeRestedWins, full.home.length, fullNeutralBase), 3)}`,
    `  road row vs pooled road baseline:      z=${sg(z(full.roadRestedWins, full.road.length, 1 - fullHomeBase), 3)}`,
    `  road row vs NEUTRAL road baseline:     z=${sg(z(full.roadRestedWins, full.road.length, 1 - fullNeutralBase), 3)}`,
    ""
  );

  // ── B5: docblock currency check (rest-advantage-evidence.ts quotes 7,224 / 44.39% / 50.29% / 171) ──
  const harness = all.filter(
    (r) => Number.parseInt(r.season.slice(0, 4), 10) >= 2002
  );
  const hRoad = harness.filter((r) => r.side === "away");
  const hRoad5 = hRoad.filter((r) => Math.abs(r.d) >= 5);
  const hRoad3 = hRoad.filter((r) => Math.abs(r.d) >= 3);
  say(
    "--------------------------------------------------------------------------",
    "B5  DO THE FIGURES IN THE SHIPPED DOCBLOCK STILL REPRODUCE?",
    "    src/lib/rest-advantage-evidence.ts quotes: 7,224 calls @ 44.39%; 46.05% at edge 3;",
    "    'only reaches a coin flip at 50.29% by an edge of 5, which the schedule produces 171 times'",
    "--------------------------------------------------------------------------",
    `  2002-03+ road-rested calls now:  n=${hRoad.length}  wins=${hRoad.filter((r) => r.restedWon).length}  ${f((hRoad.filter((r) => r.restedWon).length / hRoad.length) * 100)}%   (docblock 7,224 @ 44.39%)`,
    `  edge >= 3 now:  n=${hRoad3.length}  ${f((hRoad3.filter((r) => r.restedWon).length / hRoad3.length) * 100)}%   (docblock 46.05%)`,
    `  edge >= 5 now:  n=${hRoad5.length}  ${f((hRoad5.filter((r) => r.restedWon).length / hRoad5.length) * 100)}%   (docblock 171 games @ 50.29%)`,
    ""
  );
}

async function main(): Promise<void> {
  say(
    "# Adversarial re-check of ml/data/rest_eras_report.txt",
    `generated ${new Date().toISOString()}`,
    ""
  );
  passA();
  await passB();
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, out.join("\n") + "\n", "utf8");
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
