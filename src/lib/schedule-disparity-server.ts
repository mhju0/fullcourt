import { PublicApiError } from "@/lib/api-errors";
import {
  getRegularSeasonScheduleForDisparity,
  getTeamDirectory,
} from "@/lib/db/queries";
import { formatEasternDateKey } from "@/lib/nba-season";
import { computeScheduleDisparity, seasonRankability } from "@/lib/schedule-disparity";
import { teamLabeller } from "@/lib/team-labels";
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

  // Refuse rather than mislead. This module's whole output is a ranking of teams against each
  // other, so a season where they played unequal numbers of games produces a table that looks
  // like a finding and is an artefact of exposure. The message carries the counts because a
  // reader who asked for a season and got nothing is owed the reason.
  //
  // Thrown as a `PublicApiError` because that is the only shape `api-errors.ts` lets reach the
  // browser — a plain `Error` here is indistinguishable from a Drizzle failure and is replaced
  // by the generic message in production, which silently unwrote the reason above. 422 rather
  // than 400: the request was understood and the season is valid, and there is no ranking to give.
  const rankability = seasonRankability(games);
  if (!rankability.rankable && games.length > 0) {
    throw new PublicApiError(
      `${season} cannot be ranked: teams played between ${rankability.fewestGames} and ` +
        `${rankability.mostGames} games. Schedule edge compares teams within a season, so an ` +
        `unequal number of games moves a team's total without the schedule having favoured anyone.`,
      422
    );
  }

  const result = computeScheduleDisparity(season, games);
  const label = teamLabeller(directory);

  // Mapped field by field rather than spread: the module's result is deliberately wider than
  // the response, and a spread would quietly ship every future metric it gains.
  const teams: ScheduleDisparityTeam[] = result.teams.map((t) => {
    const { abbreviation, name } = label(t.teamId);
    return {
      teamId: t.teamId,
      abbreviation,
      name,
      favorableGames: t.favorableGames,
      unfavorableGames: t.unfavorableGames,
      netEdgeGames: t.netEdgeGames,
      bigFavorableGames: t.bigFavorableGames,
      bigUnfavorableGames: t.bigUnfavorableGames,
      backToBackEdge: t.backToBackEdge,
      threeInFourEdge: t.threeInFourEdge,
    };
  });

  return {
    season: result.season,
    provisional: result.provisional,
    asOf: formatEasternDateKey(new Date()),
    scheduledGames: result.scheduledGames,
    teams,
    league: {
      delta: result.league.delta,
      gamesWithAnyEdge: result.league.gamesWithAnyEdge,
      gamesWithLargeEdge: result.league.gamesWithLargeEdge,
      countedGames: result.league.countedGames,
    },
  };
}
