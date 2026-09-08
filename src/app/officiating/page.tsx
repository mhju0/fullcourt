import type { Metadata } from "next";
import { Suspense } from "react";
import { OfficiatingContent } from "@/components/officiating-content";
import type { ReviewSeason } from "@/lib/officiating";
import data from "@/data/officiating.json";
export const metadata: Metadata = {
  title: "Officiating",
  description:
    "Explore missed calls and incorrect whistles in the NBA’s Last Two Minute reports, by season, team, and game.",
};
export default function OfficiatingPage() {
  return (
    <Suspense fallback={<p role="status">Loading officiating reports…</p>}>
      <OfficiatingContent seasons={data.seasons as ReviewSeason[]} />
    </Suspense>
  );
}
