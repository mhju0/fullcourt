import type { Metadata } from "next";
import { AboutContentLazy } from "@/components/about-lazy";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";

export const metadata: Metadata = {
  title: "What FullCourt measures",
  description:
    "FullCourt measures what the schedule does to a team before the ball is tipped — travel, rest and density, across four decades of evidence.",
};

/**
 * Reached from the reference links in the nav row, not from a tab: this explains the
 * product rather than being one of its five surfaces.
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

export default async function AboutPage() {
  const backtest = await getHistoricalBacktest(0);
  const widest = backtest.thresholds.find((t) => t.threshold === 7);

  return (
    <AboutContentLazy
      stats={{
        games: backtest.totalGames,
        overallEdgePp: Math.round((backtest.overallWinRate - 50) * 10) / 10,
        widestEdgePp: widest ? Math.round((widest.winPct - 50) * 10) / 10 : 0,
        widestEdgeGames: widest?.games ?? 0,
      }}
    />
  );
}
