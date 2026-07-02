import type { Metadata } from "next";
import { ShotQualityContentLazy } from "@/components/shot-quality-lazy";

export const metadata: Metadata = {
  title: "Expected Shot Value",
};

export default function ShotQualityPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <span
          className="mono"
          style={{ fontSize: 10, letterSpacing: "0.08em", color: "#C9082A", fontWeight: 700 }}
        >
          EXPECTED SHOT VALUE · xeFG%
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expected Shot Value</h1>
        <p className="mono max-w-2xl" style={{ fontSize: 11, color: "#8A8478", lineHeight: 1.5 }}>
          LOCATION-BASED EXPECTED FIELD-GOAL EFFICIENCY BY COURT ZONE. NO DEFENDER DISTANCE OR SHOT
          CLOCK — PUBLIC NBA DATA CAPTURES WHERE A SHOT CAME FROM, NOT HOW CONTESTED IT WAS.
        </p>
      </div>

      <ShotQualityContentLazy />
    </div>
  );
}
