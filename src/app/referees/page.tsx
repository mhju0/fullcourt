import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { MessageCard } from "@/components/ui/message-card";
import styleData from "@/data/referee-foul-style.json";
import type { RefereeFoulStyle } from "@/lib/referee-foul-style";

const data = styleData as RefereeFoulStyle;

export const metadata: Metadata = {
  title: "Referee Effect (in progress)",
  description:
    "How NBA officials differ in the kinds of foul they call. The data is collected; the surface is not finished and is not published yet.",
};

/**
 * Referee foul style — DELIBERATELY UNPUBLISHED.
 *
 * The ingest, the dataset, `RefereeStyleContent` and its tests all still exist and are wired to
 * work: restoring this page is swapping the card below back for `<RefereeStyleContent data={data} />`
 * and un-skipping the table block in `e2e/referees.spec.ts`. Nothing has been deleted.
 *
 * It is held back because the writing around the table is not finished to the standard the rest
 * of the site is held to, and a table of per-official numbers with unfinished framing invites
 * exactly the bias reading the finished page exists to refuse — three officials work every game
 * and the play-by-play never records which blew the whistle.
 *
 * This is an editorial decision by Michael, not drift. Do not "fix" it as stale documentation;
 * that has happened once already. Publishing it is a deliberate edit, not a currency pass.
 */
export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="REFEREE EFFECT · IN PROGRESS"
        title="What each official calls"
        description={`Officials don't call the same game the same way. The data behind this is collected — ${data.gamesCovered.toLocaleString()} games since ${data.firstSeason} — but the surface is not finished, so it is not published yet.`}
      />

      <MessageCard
        tone="muted"
        title="IN PROGRESS"
        body="The collection and the table are built. The writing that has to sit around them is not — so this is held back rather than shipped half-finished."
      />
    </div>
  );
}
