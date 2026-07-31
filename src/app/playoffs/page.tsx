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
      <PageHeader
        eyebrow="PLAYOFF REST"
        title="The round before decides the round after"
        description="How a long series taxes the team that survived it, why the effect survives the obvious objection, and what it costs the model's picks in the bracket below."
      />
      <MethodLink surfaceHref="/playoffs" />

      {/* Argument first, bracket second. These are siblings on purpose: showing the bracket
          first is a swap of these two lines, not a rewrite of either. */}
      <PlayoffRestArgument />
      <PlayoffsContentLazy />
    </div>
  );
}
