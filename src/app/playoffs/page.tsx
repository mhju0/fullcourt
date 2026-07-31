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
        description="How likely each playoff series is to go the home-court team's way. A separate model driven mainly by regular-season record. Its value is the calibration, not the pick."
      />
      <MethodLink surfaceHref="/playoffs" />

      <PlayoffsContentLazy />
    </div>
  );
}
