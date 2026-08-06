/**
 * Is the per-season home-baseline RANGE reported in Q1 distinguishable from sampling noise?
 * Read-only, no DB: simulates binomial seasons at the pooled rate with the real season sizes.
 */
import { writeFile } from "node:fs/promises";

const SEASONS: Array<[string, number, number]> = [
  ["1985-86", 943, 617], ["1986-87", 943, 627], ["1987-88", 943, 640],
  ["1988-89", 1025, 695], ["1989-90", 1107, 713], ["1990-91", 1107, 730],
  ["1991-92", 1107, 699], ["1992-93", 1107, 676], ["1993-94", 1107, 677],
  ["1994-95", 1107, 661], ["1995-96", 1189, 718], ["1996-97", 1189, 684],
  ["1997-98", 1189, 708], ["1998-99", 725, 452], ["1999-00", 1189, 726],
  ["2000-01", 1189, 711], ["2001-02", 1189, 703], ["2002-03", 1189, 747],
  ["2003-04", 1189, 730], ["2004-05", 1230, 744], ["2005-06", 1230, 742],
  ["2006-07", 1230, 727], ["2007-08", 1230, 739], ["2008-09", 1230, 748],
  ["2009-10", 1230, 731], ["2010-11", 1230, 743], ["2011-12", 990, 580],
  ["2012-13", 1229, 752], ["2013-14", 1230, 714], ["2014-15", 1230, 707],
  ["2015-16", 1230, 724], ["2016-17", 1230, 718], ["2017-18", 1230, 712],
  ["2018-19", 1230, 729], ["2019-20", 971, 535], ["2020-21", 1080, 587],
  ["2021-22", 1230, 669], ["2022-23", 1230, 714], ["2023-24", 1230, 668],
  ["2024-25", 1230, 669], ["2025-26", 1230, 682],
];

/**
 * Seeded PRNG (mulberry32), not `Math.random()`.
 *
 * This script's output is cited as evidence for a published decision, so re-running it has to
 * reproduce the same p-values. An unseeded simulation would give a different answer every run,
 * which is the same defect as a hand-typed figure nobody can re-derive.
 */
const SEED = 20260806;
let prngState = SEED;
function random(): number {
  prngState |= 0;
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function binom(n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (random() < p) k++;
  return k;
}

function run(label: string, slice: Array<[string, number, number]>, trials: number) {
  const games = slice.reduce((t, s) => t + s[1], 0);
  const wins = slice.reduce((t, s) => t + s[2], 0);
  const p = wins / games;
  const rates = slice.map((s) => (s[2] / s[1]) * 100);
  const observedRange = Math.max(...rates) - Math.min(...rates);

  let ge = 0;
  const sim: number[] = [];
  for (let t = 0; t < trials; t++) {
    const r = slice.map((s) => (binom(s[1], p) / s[1]) * 100);
    const range = Math.max(...r) - Math.min(...r);
    sim.push(range);
    if (range >= observedRange) ge++;
  }
  sim.sort((a, b) => a - b);
  const q = (x: number) => sim[Math.floor(x * (sim.length - 1))]!.toFixed(4);
  return [
    `${label}   seasons ${slice.length}   pooled p ${(p * 100).toFixed(4)}%`,
    `  OBSERVED max-min range            ${observedRange.toFixed(4)} pp`,
    `  simulated range under a FLAT baseline (pure binomial noise, real season sizes):`,
    `    median ${q(0.5)}   p90 ${q(0.9)}   p95 ${q(0.95)}   p99 ${q(0.99)}`,
    `  P(noise range >= observed) = ${(ge / trials).toFixed(4)}`,
    `  -> is the observed movement distinguishable from noise? ${ge / trials < 0.05 ? "YES" : "NO — consistent with a FLAT baseline"}`,
    "",
  ];
}

async function main() {
  const out = [
    "# Q1 stress test: is the per-season home-baseline RANGE bigger than sampling noise?",
    `generated ${new Date().toISOString()}`,
    "Null: the home win rate is CONSTANT at the slice's pooled rate; only binomial noise moves it.",
    "",
    ...run("ALL 41 SEASONS", SEASONS, 20000),
    ...run("LAST 10 SEASONS", SEASONS.slice(-10), 20000),
    ...run("LAST 5 SEASONS", SEASONS.slice(-5), 20000),
  ];
  await writeFile("/Users/michaelju/Workspace/Projects/fullcourt/ml/data/q1_noise_check.txt", out.join("\n") + "\n", "utf8");
  console.log("done");
}
main();
