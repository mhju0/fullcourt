import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PlayoffsContentLazy } from "@/components/playoffs-lazy";

export const metadata: Metadata = {
  title: "Playoff Predictor",
};

export default function PlayoffsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="PLAYOFF PREDICTOR"
        title="Series Predictions"
        description="Predicts playoff series winners from rest- and fatigue-derived features — the same rest-advantage lineage as the regular-season model, run through a separate series-level model."
      />

      <PlayoffsContentLazy />
    </div>
  );
}
