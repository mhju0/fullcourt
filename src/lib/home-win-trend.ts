import type { AnalysisResponse } from "@/types";

type SeasonRate = AnalysisResponse["seasonWinRates"][number];

export type HomeWinTrendPoint = {
  season: string;
  homeWinPct: number | null;
  rollingHomeWinPct: number | null;
  homeWins: number;
  homeGames: number;
};

/** Missing calendar seasons occupy a slot so neither line bridges an evidence gap. */
export function buildHomeWinTrend(rows: readonly SeasonRate[]): HomeWinTrendPoint[] {
  if (rows.length === 0) return [];
  const byYear = new Map(rows.map((row) => [Number(row.season.slice(0, 4)), row]));
  const years = [...byYear.keys()].filter(Number.isFinite);
  if (years.length === 0) return [];
  const first = Math.min(...years);
  const last = Math.max(...years);
  const complete = (row: SeasonRate | undefined): row is SeasonRate =>
    !!row && row.isComplete && row.homeGames > 0;
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index;
    const row = byYear.get(year);
    const window = Array.from({ length: 5 }, (_, offset) => byYear.get(year - 4 + offset));
    const fullWindow = window.every(complete);
    return {
      season: row?.season ?? `${year}-${String(year + 1).slice(-2)}`,
      homeWinPct: complete(row) ? row.homeBaselinePct : null,
      rollingHomeWinPct: fullWindow
        ? window.reduce((sum, season) => sum + season.homeWins, 0) /
          window.reduce((sum, season) => sum + season.homeGames, 0) * 100
        : null,
      homeWins: row?.homeWins ?? 0,
      homeGames: row?.homeGames ?? 0,
    };
  });
}
