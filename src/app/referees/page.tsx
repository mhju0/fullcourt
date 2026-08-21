import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { RefereeEffectContent } from "@/components/referee-effect-content";
import legendsData from "@/data/referee-legends.json";
import styleData from "@/data/referee-foul-style.json";
import timingData from "@/data/referee-timing.json";
import type { RefereeFoulStyle } from "@/lib/referee-foul-style";
import type { RefereeLegends } from "@/lib/referee-legends";
import type { RefereeTiming } from "@/lib/referee-timing";

const data = styleData as RefereeFoulStyle;
const timing = timingData as RefereeTiming;
const legends = legendsData as RefereeLegends;

export const metadata: Metadata = {
  title: "Referee Effect",
  description:
    "How NBA officials differ in the kinds of foul they call and when they call them — and what eleven seasons say about the beliefs that attach to individual referees.",
};

/**
 * Referee Effect — **published 2026-08-22**, on Michael's explicit instruction.
 *
 * This page was deliberately held back from 2026-07-30 until now, and the history matters because
 * the reason it was held back is the reason the finished page is shaped the way it is. A table of
 * per-official numbers with unfinished framing invites exactly the bias reading the page exists to
 * refuse: three officials work every game and the play-by-play never records which one blew the
 * whistle, so every figure is roughly a third of the effect it names.
 *
 * It was also published in error once, on 2026-08-04, as a side effect of a documentation-currency
 * pass, and reverted (PRs #9 → #10). **That failure mode now runs the other way.** The page is
 * live; a future pass that finds the old "deliberately unpublished" wording in a doc and "restores"
 * the in-progress card would be repeating the same mistake in reverse. Unpublishing is as
 * deliberate an act as publishing was.
 *
 * What makes naming real officials beside real records defensible is enforced, not remembered:
 * `referee-legends.test.ts` fails if the famous pair ever beats the noise floor it is measured
 * against, if the 689-pair grid climbs above chance, or if the same official stops appearing at
 * both ends of the list. `referee-timing.test.ts` pins the home-tilt band at both ends. Read
 * `ml/REFEREE_PLAYER_REPORT.md` and `ml/referee_player_preregistration.md` before changing any
 * figure or any sentence built on one.
 */
export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="REFEREE EFFECT · FOULS PER GAME"
        title="What each official calls"
        // Two lines at 1440px is a contract, not a preference — e2e/page-headers.spec.ts
        // measures the wrapped line boxes. The population and the caveat both get said at
        // length in the body; this has room for the refusal only.
        description="What separates officials is the mix of fouls they call and when they arrive — not who they favour. Three work every game, so nothing here is a fairness claim."
      />

      <MethodLink surfaceHref="/referees" />

      <RefereeEffectContent style={data} timing={timing} legends={legends} />
    </div>
  );
}
