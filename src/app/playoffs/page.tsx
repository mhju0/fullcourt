import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { PlayoffRestArgument } from "@/components/playoff-rest-sections";
import { PlayoffsContentLazy } from "@/components/playoffs-lazy";

export const metadata: Metadata = {
  title: "Playoff Rest",
};

export default function PlayoffsPage() {
  return (
    <div className="flex flex-col gap-12">
      <header className="page-intro"><PageHeader
        eyebrow="PRIOR-ROUND GRIND · SERIES WIN RATE"
        title="Playoff Rest"
        description="Compare prior-round workload and series results, then explore probabilities from a model using team records and playoff history."
      />
      <MethodLink surfaceHref="/playoffs" /></header>

      {/* Finding first, bracket second. These are siblings on purpose: showing the bracket
          first is a swap of these two lines, not a rewrite of either. */}
      <PlayoffRestArgument />
      <PlayoffsContentLazy />
    </div>
  );
}
