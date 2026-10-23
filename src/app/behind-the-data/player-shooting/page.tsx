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
      description="Player shooting on no rest compared with two to 29 days off, with shot counts and uncertainty for each split."
    >
      <Section label="THE SPLIT" title="The two rest groups">
        <Prose>
          Rest is counted from the player&rsquo;s own games, not the team&rsquo;s. A player
          back after a week away is rested even if the team played last night.
        </Prose>
        <Formula>
          {`no rest     played the day before
rested      2 to 29 full days off

rest effect = eFG% rested
            − eFG% no rest`}
        </Formula>
        <Prose>
          The table labels the rested group “2+ days rest”; its exact range is two to 29
          full days off (three to 30 days since the previous appearance).
          An appearance counts even with no shot attempt. NBA Cup games count toward rest; the
          shooting numbers use regular-season shots only.
        </Prose>
        <Note>
          Left out: games after exactly one day off, and games after 30 or more days off, including season openers and returns from long absences. This is a long-absence
          filter based on the gap between appearances, not an injury flag. Shorter injury
          absences can remain in the rested group. Orlando bubble shots are left out
          too, though bubble games still count toward rest.
        </Note>
      </Section>

      <Section label="THE METRIC" title="Shooting efficiency: eFG%">
        <Prose>
          Shooting is measured as <strong>effective field goal percentage</strong> (eFG%). It
          counts a made three as 1.5 made twos, for the extra point.
        </Prose>
        <Formula>{`eFG% = 100 × (FGM + 0.5 × 3PM)
             ÷ FGA`}</Formula>
      </Section>

      <Section label="HOW MUCH IS NOISE" title="Attempts and uncertainty" disclosure>
        <Prose>
          A rest effect is the difference of two percentages, each from a limited number of
          shots, so it carries noise. For one-season splits, the page estimates that noise as a
          standard error:
        </Prose>
        <Formula>{`SE ≈ √( 2500 ÷ FGA no rest
       + 2500 ÷ FGA rested )`}</Formula>
        <Prose>
          A difference smaller than one standard error is shown muted. That is a rough flag,
          not a 95% significance test. The 2500 assumes each shot is a 50/50 make, in
          percentage points. It is an approximation: eFG% weights threes differently, and shots
          in one game are not fully independent. Fewer shots mean a larger SE.
        </Prose>
        <ValueGrid
          values={[
            { label: "Default attempt floor", value: "300+", sub: "total shots, not per group" },
            { label: "Rest states compared", value: "0 vs 2–29", sub: "days off between appearances" },
            { label: "Metric", value: "eFG%", sub: "threes weighted 1.5×" },
          ]}
        />
        <Note>
          Lowering the attempt floor adds players, but their splits rest on fewer shots and are
          noisier.
        </Note>
        <Note>
          Historical seasons come from a verified export. Current-season ESPN observations
          update separately after fixture and box-score checks. A first observed appearance
          has no inferred prior-season rest. Current identities are not joined to historical
          careers by name.
        </Note>
      </Section>

      <Section label="CAREER ESTIMATES" title="How career estimates are adjusted" disclosure>
        <Prose>
          Historical career estimates need at least 150 shots in each rest group. Raw records
          remain available below that floor. Standard errors use the observed variance of
          attempts worth zero, one or one-and-a-half eFG makes. A single attempt cannot
          estimate sampling variation; repeated identical outcomes do not establish certainty.
        </Prose>
        <Prose>
          Each raw gap is then pulled toward the average gap of all eligible players. Noisier
          gaps are pulled harder. This tames extreme values from small samples. It does not
          remove differences in opponents, shot selection or why games were missed.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Shot difficulty. A rested player taking harder shots against a set defence can shoot worse while playing better.",
            "Why a player missed games. An injury and planned rest leave the same gap but not the same recovery.",
            "Preseason and exhibition games are not in the appearance history. When an unknown appearance could change a player's rest group, those shots are dropped from both groups.",
            "Opponent quality and defensive scheme.",
            "Minutes and fatigue within a game. This is about rest before tip-off, not late-game legs.",
            "One season can hold too few shots to tell a real rest pattern from chance. Check the uncertainty and other seasons before reading much into a split.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
