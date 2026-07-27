import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ScheduleDisparityContentLazy } from "@/components/schedule-disparity-lazy";

export const metadata: Metadata = {
  title: "Schedule Disparity",
};

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="SCHEDULE DISPARITY · NET REST EDGE"
        title="Schedule Disparity"
        description="Which teams a season's schedule favored, measured in days of rest against their opponents. This describes the schedule — it is not a prediction, and much of the gap is structural: geography, arena availability and broadcast windows produce rest imbalance without anyone favoring anyone. Every figure is scoped to its own season."
      />

      <ScheduleDisparityContentLazy />
    </div>
  );
}
