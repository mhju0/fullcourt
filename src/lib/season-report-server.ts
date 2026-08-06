import {
  getSeasonGamesStamp,
  getSeasonReportRows,
  getTeamDirectory,
} from "@/lib/db/queries";
import { buildSeasonReport, type SeasonReportResponse } from "@/lib/season-report";

/**
 * One season's report, held until that season's games change.
 *
 * Same stamp trick as `rest-advantage-evidence-server.ts`, and the same reason: this reads
 * every game in a season with no LIMIT. Bounded by the season list, which is closed.
 *
 * The stamp is per-season rather than global, so the entry is too — one shared stamp with a
 * map beneath it would rebuild every cached season each time the season in view moved on.
 */
const cache = new Map<string, { stamp: string; response: SeasonReportResponse }>();

/** Complete server-side Season Report operation, including retrieval. */
export async function getSeasonReport(season: string): Promise<SeasonReportResponse> {
  const stamp = await getSeasonGamesStamp(season);
  const hit = cache.get(season);
  if (hit !== undefined && hit.stamp === stamp) return hit.response;

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
  };

  cache.set(season, { stamp, response });
  return response;
}
