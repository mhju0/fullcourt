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
        description="PREDICTS PLAYOFF SERIES WINNERS FROM REST/FATIGUE-DERIVED FEATURES — SAME REST-ADVANTAGE LINEAGE AS THE REGULAR-SEASON MODEL, RUN THROUGH A SEPARATE SERIES-LEVEL MODEL."
      />

      <PlayoffsContentLazy />
    </div>
  );
}
