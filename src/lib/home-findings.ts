import type { AnalysisResponse, ScheduleDisparityResponse } from "@/types";
import { rankScheduleTeams } from "@/lib/schedule-ranking";
import { S, seasonLabel, type PlayerRestPayload } from "@/lib/player-rest";

export function historicalHomeFinding(data: AnalysisResponse) {
  const widest = data.thresholds.find((row) => row.threshold === 7);
  if (!widest?.games || !data.venueBaseline.games) return null;
  const seasons = data.seasonWinRates.filter((row) => row.games > 0).map((row) => row.season).sort();
  return {
    games: widest.games,
    winPct: widest.winPct,
    baselinePct: data.venueBaseline.homeWinPct,
    baselineGames: data.venueBaseline.games,
    edgePp: Math.round((widest.winPct - data.venueBaseline.homeWinPct) * 10) / 10,
    coverage: seasons.length ? `${seasons[0]} to ${seasons.at(-1)}` : null,
    latestEvidenceDate: data.latestEvidenceDate,
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
