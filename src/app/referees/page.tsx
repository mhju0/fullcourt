import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Referee Effect",
};

/**
 * Placeholder, deliberately empty.
 *
 * The ingest still exists (`scripts/fetch_officials.ts`) and its aggregate
 * (`src/data/referee-whistle.json`) is still guarded by `referee-whistle.test.ts`, so the
 * data layer is intact and this page can return without a re-ingest. What was here was a
 * table whose central question — does any referee tilt the whistle home? — came back inside
 * noise. A page of muted cells invites readers to find names in it anyway, so it is better
 * to show nothing than to show something that looks like evidence and is not.
 */
export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="REFEREE EFFECT"
        title="Coming soon"
        description="This page is still being built."
      />
    </div>
  );
}
