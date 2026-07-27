import {
  getRegularSeasonScheduleForDisparity,
  getTeamDirectory,
} from "@/lib/db/queries";
import { formatEasternDateKey } from "@/lib/nba-season";
import { computeScheduleDisparity } from "@/lib/schedule-disparity";
import type { ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types";

/**
 * Assemble a season's Schedule Disparity payload: fetch its regular-season games, compute the
 * figures, and label each team.
 *
 * Read-only — this module writes nothing and no other query reads anything it produces.
 */
export async function getScheduleDisparity(
  season: string
): Promise<ScheduleDisparityResponse> {
  const [games, directory] = await Promise.all([
    getRegularSeasonScheduleForDisparity(season),
    getTeamDirectory(),
  ]);

  const result = computeScheduleDisparity(season, games);
  const byId = new Map(directory.map((t) => [t.id, t]));

  const teams: ScheduleDisparityTeam[] = result.teams.map((t) => {
    const team = byId.get(t.teamId);
    return {
      ...t,
      abbreviation: team?.abbreviation ?? "—",
      name: team?.name ?? `Team ${t.teamId}`,
    };
  });

  return {
    season: result.season,
    provisional: result.provisional,
    asOf: formatEasternDateKey(new Date()),
    scheduledGames: result.scheduledGames,
    gamesPerTeamMin: result.gamesPerTeamMin,
    gamesPerTeamMax: result.gamesPerTeamMax,
    teams,
    league: result.league,
  };
}
