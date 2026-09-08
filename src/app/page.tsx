import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PublicApiError } from "@/lib/api-errors";
import { getSeasonReport } from "@/lib/season-report-server";
import { getGameById } from "@/lib/db/queries";
import { HomeContent } from "@/components/home-content";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";
import { defaultRankableSeason } from "@/lib/schedule-disparity";
import { historicalHomeFinding, scheduleHomeFinding, shootingHomeCoverage, type HomeFindings } from "@/lib/home-findings";
import type { PlayerRestPayload } from "@/lib/player-rest";

export const metadata: Metadata = {
  title: "NBA rest, fatigue and schedule findings",
  description: "See how NBA rest gaps compare with home court, compare team schedules, and look up shooting by rest.",
};

export const revalidate = 86400;

async function loadFindings(): Promise<HomeFindings> {
  const shooting: PlayerRestPayload = JSON.parse(await readFile(join(process.cwd(), "public/data/player-rest.json"), "utf8"));
  const shootingCoverage = shootingHomeCoverage(shooting);
  // CI can build without a database. Configured database failures still reach the error boundary.
  if (!process.env.DATABASE_URL) return { historical: null, schedule: null, shootingCoverage };
  const [history, schedule, report] = await Promise.all([
    getHistoricalBacktest(0),
    getScheduleDisparity(defaultRankableSeason()).catch((error: unknown) => {
      // An unequal schedule is an expected withheld ranking, not a failure of the historical evidence.
      if (error instanceof PublicApiError && error.status === 422) return null;
      throw error;
    }),
    getSeasonReport(defaultRankableSeason()),
  ]);
  const example = report.loudestCalls[0] ? await getGameById(report.loudestCalls[0].gameId) : null;
  return { example, historical: historicalHomeFinding(history), schedule: schedule ? scheduleHomeFinding(schedule) : null, shootingCoverage };
}

export default async function HomePage() {
  return <HomeContent findings={await loadFindings()} />;
}
