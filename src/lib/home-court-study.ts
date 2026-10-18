import { liftOverBaseline } from "@/lib/rest-split-facts";
import { MIN_GAMES_FOR_INFERENCE } from "@/lib/season-report";
import type { AnalysisResponse } from "@/types";
import { buildHistoricalBacktest, gapRangeByKey, type HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

export type HomeCourtSeason = AnalysisResponse["seasonWinRates"][number];

export type HomeCourtStudySeason = HomeCourtSeason & {
  largeRestGap: { games: number; restedTeamWins: number; winPct: number | null };
};
export type HomeCourtStudyData = { seasonWinRates: HomeCourtStudySeason[] };

export function buildHomeCourtStudy(
  games: readonly HistoricalGameEvidenceRow[],
  incompleteSeasons: ReadonlySet<string> = new Set()
): HomeCourtStudyData {
  const base = buildHistoricalBacktest(games, 0, incompleteSeasons);
  const large = new Map(buildHistoricalBacktest(games, gapRangeByKey("large").min, incompleteSeasons).seasonWinRates
    .map((row) => [row.season, row]));
  return {
    seasonWinRates: base.seasonWinRates.map((row) => {
      const largeRow = large.get(row.season);
      const count = largeRow?.games ?? 0;
      const wins = largeRow?.restedTeamWins ?? 0;
      return { ...row, largeRestGap: {
        games: count, restedTeamWins: wins, winPct: count > 0 ? (wins / count) * 100 : null,
      } };
    }),
  };
}

export function homeCourtChartSegments(values: readonly (number | null)[]): { index: number; rate: number }[][] {
  const segments: { index: number; rate: number }[][] = [];
  let points: { index: number; rate: number }[] = [];
  values.forEach((rate, index) => {
    if (rate === null) {
      if (points.length > 1) segments.push(points);
      points = [];
    } else points.push({ index, rate });
  });
  if (points.length > 1) segments.push(points);
  return segments;
}

/** The difference of the two rates as printed beside it, so the row's arithmetic holds (D-93). */
export function restedHomeGap(row: HomeCourtSeason): number | null {
  if (row.games < MIN_GAMES_FOR_INFERENCE) return null;
  return liftOverBaseline(row.winPct, row.homeBaselinePct);
}

export function homeCourtTickIndices(length: number, maximum = 6): number[] {
  if (length <= 0) return [];
  if (length <= maximum) return Array.from({ length }, (_, index) => index);
  return Array.from(
    new Set(
      Array.from({ length: maximum }, (_, index) =>
        Math.round((index * (length - 1)) / (maximum - 1))
      )
    )
  );
}

function poolHomeRate(rows: readonly HomeCourtSeason[]) {
  const games = rows.reduce((sum, row) => sum + row.homeGames, 0);
  const wins = rows.reduce((sum, row) => sum + row.homeWins, 0);
  return { games, wins, winPct: games > 0 ? (wins / games) * 100 : 0 };
}

export function homeCourtEraSummary(rows: readonly HomeCourtSeason[], eraLength = 5) {
  const completed = rows.filter((row) => row.isComplete && row.homeGames > 0);
  if (completed.length < eraLength * 2) return null;
  const firstRows = completed.slice(0, eraLength);
  const latestRows = completed.slice(-eraLength);
  return {
    first: { from: firstRows[0].season, to: firstRows.at(-1)!.season, ...poolHomeRate(firstRows) },
    latest: { from: latestRows[0].season, to: latestRows.at(-1)!.season, ...poolHomeRate(latestRows) },
  };
}
