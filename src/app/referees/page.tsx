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
 * It is held back because a table of per-official numbers with unfinished framing invites exactly
 * the bias reading the finished page exists to refuse — three officials work every game and the
 * play-by-play never records which blew the whistle.
 *
 * This is an editorial decision by Michael, not drift. Do not "fix" it as stale documentation;
 * that has happened once already. Publishing it is a deliberate edit, not a currency pass.
 *
 * **The finished copy now exists and is still not rendered.** `RefereeEffectContent`
 * (`src/components/referee-effect-content.tsx`) is the whole page: the foul-mix table, the
 * quarter-timing finding, the nulls measured on 2026-08-06 under the pre-registration in
 * `docs/adr/0007-referee-analysis-axes-are-pre-registered.md`, and — since 2026-08-21 — the
 * folklore chapter, which tests the sport's most repeated claims about individual officials
 * against the playoffs where they are actually told. It is written, tested and left unwired on
 * purpose, so publishing stays one deliberate line rather than a side effect.
 *
 * Publishing is two edits and no rewriting:
 *   1. swap the `MessageCard` below for
 *      `<RefereeEffectContent style={data} timing={timing} legends={legends} />`, importing
 *      `timing` from `@/data/referee-timing.json` and `legends` from
 *      `@/data/referee-legends.json`, and
 *   2. turn `test.describe.skip` back into `test.describe` in `e2e/referees.spec.ts`.
 *
 * Publishing names real officials beside real records. Everything that makes that defensible —
 * the noise floor beside every extreme pair, the same official shown as both a curse and a
 * charm, the refusal to judge either era of the famous claim — is enforced by
 * `referee-legends.test.ts` rather than left to the prose. Read `ml/REFEREE_PLAYER_REPORT.md`
 * before changing any of it.
 *
 * The card's own wording still describes the writing as unfinished. That sentence is now out of
 * date and is deliberately left standing: it is user-facing copy on a live page, so changing what
 * a visitor reads here is Michael's call in the same way publishing it is.
 */
export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-12">
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
