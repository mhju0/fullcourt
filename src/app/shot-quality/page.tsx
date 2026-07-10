import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ShotQualityContentLazy } from "@/components/shot-quality-lazy";

export const metadata: Metadata = {
  title: "Expected Shot Value",
};

export default function ShotQualityPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="EXPECTED SHOT VALUE · xeFG%"
        title="Expected Shot Value"
        description="LOCATION-BASED EXPECTED FIELD-GOAL EFFICIENCY BY COURT ZONE. NO DEFENDER DISTANCE OR SHOT CLOCK — PUBLIC NBA DATA CAPTURES WHERE A SHOT CAME FROM, NOT HOW CONTESTED IT WAS."
      />

      <ShotQualityContentLazy />
    </div>
  );
}
