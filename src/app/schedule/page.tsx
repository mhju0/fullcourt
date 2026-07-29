import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ScheduleDisparityContentLazy } from "@/components/schedule-disparity-lazy";
import { WinTotalMarketCheck } from "@/components/win-total-market-check";

export const metadata: Metadata = {
  title: "Schedule Disparity",
};

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="SCHEDULE DISPARITY · NET EDGE GAMES"
        title="Schedule Disparity"
        description="Which teams a season's schedule favored, counted in games where one side arrived with a real rest edge. This describes the schedule — it is not a prediction, and much of the gap is structural: geography, arena availability and broadcast windows produce rest imbalance without anyone favoring anyone. Every figure is scoped to its own season."
      />

      <ScheduleDisparityContentLazy />

      {/* Static and season-independent, so it lives outside the season selector's data flow. */}
      <WinTotalMarketCheck />
    </div>
  );
}
