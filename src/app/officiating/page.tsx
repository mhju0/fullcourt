import type { Metadata } from "next";
import { Suspense } from "react";
import { OfficiatingContent } from "@/components/officiating-content";
import { summarizeSeasons, type ReviewSeason } from "@/lib/officiating";
import { loadOfficiatingPublication } from "@/lib/officiating-publication-server";
export const metadata: Metadata = {
  title: "Officiating",
  description:
    "Explore missed calls and incorrect whistles in the NBA’s Last Two Minute reports, by season, team, and game.",
};
export const revalidate = 60;
export default async function OfficiatingPage() {
  const { seasons, publication } = await loadOfficiatingPublication();
  return (
    <Suspense fallback={<p role="status">Loading officiating reports…</p>}>
      <div>
        {publication.status === "failed" && <p role="status">The latest refresh could not be confirmed. Showing the last published reports with their original dates.</p>}
        {publication.checkedAt && <p className="text-xs text-[var(--term-text-muted)]">Source checked {new Date(publication.checkedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.</p>}
        <OfficiatingContent seasons={summarizeSeasons(seasons as ReviewSeason[])} />
      </div>
    </Suspense>
  );
}
