import {
  getCompletedGamesStamp,
  getSeasonReportRows,
  getTeamDirectory,
} from "@/lib/db/queries";
import { formatEasternDateKey } from "@/lib/nba-season";
import { buildSeasonReport, type SeasonReportResponse } from "@/lib/season-report";

/**
 * One season's report, held until a game goes final.
 *
 * Same stamp trick as `rest-advantage-evidence-server.ts`, and the same reason:
 * the figures cannot change while no game has finished, and this reads every
 * game in a season with no LIMIT. Bounded by the season list, which is closed.
 */
let cache: { stamp: string; bySeason: Map<string, SeasonReportResponse> } | null = null;

/** Complete server-side Season Report operation, including retrieval. */
export async function getSeasonReport(season: string): Promise<SeasonReportResponse> {
  const stamp = await getCompletedGamesStamp();
  if (cache === null || cache.stamp !== stamp) {
    cache = { stamp, bySeason: new Map() };
  }

  const hit = cache.bySeason.get(season);
  if (hit !== undefined) return hit;

  const [rows, directory] = await Promise.all([
    getSeasonReportRows(season),
    getTeamDirectory(),
  ]);

  const report = buildSeasonReport(season, rows);
  const byId = new Map(directory.map((t) => [t.id, t]));

  const response: SeasonReportResponse = {
    ...report,
    teams: report.teams.map((t) => {
      const team = byId.get(t.teamId);
      return {
        ...t,
        abbreviation: team?.abbreviation ?? "—",
        name: team?.name ?? `Team ${t.teamId}`,
      };
    }),
    provisional: report.completedGames < report.scheduledGames,
    asOf: formatEasternDateKey(new Date()),
  };

  cache.bySeason.set(season, response);
  return response;
}
