import type { Metadata } from "next";
import { AvailabilityContent } from "@/components/availability-content";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Availability Cost",
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
      <PageHeader
        eyebrow="ROTATION ABSENCE · POINTS OF MARGIN"
        title="Availability Cost"
        description="Compare the estimated association between missing rotation players and final margin with home-court and schedule terms, using completed games."
      />
      <MethodLink surfaceHref="/availability" />
      <AvailabilityContent />
    </div>
  );
}
