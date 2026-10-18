import {
  getCompletedGamesStamp,
  getCompletedGamesWithFatigue,
  getIncompleteRegularSeasonSeasons,
  getIncompleteRegularSeasonSeasonsStamp,
} from "@/lib/db/queries";
import { buildHomeCourtStudy, type HomeCourtStudyData } from "@/lib/home-court-study";
import { createStampedCache, ORIGIN_CACHE_MAX_AGE } from "@/lib/stamped-cache";

const readStudy = createStampedCache<"history", HomeCourtStudyData>({
  readStamp: async () => {
    const completed = await getCompletedGamesStamp();
    const incomplete = await getIncompleteRegularSeasonSeasonsStamp();
    return `${completed}|pending=${incomplete}`;
  },
  maxAgeMs: ORIGIN_CACHE_MAX_AGE.inSeason,
  load: async () => {
    const rows = await getCompletedGamesWithFatigue();
    const incomplete = await getIncompleteRegularSeasonSeasons();
    return buildHomeCourtStudy(rows, incomplete);
  },
});

export function getHomeCourtStudy() {
  return readStudy("history");
}
