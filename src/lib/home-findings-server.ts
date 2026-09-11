import { PublicApiError } from "@/lib/api-errors";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";
import { defaultRankableSeason } from "@/lib/schedule-disparity";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";

/**
 * Loads the two database-backed homepage findings without competing for the hosted pool's
 * single connection. An unequal schedule is an expected withheld ranking, so it leaves the
 * historical finding intact; every other failure still reaches the page error boundary.
 */
export async function loadHomepageDatabaseEvidence() {
  const history = await getHistoricalBacktest(0);
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
