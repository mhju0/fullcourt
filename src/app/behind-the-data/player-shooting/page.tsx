import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";

export const metadata: Metadata = {
  title: "Shooting by Rest · Behind the Data",
  description:
    "How the no-rest against three-days-rest shooting split is built: the rest definition, effective field goal percentage, the attempt floor, and how much of any split is noise.",
};

export default function PlayerShootingMethodPage() {
  return (
    <BehindTheDataShell
      topic="player-shooting"
      eyebrow="BEHIND THE DATA · SHOOTING BY REST"
      title="Shooting by Rest"
      description="Player shooting on no rest compared with three or more days of rest, with attempt counts and uncertainty shown for each split."
    >
      <Section label="THE SPLIT" title="The two rest groups">
        <Prose>
          Rest is measured from the player&rsquo;s own appearances. A player returning after
          several days away can be rested even when the team played the night before.
        </Prose>
        <Formula>
          {`no rest      played again the very next day
3+ days rest  three or more days since his last appearance
rest effect   eFG% on 3+ days − eFG% on no rest`}
        </Formula>
        <Note>
          Games with one or two days of rest are excluded from this comparison. The two
          buckets isolate the shortest and longest rest categories used on the page.
        </Note>
      </Section>

      <Section label="THE METRIC" title="Shooting efficiency: eFG%">
        <Prose>
          Shooting is measured as <strong>effective field goal percentage</strong>, which credits
          a three-pointer at 1.5 times a two-pointer to account for the extra point. Raw field
          goal percentage counts every made shot equally.
        </Prose>
        <Formula>{`eFG% = (FGM + 0.5 × 3PM) / FGA`}</Formula>
      </Section>

      <Section label="HOW MUCH IS NOISE" title="Attempts and uncertainty" disclosure>
        <Prose>
          A rest effect is a difference of two percentages, each from a limited number of
          attempts, so it carries real uncertainty. The page computes the standard error of
          that difference and uses it to decide which splits to emphasise. Smaller splits
          relative to their uncertainty are muted.
        </Prose>
        <Formula>{`standard error ≈ √( 2500 / noRestFGA + 2500 / restedFGA )`}</Formula>
        <Prose>
          The 2500 comes from a binary outcome with a 50% make probability, expressed in
          percentage points. It is an approximation: eFG% weights three-pointers differently,
          and attempts within a game are not necessarily independent. Fewer attempts produce
          a larger uncertainty estimate.
        </Prose>
        <ValueGrid
          values={[
            { label: "Default attempt floor", value: "300+", sub: "field goal attempts" },
            { label: "Rest states compared", value: "0 vs 3+", sub: "days since he played" },
            { label: "Metric", value: "eFG%", sub: "threes weighted 1.5×" },
          ]}
        />
        <Note>
          Lowering the adjustable attempt floor includes more players, but their splits
          generally have fewer attempts and greater uncertainty.
        </Note>
      </Section>

      <Section label="CAREER ESTIMATES" title="How career estimates are adjusted" disclosure>
        <Prose>
          Career estimates require at least 150 attempts in each rest group. The export
          shrinks each raw gap toward the mean gap among eligible players, with more shrinkage
          when its standard error is larger. This reduces uncertain extremes; it does not
          remove differences in opponents, shot selection, or reasons for missing games.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Shot difficulty. A rested player taking harder shots against a set defence can shoot worse while playing better.",
            "Why a player missed games. An injury and planned rest can produce the same gap between appearances without providing the same recovery.",
            "Opponent quality and defensive scheme.",
            "Minutes and fatigue within a game. This is about rest before tip-off, not late-game legs.",
            "A single season can contain too few attempts to distinguish a rest association from sampling variation. Compare the uncertainty and season-by-season results before interpreting a split.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
