import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SeasonReportContentLazy } from "@/components/season-report-lazy";

export const metadata: Metadata = {
  title: "Season Report",
};

export default function SeasonPage() {
  return (
    <div className="flex flex-col gap-12">
      {/* No season in the heading: the selector below reaches back to 1985-86, so a title that
          named one would be wrong as soon as it moved. The sections carry the label instead. */}
      <PageHeader
        eyebrow="ONE SEASON · WIN RATE AND WINS"
        title="Season Report"
        description="One NBA season read through rest and fatigue: how the rest-advantage call scored against its own history, and what each team's schedule was actually worth — in wins, not percentages."
      />

      <SeasonReportContentLazy />
    </div>
  );
}
