import type { Metadata } from "next";
import { AboutContentLazy } from "@/components/about-lazy";
import type { AboutStats } from "@/components/about-content";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

export const metadata: Metadata = {
  title: "What FullCourt measures",
  description:
    "FullCourt measures what the schedule does to a team before the ball is tipped — travel, rest and density, across four decades of evidence.",
};

/**
 * The front door, since 2026-08-12. It lived at `/about` and was reachable only from a
 * right-aligned Reference link and the footer — while its own docblock called it "the marketing
 * page" and it already carried a surfaces grid and a single "open the games board" CTA. It was
 * built to be landed on; it was simply parked at the wrong URL. `GLOSSARY.md` records that the
 * link to it had already been moved once, in 2026-07-30, for being too quiet to find; this
 * finishes that fix rather than starting a new one.
 *
 * `/about` is now a redirect (`next.config.ts`), because the old address is in shared links and
 * anything anyone bookmarked; `e2e/navigation.spec.ts` guards that it keeps resolving. The
 * footer used to be the other reason and no longer is — it points straight at `/`, saving the
 * hop. The games board moved to `/games` and keeps the GAMES
 * tab, so a returning visitor pays one click — and browser autocomplete spends most of those for
 * them.
 *
 * The evidence figures are read from the same backtest the Model Results page renders rather
 * than typed into the copy. They were hardcoded until 2026-07-30 and had gone stale in all
 * three places — the games count, the headline win-rate figure, and a "days of rest"
 * statistic whose metric had been retired outright. A marketing page asserting a number the
 * product no longer supports is the worst possible place to carry drift.
 *
 * Revalidated daily rather than prerendered once, because those figures move when games go
 * final, which is exactly what the daily pipeline does. Without it they would be fixed at
 * build time and drift until the next deploy — the failure this change exists to end.
 */
export const revalidate = 86400;

/**
 * Null when there is no database to read, which is a build without DATABASE_URL — CI, or a
 * clone that has not been configured. The page still builds and still says what the product
 * measures; only the three evidence figures are withheld, and they render as em dashes rather
 * than as numbers nobody verified.
 *
 * The check is on the variable, deliberately, rather than a try/catch around the query. A
 * missing database is a known environment; a database that is present and failing is a real
 * fault, and swallowing it would ship a marketing page quietly missing its evidence.
 */
async function loadStats(): Promise<AboutStats | null> {
  if (!process.env.DATABASE_URL) return null;

  const backtest = await getHistoricalBacktest(0);
  const widest = backtest.thresholds.find((t) => t.threshold === 7);

  // Against the home baseline, not 50. Every game in these figures is one the rested team
  // played at home, and home teams win ~59.9% of everything regardless of rest — so a
  // coin-flip reference put roughly ten points of home court into a number this page
  // presents, in its largest type, as what rest is worth.
  const baseline = backtest.venueBaseline.homeWinPct;
  const pointsOverBaseline = (rate: number) => Math.round((rate - baseline) * 10) / 10;

  return {
    games: backtest.totalGames,
    baselinePct: baseline,
    overallEdgePp: pointsOverBaseline(backtest.overallWinRate),
    widestEdgePp: widest ? pointsOverBaseline(widest.winPct) : 0,
    widestEdgeGames: widest?.games ?? 0,
  };
}

export default async function HomePage() {
  return <AboutContentLazy stats={await loadStats()} />;
}
