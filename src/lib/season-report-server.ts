import {
  getSeasonGamesStamp,
  getSeasonReportRows,
  getTeamDirectory,
} from "@/lib/db/queries";
import { buildSeasonReport, type SeasonReportResponse } from "@/lib/season-report";
import { createStampedCache } from "@/lib/stamped-cache";

/**
 * One season's report, held until that season's games change.
 *
 * Same reason as the backtest: this reads every game in a season with no LIMIT. The
 * stamp is per-season rather than global, so the entry is too — one global stamp would
 * rebuild every held season each time any season's games moved.
 *
 * Unbounded because the key set is the season list, which is closed. A reader cannot
 * invent a season: `seasonParam` rejects anything outside `NBA_SEASONS` before the route
 * reaches here.
 */
const report = createStampedCache<string, SeasonReportResponse>({
  readStamp: (season) => getSeasonGamesStamp(season),
  load: async (season) => {
    const [rows, directory] = await Promise.all([
      getSeasonReportRows(season),
      getTeamDirectory(),
    ]);

    const built = buildSeasonReport(season, rows);
    const byId = new Map(directory.map((t) => [t.id, t]));

    return {
      ...built,
      teams: built.teams.map((t) => {
        const team = byId.get(t.teamId);
        return {
          ...t,
          abbreviation: team?.abbreviation ?? "—",
          name: team?.name ?? `Team ${t.teamId}`,
        };
      }),
    };
  },
});

/** Complete server-side Season Report operation, including retrieval. */
export function getSeasonReport(season: string): Promise<SeasonReportResponse> {
  return report(season);
}
