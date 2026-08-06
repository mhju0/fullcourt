/**
 * Measures the half of the schedule the site declines — the games where the *visitor* is the
 * more rested team — over exactly the population the published backtest reads.
 *
 * Why this exists: `src/lib/rest-advantage-evidence.ts`, ADR 0006 and
 * `/behind-the-data/rest-advantage` publish "44.39% across 7,224 calls" for rested visitors,
 * while the live `/api/analysis` reports 11,548 such games. Those two denominators describe
 * different populations and neither surface says which. This script re-derives every one of
 * those figures from one source so the answer stops being a matter of belief.
 *
 * It reads through `getCompletedGamesWithFatigue()` — the same query `buildHistoricalBacktest`
 * is fed by, so `publishableGames()` (regular season, no abnormal stretch) and the final +
 * both-scores-present predicates apply identically. There is deliberately no second copy of
 * the classification rule here: `classifyRestAdvantage`, `isCalledSide` and the neutral cutoff
 * are imported from the evidence module.
 *
 * Percentages are computed to four decimals from raw counts rather than through
 * `winPct()`, which rounds to the one decimal the site publishes. The archived probe this
 * reconciles against (`ml/data/away_fix_probe.txt`) quotes four, and a one-decimal answer
 * cannot be compared with it.
 *
 * The output goes to a file rather than stdout because this environment has masked numeric
 * digits in Bash output before, and every number here is one that matters.
 *
 * Usage:
 *   pnpm exec tsx scripts/measure_uncalled_half.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "@/lib/load-env-local";
import {
  classifyRestAdvantage,
  isCalledSide,
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  type HistoricalGameEvidenceRow,
} from "@/lib/rest-advantage-evidence";

const OUT_PATH = path.join(process.cwd(), "ml", "data", "uncalled_half_report.txt");

/**
 * The thresholds the site's own backtest buckets by (2, 3, 5, 7), plus the neutral cutoff and
 * the odd integers between them. The intermediate ones are here because the published claim is
 * that *no* threshold rescues a rested visitor, and 2/3/5/7 alone leaves gaps that claim has to
 * span.
 */
const THRESHOLDS = [NEUTRAL_REST_ADVANTAGE_THRESHOLD, 1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The harness floor. `ml/fit_fatigue_weights.py:39` sets `TRAIN_FLOOR = 2002` and applies it at
 * line 142, so every figure that came out of the fitting harness — including the ones on the
 * methodology page — describes 2002-03 onward only. The site's own population starts 1985-86.
 * Reported side by side so the gap between the two published denominators is attributed rather
 * than guessed at.
 */
const HARNESS_SEASON_FLOOR = 2002;

/**
 * Home-court bars for the venue-aware counterfactual. 3.04 is the value the archived probe
 * used ("The home-court bar in rest-advantage units: 3.04",
 * `ml/data/away_fix_probe.txt:1`); the rest bracket it.
 */
const HOME_BARS = [0, 1, 2, 2.5, 3, 3.04, 3.5, 4, 5] as const;

type Scored = {
  season: string;
  seasonStart: number;
  differential: number;
  /** `"neutral"` means below the cutoff — the site makes no call, but the venue-aware rule still can. */
  restedTeamSide: "home" | "away" | "neutral";
  restedTeamWon: boolean;
  homeWon: boolean;
};

type Decided = Scored & { restedTeamSide: "home" | "away" };

/** Four decimals, from raw counts. Never the site's rounded `winPct`. */
function pct(n: number, total: number): string {
  return total > 0 ? ((n / total) * 100).toFixed(4) : "n/a";
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function section(title: string): string {
  return `\n${"=".repeat(86)}\n${title}\n${"=".repeat(86)}`;
}

function tally(rows: Decided[], won: (r: Decided) => boolean) {
  const wins = rows.filter(won).length;
  return { n: rows.length, wins, losses: rows.length - wins };
}

/**
 * Rested-visitor and home-rested breakdowns for one season slice.
 *
 * `all` is every scored game in the slice, neutral included. Sections (a)–(d) narrow it to the
 * decided games, because those are the ones the site classifies. Section (e) deliberately does
 * not: adding a home-court bar to the rest edge pulls almost every neutral game over the line
 * as a home call, and that is exactly where the published "covers 96.5% of games" comes from.
 */
function report(all: Scored[], title: string): string[] {
  const out: string[] = [section(title)];

  const scored = all.length;
  const rows = all.filter((r): r is Decided => r.restedTeamSide !== "neutral");
  const away = rows.filter((r) => r.restedTeamSide === "away");
  const home = rows.filter((r) => r.restedTeamSide === "home");

  out.push(
    "",
    `scored games in slice        ${scored.toLocaleString()}`,
    `neutral (|RA| < ${NEUTRAL_REST_ADVANTAGE_THRESHOLD})           ${(scored - rows.length).toLocaleString()}`,
    `decided (non-neutral)        ${rows.length.toLocaleString()}   (${pct(rows.length, scored)}% of scored)`,
    `home-rested  (CALLED)        ${home.length.toLocaleString()}`,
    `away-rested  (DECLINED)      ${away.length.toLocaleString()}`
  );

  const fmt = (label: string, bucket: Decided[]) => {
    const t = tally(bucket, (r) => r.restedTeamWon);
    return (
      `  ${label.padEnd(14)} n=${pad(t.n.toLocaleString(), 8)}` +
      `  restedWins=${pad(t.wins.toLocaleString(), 8)}` +
      `  restedWin%=${pad(pct(t.wins, t.n), 9)}` +
      `  otherSideWin%=${pad(pct(t.losses, t.n), 9)}`
    );
  };

  out.push("", "(a)/(b) RESTED VISITOR — the declined half, by rest-edge threshold");
  for (const t of THRESHOLDS) {
    out.push(fmt(`|RA| >= ${t}`, away.filter((r) => Math.abs(r.differential) >= t)));
  }

  out.push("", "(c) HOME RESTED — the called half, by rest-edge threshold");
  for (const t of THRESHOLDS) {
    out.push(fmt(`|RA| >= ${t}`, home.filter((r) => Math.abs(r.differential) >= t)));
  }

  out.push("", "(d) COUNTERFACTUAL — call every decided game, pick the more rested team");
  const cf = tally(rows, (r) => r.restedTeamWon);
  const road = tally(away, (r) => r.restedTeamWon);
  out.push(
    `  games called                 ${cf.n.toLocaleString()}`,
    `  coverage of scored games     ${pct(cf.n, scored)}%`,
    `  correct calls                ${cf.wins.toLocaleString()}`,
    `  accuracy                     ${pct(cf.wins, cf.n)}%`,
    `  road (visitor) calls made    ${road.n.toLocaleString()}  at ${pct(road.wins, road.n)}%`,
    `  road calls that LOST         ${road.losses.toLocaleString()}`
  );

  out.push(
    "",
    "(e) COUNTERFACTUAL — venue-aware: margin = RA + homeBar, call when |margin| >= 0.5",
    "    (this is the rule the published 'adding home court and letting it decide' sentence describes;",
    "     it runs over EVERY scored game, neutral included — that is where 96.5% coverage comes from)",
    "  homeBar    calls   coverage%   correct   accuracy%   homeCalls  homeHit%    awayCalls  awayHit%   awayLOSSES"
  );
  for (const bar of HOME_BARS) {
    let calls = 0;
    let correct = 0;
    let homeCalls = 0;
    let homeWins = 0;
    let awayCalls = 0;
    let awayWins = 0;
    // `differential` is away − home, so it is already positive when the home side is fresher.
    for (const g of all) {
      const margin = g.differential + bar;
      if (Math.abs(margin) < NEUTRAL_REST_ADVANTAGE_THRESHOLD) continue;
      calls++;
      const pickHome = margin >= 0;
      const won = pickHome ? g.homeWon : !g.homeWon;
      if (won) correct++;
      if (pickHome) {
        homeCalls++;
        if (won) homeWins++;
      } else {
        awayCalls++;
        if (won) awayWins++;
      }
    }
    out.push(
      `  ${pad(bar.toFixed(2), 7)}  ${pad(calls.toLocaleString(), 8)}  ${pad(
        pct(calls, scored),
        10
      )}  ${pad(correct.toLocaleString(), 8)}  ${pad(pct(correct, calls), 10)}  ${pad(
        homeCalls.toLocaleString(),
        10
      )}  ${pad(pct(homeWins, homeCalls), 9)}  ${pad(
        awayCalls.toLocaleString(),
        10
      )}  ${pad(pct(awayWins, awayCalls), 9)}  ${pad(
        (awayCalls - awayWins).toLocaleString(),
        11
      )}`
    );
  }

  return out;
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
      seasonStart: Number.parseInt(row.season.slice(0, 4), 10),
      differential: ra.differential,
      restedTeamSide: ra.advantageTeam,
      restedTeamWon: isCalledSide(ra.advantageTeam) ? homeWon : !homeWon,
      homeWon,
    });
  }

  const scoredGames = all.length;
  const neutral = all.filter((r) => r.restedTeamSide === "neutral").length;
  const decided = all.filter(
    (r): r is Decided => r.restedTeamSide !== "neutral"
  );
  const seasons = [...new Set(all.map((r) => r.season))].sort();
  const out: string[] = [
    "# The declined half: rested visitors, measured over the published backtest population",
    "",
    `generated              ${new Date().toISOString()}`,
    "source                 getCompletedGamesWithFatigue()  (publishableGames + final + both scores)",
    "classification         classifyRestAdvantage / isCalledSide  (imported, not reimplemented)",
    `neutral cutoff         |RA| < ${NEUTRAL_REST_ADVANTAGE_THRESHOLD} is no call`,
    "",
    `rows returned          ${rows.length.toLocaleString()}`,
    `with both scores       ${scoredGames.toLocaleString()}`,
    `neutral (no call)      ${neutral.toLocaleString()}`,
    `decided                ${decided.length.toLocaleString()}`,
    `seasons                ${seasons.length}  (${seasons[0]} .. ${seasons[seasons.length - 1]})`,
  ];

  out.push(...report(all, "FULL POPULATION — every season the site publishes"));

  const harness = all.filter((r) => r.seasonStart >= HARNESS_SEASON_FLOOR);
  const harnessSeasons = [...new Set(harness.map((r) => r.season))].sort();
  out.push(
    ...report(
      harness,
      `HARNESS SLICE — season_start >= ${HARNESS_SEASON_FLOOR} ` +
        `(${harnessSeasons.length} seasons, ${harnessSeasons[0]} .. ${
          harnessSeasons[harnessSeasons.length - 1]
        })\nthe ml/fit_fatigue_weights.py TRAIN_FLOOR the published 7,224 / 44.39% figures came from`
    )
  );

  // ── per-season rested-visitor rates, so "no threshold rescues it" can be checked over time ──
  out.push(section("RESTED VISITOR BY SEASON"));
  out.push("", "  season      n   visitorWins   visitorWin%");
  const bySeason = new Map<string, { n: number; wins: number }>();
  for (const r of decided) {
    if (r.restedTeamSide !== "away") continue;
    const agg = bySeason.get(r.season) ?? { n: 0, wins: 0 };
    agg.n++;
    if (r.restedTeamWon) agg.wins++;
    bySeason.set(r.season, agg);
  }
  for (const season of [...bySeason.keys()].sort()) {
    const agg = bySeason.get(season)!;
    out.push(
      `  ${season}  ${pad(agg.n.toLocaleString(), 5)}   ${pad(
        agg.wins.toLocaleString(),
        11
      )}   ${pad(pct(agg.wins, agg.n), 11)}`
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
