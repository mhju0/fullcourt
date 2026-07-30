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
  title: "Player Shooting — Behind the Data",
  description:
    "How the no-rest against three-days-rest shooting split is built: the rest definition, effective field goal percentage, the attempt floor, and how much of any split is noise.",
};

export default function PlayerShootingMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · PLAYER SHOOTING"
      title="Player shooting"
      description="Every player's shooting on no rest against three days off, season by season. The honest headline is that one season of it is mostly noise, and the page is built to say so."
    >
      <Section label="THE SPLIT" descriptor="TWO REST STATES">
        <Prose>
          Each of a player&rsquo;s games is labelled by how long <em>he</em> had rested — counted
          from the games he actually played, not his team&rsquo;s schedule. A player returning
          from injury into a team back-to-back is rested; the team is not.
        </Prose>
        <Formula>
          {`no rest      played again the very next day
3+ days rest  three or more days since his last appearance
rest effect   eFG% on 3+ days − eFG% on no rest`}
        </Formula>
        <Note>
          The two buckets deliberately do not cover everything. One and two days of rest are
          the overwhelming majority of games and sit between the two states being contrasted;
          including them would blur exactly the comparison the page exists to make.
        </Note>
      </Section>

      <Section label="THE METRIC" descriptor="EFFECTIVE FIELD GOAL %">
        <Prose>
          Shooting is measured as <strong>effective field goal percentage</strong>, which credits
          a three-pointer at 1.5 times a two because it is worth 1.5 times as much. Raw field
          goal percentage would punish a high-volume three-point shooter for taking the more
          valuable shot.
        </Prose>
        <Formula>{`eFG% = (FGM + 0.5 × 3PM) / FGA`}</Formula>
      </Section>

      <Section label="HOW MUCH IS NOISE" descriptor="THE STANDARD ERROR">
        <Prose>
          A rest effect is a difference of two percentages, each from a limited number of
          attempts, so it carries real uncertainty. The page computes the standard error of
          that difference and uses it to decide what is worth bolding — a split inside the
          noise is drawn muted rather than left to look like a discovery.
        </Prose>
        <Formula>{`standard error ≈ √( 2500 / noRestFGA + 2500 / restedFGA )`}</Formula>
        <Prose>
          The 2500 is a deliberate simplification: it treats every shot as a coin flip at 50%,
          which is close enough to real eFG% to give an honest scale and avoids implying more
          precision than the data supports. The practical consequence is the important part —
          a player with 60 no-rest attempts needs an enormous split before it means anything,
          and most players never clear it in a single season.
        </Prose>
        <ValueGrid
          values={[
            { label: "Default attempt floor", value: "300+", sub: "field goal attempts" },
            { label: "Rest states compared", value: "0 vs 3+", sub: "days since he played" },
            { label: "Metric", value: "eFG%", sub: "threes weighted 1.5×" },
          ]}
        />
        <Note>
          The attempt floor is adjustable on the page. Lowering it surfaces more players and
          more extreme-looking effects, almost all of which are small samples rather than real
          differences — which is the lesson the control is there to teach.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "Shot difficulty. A rested player taking harder shots against a set defence can shoot worse while playing better.",
            "Why a player was rested. Games missed through injury look identical to games missed for load management, and a player returning from injury is not 'rested' in any useful sense.",
            "Opponent quality and defensive scheme.",
            "Minutes and fatigue within a game. This is about rest before tip-off, not late-game legs.",
            "One season of any single player's split is mostly noise. The page shows season-by-season precisely so a reader can see how much a supposed effect moves year to year.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
