import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ShotQualityContentLazy } from "@/components/shot-quality-lazy";

export const metadata: Metadata = {
  title: "Expected Shot Value",
};

export default function ShotQualityPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="EXPECTED SHOT VALUE · xeFG%"
        title="Expected Shot Value"
        description="Location-based expected field-goal efficiency by court zone. No defender distance or shot clock — public NBA data captures where a shot came from, not how contested it was."
      />

      <ShotQualityContentLazy />
    </div>
  );
}
