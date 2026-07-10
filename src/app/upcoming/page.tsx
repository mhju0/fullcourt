import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UpcomingContentLazy } from "@/components/upcoming-lazy";
import { currentDisplaySeason } from "@/lib/nba-season";

export const metadata: Metadata = {
  title: "Future Games",
};

export default function UpcomingPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`${currentDisplaySeason()} SEASON`}
        title="Future Games"
        description="UPCOMING SCHEDULED GAMES FILTERED BY REST ADVANTAGE THRESHOLD."
      />

      <UpcomingContentLazy />
    </div>
  );
}
