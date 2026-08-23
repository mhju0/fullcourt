import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
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
      {/* "As played" against Schedule Edge's "the hand dealt" — the two tabs overlap in
          subject, and the identity words are what let a reader pick the right one before
          clicking. Sharpened 2026-08-23 when the per-team pricing table moved there. */}
      <PageHeader
        eyebrow="ONE SEASON · AS PLAYED"
        title="Season Report"
        description="One NBA season as it was actually played: how the rest-advantage call scored against its own history, and which teams converted the rest edges they were dealt."
      />
      <MethodLink surfaceHref="/season" />

      <SeasonReportContentLazy />
    </div>
  );
}
