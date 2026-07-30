import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { PlayoffsContentLazy } from "@/components/playoffs-lazy";

export const metadata: Metadata = {
  title: "Playoff Predictor",
};

export default function PlayoffsPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="PLAYOFF PREDICTOR"
        title="Series Predictions"
        description="Estimates how likely each playoff series is to go the home-court team's way. A separate series-level model, driven mainly by regular-season record, with a modest rest-versus-rust term. Its value is the calibration of the probability, not the pick."
      />
      <MethodLink surfaceHref="/playoffs" />

      <PlayoffsContentLazy />
    </div>
  );
}
