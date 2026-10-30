import type { Metadata } from "next";
import { HomeContent } from "@/components/home-content";
import { loadHomepageDatabaseEvidence } from "@/lib/home-findings-server";
import { historicalHomeFinding, scheduleHomeFinding, shootingHomeCoverage, type HomeFindings } from "@/lib/home-findings";
import { loadPlayerRestPublication } from "@/lib/player-rest-publication-server";

export const metadata: Metadata = {
  title: "NBA rest, fatigue and schedule findings",
  description: "See how NBA rest gaps compare with home court, compare team schedules, and look up shooting by rest.",
};

export const revalidate = 86400;

async function loadFindings(): Promise<HomeFindings> {
  const [shooting, evidence] = await Promise.all([
    loadPlayerRestPublication(),
    process.env.DATABASE_URL ? loadHomepageDatabaseEvidence() : null,
  ]);
  const shootingCoverage = shootingHomeCoverage(shooting);
  // CI can build without a database. Configured database failures still reach the error boundary.
  if (!evidence) return { historical: null, schedule: null, shootingCoverage };
  const { history, schedule } = evidence;
  return {
    historical: historicalHomeFinding(history),
    schedule: schedule ? scheduleHomeFinding(schedule) : null,
    shootingCoverage,
  };
}

export default async function HomePage() {
  return <HomeContent findings={await loadFindings()} />;
}
