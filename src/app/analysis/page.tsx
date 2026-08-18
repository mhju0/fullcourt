import type { Metadata } from "next";
import { AnalysisContentLazy } from "@/components/analysis-lazy";
import type { DataAsOf } from "@/lib/data-as-of";
import { getDataAsOf } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Model Results",
};

/**
 * Revalidated daily, for the "as of" stamp below and nothing else: the figures on this page
 * still arrive from /api/analysis in the client. The stamp moves when a game goes final,
 * which is what the daily pipeline does — prerendered once, it would name a date that
 * receded further from the truth with every run.
 */
export const revalidate = 86400;

/**
 * Null when there is no database to read — a build without DATABASE_URL (CI, or an
 * unconfigured clone). The page then renders without a stamp rather than with an empty one;
 * the same shape as the front door's evidence figures, and the reason `formatDataAsOf`
 * returns null rather than a placeholder.
 */
async function loadAsOf(): Promise<DataAsOf | null> {
  if (!process.env.DATABASE_URL) return null;

  return getDataAsOf();
}

// The page header (eyebrow + "Model Results" h1) lives inside AnalysisContentLazy in the
// terminal style — keep it there to avoid a duplicate heading. The stamp is passed through it
// for the same reason: the heading it qualifies is in there.
export default async function AnalysisPage() {
  return <AnalysisContentLazy asOf={await loadAsOf()} />;
}
