import { PublicApiError } from "@/lib/api-errors";
import {
  getRegularSeasonScheduleForDisparity,
  getSeasonGamesStamp,
  getTeamDirectory,
} from "@/lib/db/queries";
import { formatEasternDateKey } from "@/lib/nba-season";
import { computeScheduleDisparity, seasonRankability } from "@/lib/schedule-disparity";
import { createStampedCache } from "@/lib/stamped-cache";
import { teamLabeller } from "@/lib/team-labels";
import type { ScheduleDisparityResponse, ScheduleDisparityTeam } from "@/types";

/**
 * Assemble a season's Schedule Disparity payload: fetch its regular-season games, compute the
 * figures, and label each team.
 *
 * Read-only — this module writes nothing and no other query reads anything it produces.
 *
 * Held until that season's games change, for the same reason the Season Report is: this reads
 * every game in a season with no LIMIT and reduces them in JS. `getSeasonGamesStamp` is the
 * right stamp without a new query — it counts `publishableGames(eq(games.season, season))`,
 * which is exactly the population `getRegularSeasonScheduleForDisparity` reads. It also has to
 * be the per-season stamp rather than the backtest's: this module reads scheduled games, not
 * only final ones, and reporting on a schedule before it is played is the whole point.
 *
 * Unbounded because the key set is closed — the route validates against
 * `rankableSeasons(browsableSeasons())`, so a reader cannot invent a season.
 */
const disparity = createStampedCache<string, ScheduleDisparityResponse>({
  readStamp: (season) => getSeasonGamesStamp(season),
  load: buildScheduleDisparity,
});

export function getScheduleDisparity(season: string): Promise<ScheduleDisparityResponse> {
  return disparity(season);
}

async function buildScheduleDisparity(
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
    // Stamped when the figures are computed, so a held response keeps the date it was built
    // on rather than the date it was served. That is what the field claims to mean, and it is
    // the honest reading: re-stamping today onto a held value would assert a computation that
    // did not happen. The stamp guarantees the inputs have not moved since.
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
