import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HomeContent } from "@/components/home-content";
import { loadHomepageDatabaseEvidence } from "@/lib/home-findings-server";
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
  const { history, schedule } = await loadHomepageDatabaseEvidence();
  return {
    historical: historicalHomeFinding(history),
    schedule: schedule ? scheduleHomeFinding(schedule) : null,
    shootingCoverage,
  };
}

export default async function HomePage() {
  return <HomeContent findings={await loadFindings()} />;
}
