import { PublicApiError } from "@/lib/api-errors";
import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
} from "@/lib/db/queries";
import { buildHistoricalBacktest, gapRangeByKey } from "@/lib/rest-advantage-evidence";
import { createStampedCache, ORIGIN_CACHE_MAX_AGE } from "@/lib/stamped-cache";
import type { HomepageHistoricalEvidence } from "@/lib/home-findings";
import { defaultRankableSeason } from "@/lib/schedule-disparity";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

const getHomepageHistory = createStampedCache<string, HomepageHistoricalEvidence>({
  readStamp: async () => {
    const completed = await getCompletedGamesStamp();
    const incomplete = await getIncompleteRegularSeasonSeasonsStamp();
    return `${completed}|pending=${incomplete}`;
  },
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: async () => {
    const rows = await getCompletedGamesWithFatigue();
    const incompleteSeasons = await getIncompleteRegularSeasonSeasons();
    const minGap = gapRangeByKey("large").min;
    // Both season series use one retrieved row set and the existing backtest classification.
    return {
      baselineSeasons: buildHistoricalBacktest(rows, 0, incompleteSeasons).seasonWinRates,
      largeGapSeasons: buildHistoricalBacktest(rows, minGap, incompleteSeasons).seasonWinRates,
      minGap,
    };
  },
});

/** Keep hosted-pool reads sequential; a withheld schedule does not hide the rest finding. */
export async function loadHomepageDatabaseEvidence() {
  const history = await getHomepageHistory("home");
  try {
    return {
      history,
      schedule: await getScheduleDisparity(defaultRankableSeason()),
    };
  } catch (error: unknown) {
    if (error instanceof PublicApiError && error.status === 422) {
      return { history, schedule: null };
    }
    throw error;
  }
}
