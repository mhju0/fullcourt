import { MIN_GAMES_FOR_INFERENCE } from "@/lib/season-report";
import type { AnalysisResponse } from "@/types";

export type HomeCourtSeason = AnalysisResponse["seasonWinRates"][number];

export function restedHomeGap(row: HomeCourtSeason): number | null {
  if (row.games < MIN_GAMES_FOR_INFERENCE) return null;
  const restRate = row.restedTeamWins / row.games;
  const homeRate = row.homeWins / row.homeGames;
  return Math.round((restRate - homeRate) * 1000) / 10;
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
