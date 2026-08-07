import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
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
        description="Which teams a season's schedule favored, counted in games with a real rest edge and priced in wins. Not a prediction — much of the gap is structural, and each season stands alone."
      />
      <MethodLink surfaceHref="/schedule" />

      <ScheduleDisparityContentLazy />

      {/* Static and season-independent, so it lives outside the season selector's data flow. */}
      <WinTotalMarketCheck />
    </div>
  );
}
