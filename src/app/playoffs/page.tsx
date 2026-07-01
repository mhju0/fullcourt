import type { Metadata } from "next";
import { PlayoffsContentLazy } from "@/components/playoffs-lazy";

export const metadata: Metadata = {
  title: "Playoff Predictor",
};

export default function PlayoffsPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <span
          className="mono"
          style={{ fontSize: 10, letterSpacing: "0.08em", color: "#C9082A", fontWeight: 700 }}
        >
          PLAYOFF PREDICTOR
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Series Predictions</h1>
        <p className="mono max-w-2xl" style={{ fontSize: 11, color: "#8A8478", lineHeight: 1.5 }}>
          PREDICTS PLAYOFF SERIES WINNERS FROM REST/FATIGUE-DERIVED FEATURES — SAME REST-ADVANTAGE
          LINEAGE AS THE REGULAR-SEASON MODEL, RUN THROUGH A SEPARATE SERIES-LEVEL MODEL.
        </p>
      </div>

      <PlayoffsContentLazy />
    </div>
  );
}
