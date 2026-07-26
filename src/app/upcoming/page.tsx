import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UpcomingContentLazy } from "@/components/upcoming-lazy";
import { currentDisplaySeason } from "@/lib/nba-season";

export const metadata: Metadata = {
  title: "Upcoming Edges",
};

export default function UpcomingPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`${currentDisplaySeason()} SEASON`}
        title="Upcoming Edges"
        description="Scheduled games where one team arrives measurably fresher, filtered by the size of the rest gap. This is not betting advice."
      />

      <UpcomingContentLazy />
    </div>
  );
}
