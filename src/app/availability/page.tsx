import type { Metadata } from "next";
import { AVAILABILITY_SAMPLE } from "@/lib/availability-facts";
import { AvailabilityContent } from "@/components/availability-content";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { KeepTogether } from "@/components/ui/keep-together";

export const metadata: Metadata = {
  title: "Availability Cost",
  description: "How missing players relate to the final score margin in NBA games: historical associations, measured after games.",
};

/**
 * Every figure is a published constant from `availability-facts.ts`, so the whole page is a
 * server component with no fetch, no client bundle and no loading state — the same shape as
 * the Playoff Rest argument. `MethodLink` renders nothing until a matching section exists in
 * `BEHIND_THE_DATA_SECTIONS`, so it lights up when one is written rather than needing a change
 * here.
 */
export default function AvailabilityPage() {
  return (
    <div className="flex flex-col gap-12">
      <header className="page-intro"><PageHeader
        eyebrow="ROTATION ABSENCE · POINTS OF MARGIN"
        title="Availability Cost"
        description="How do missing players relate to the final score margin? Compare historical associations, measured after games."
      />
      <MethodLink surfaceHref="/availability" /></header>
      <p className="text-body leading-relaxed text-[var(--term-text-muted)]">
        <KeepTogether>Published study: {AVAILABILITY_SAMPLE.firstSeason} through {AVAILABILITY_SAMPLE.lastSeason}.</KeepTogether>
        {" "}This retrospective analysis changes when the study is rerun; it is not a live availability feed.
      </p>
      <AvailabilityContent />
    </div>
  );
}
