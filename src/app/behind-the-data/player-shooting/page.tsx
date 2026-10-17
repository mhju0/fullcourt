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
  title: "Player Shooting by Rest · Behind the Data",
  description:
    "How the no-rest against two-to-29-days-off shooting split is built: the rest definition, effective field goal percentage, the attempt floor, and how much of any split is noise.",
};

export default function PlayerShootingMethodPage() {
  return (
    <BehindTheDataShell
      topic="player-shooting"
      eyebrow="BEHIND THE DATA · PLAYER SHOOTING BY REST"
      title="Player Shooting by Rest"
      description="Player shooting on no rest compared with two to 29 days off, with attempt counts and uncertainty shown for each split."
    >
      <Section label="THE SPLIT" title="The two rest groups">
        <Prose>
          Rest is measured from the player&rsquo;s own appearances. A player returning after
          several days away can be rested even when the team played the night before.
        </Prose>
        <Formula>
          {`no rest       played again the very next day
2–29 days off two to 29 full days between appearances
rest effect   eFG% on 2–29 days off − eFG% on no rest`}
        </Formula>
        <Note>
          Games after exactly one day off are excluded from this comparison, and so are gaps
          of 30 days or more: every season opener and every return from a long absence. Those
          are not rest between games.
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
            { label: "Rest states compared", value: "0 vs 2–29", sub: "days off between appearances" },
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
