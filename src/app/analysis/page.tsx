import type { Metadata } from "next";
import { AnalysisContentLazy } from "@/components/analysis-lazy";

export const metadata: Metadata = {
  title: "Analysis",
};

// The page header (eyebrow + "Rest Advantage Analysis" h1) lives inside
// AnalysisContentLazy in the terminal style — keep it there to avoid a duplicate heading.
export default function AnalysisPage() {
  return <AnalysisContentLazy />;
}
