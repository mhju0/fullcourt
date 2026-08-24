import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { ScheduleDisparityContentLazy } from "@/components/schedule-disparity-lazy";
import { WinTotalGuardrail } from "@/components/win-total-market-check";

export const metadata: Metadata = {
  title: "Schedule Disparity",
};

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-12">
      {/* "The hand each team was dealt" against Season Report's "as played" — see the note
          there. "Not a prediction" and "much of the gap is structural" are load-bearing and
          pinned by e2e; reword around them, never out of them. */}
      <PageHeader
        eyebrow="SCHEDULE DISPARITY · NET EDGE GAMES"
        title="Schedule Edge"
        description="The hand each team was dealt: a season's rest edges counted game by game and priced in wins. Not a prediction — much of the gap is structural, and each season stands alone."
      />
      <MethodLink surfaceHref="/schedule" />

      <ScheduleDisparityContentLazy />

      {/* Static and season-independent, so it lives outside the season selector's data flow.
          The sentry only — the full market check lives on the method page (ADR 0009). */}
      <WinTotalGuardrail />
    </div>
  );
}
