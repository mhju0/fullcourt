import type { AnalysisResponse, ScheduleDisparityResponse } from "@/types";
import { rankScheduleTeams } from "@/lib/schedule-ranking";
import { S, seasonLabel, type PlayerRestPayload } from "@/lib/player-rest";
import { gapRangeByKey } from "@/lib/rest-advantage-evidence";

type HistoricalSeason = AnalysisResponse["seasonWinRates"][number];

export interface HomepageHistoricalEvidence {
  baselineSeasons: HistoricalSeason[];
  largeGapSeasons: HistoricalSeason[];
  minGap: number;
}

export function historicalHomeFinding(data: HomepageHistoricalEvidence) {
  const minGap = gapRangeByKey("large").min;
  if (data.minGap !== minGap) return null;
  // The baseline owns the population: a season with no large gaps still belongs in it.
  const seasons = data.baselineSeasons
    .filter((row) => row.isComplete && row.homeGames > 0)
    .sort((left, right) => left.season.localeCompare(right.season));
  const selected = new Set(seasons.map((row) => row.season));
  const largeGaps = data.largeGapSeasons.filter((row) => selected.has(row.season));
  const games = largeGaps.reduce((sum, row) => sum + row.games, 0);
  const wins = largeGaps.reduce((sum, row) => sum + row.restedTeamWins, 0);
  const baselineGames = seasons.reduce((sum, row) => sum + row.homeGames, 0);
  const baselineWins = seasons.reduce((sum, row) => sum + row.homeWins, 0);
  if (!games || !baselineGames) return null;
  const winPct = wins / games * 100;
  const baselinePct = baselineWins / baselineGames * 100;
  return {
    minGap,
    games,
    winPct,
    baselinePct,
    baselineGames,
    edgePp: winPct - baselinePct,
    seasonCount: seasons.length,
    coverage: `${seasons[0].season} to ${seasons.at(-1)!.season}`,
    latestEvidenceDate: seasons.reduce((latest, row) => row.latestEvidenceDate > latest ? row.latestEvidenceDate : latest, "") || null,
  };
}

export function scheduleHomeFinding(data: ScheduleDisparityResponse) {
  const ranking = rankScheduleTeams(data.teams);
  const measured = ranking.rows.filter((row) => row.team.netEdgeGames !== null);
  const most = measured[0];
  const least = measured.at(-1);
  const summary = (row: typeof most | undefined) => row ? {
    name: row.team.name,
    value: row.team.netEdgeGames!,
    tied: measured.filter((other) => other.team.netEdgeGames === row.team.netEdgeGames).length > 1,
  } : null;
  return {
    season: data.season,
    measuredGames: data.league.measuredGames,
    projectedGames: data.league.projectedGames,
    scheduledGames: data.scheduledGames,
    latestFinalDate: data.latestFinalDate,
    provisional: data.provisional,
    most: summary(most),
    least: summary(least),
    uniform: most !== undefined && most.team.netEdgeGames === least?.team.netEdgeGames,
  };
}

export function shootingHomeCoverage(data: Pick<PlayerRestPayload, "seasons">) {
  const years = data.seasons.map((row) => row[S.YEAR]);
  return years.length ? `${seasonLabel(Math.min(...years))} to ${seasonLabel(Math.max(...years))}` : null;
}

export interface HomeFindings {
  historical: ReturnType<typeof historicalHomeFinding>;
  schedule: ReturnType<typeof scheduleHomeFinding> | null;
  shootingCoverage: string | null;
}
