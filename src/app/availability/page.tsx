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
        eyebrow="AVAILABILITY COST"
        title="What a missing player is worth"
        description="Losing your best player costs about what playing at home is worth. Measured in points of final margin, on the same scale as the schedule effects the rest of this site is built on."
      />
      <MethodLink surfaceHref="/availability" />
      <AvailabilityContent />
    </div>
  );
}
