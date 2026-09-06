import type { Metadata } from "next";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  AVAILABILITY_DEFINITION,
  AVAILABILITY_EFFECTS,
  AVAILABILITY_FREQUENCY,
  AVAILABILITY_NOISE,
  AVAILABILITY_SAMPLE,
  AVAILABILITY_SCHEDULE_HOLDS_UP,
} from "@/lib/availability-facts";

export const metadata: Metadata = {
  title: "Availability Cost · Behind the Data",
  description:
    "How missing rotation players are identified, valued using Game Score, and included in an analysis of final margin alongside schedule terms.",
};

const D = AVAILABILITY_DEFINITION;
const E = AVAILABILITY_EFFECTS;

/** The largest of the four shifts, so the prose cannot drift from the table it describes. */
const WORST_SHIFT = Math.max(
  ...Object.values(AVAILABILITY_SCHEDULE_HOLDS_UP).map((t) => Math.abs(t.shiftPct))
);

export default function AvailabilityMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · AVAILABILITY COST"
      title="Availability cost"
      description="How missing rotation players are associated with final margin. Availability is measured from completed games, so these results do not forecast tonight's lineup."
    >
      <Section label="WHAT COUNTS AS MISSING" descriptor="THE ROTATION, NOT THE ROSTER">
        <Prose>
          A missing player belongs to the team&rsquo;s recent rotation but records no minutes
          in the game. Rotation membership comes from <strong>prior participation</strong>,
          because a box score may omit players who did not play. A player eventually drops out
          of this measure after a long absence as their appearances leave the rotation window.
        </Prose>
        <Formula>
          {`rotation   averaged ${D.rotationMinutes}+ minutes across the team's previous
           ${D.rotationWindowGames} games, in at least ${D.minAppearances} of them
missing    a rotation member who recorded no minutes tonight`}
        </Formula>
        <ValueGrid
          values={[
            { label: "Rotation window", value: `${D.rotationWindowGames} games`, sub: "the team's own previous games" },
            { label: "Rotation threshold", value: `${D.rotationMinutes} min`, sub: "average across that window" },
            { label: "Typical rotation", value: `${AVAILABILITY_FREQUENCY.meanRotationSize.toFixed(1)}`, sub: "players, measured" },
          ]}
        />
        <Note>
          The short window lets the rotation change with trades, coaching decisions, and
          injuries. Its thresholds reduce the influence of a single appearance but can miss
          players whose minutes have already fallen during an injury.
        </Note>
      </Section>

      <Section label="WHAT AN ABSENCE IS WORTH" descriptor="VALUE ABOVE REPLACEMENT">
        <Prose>
          Each absence is weighted by <strong>Game Score</strong>, a summary of box-score
          production measured over a longer history than rotation membership.
        </Prose>
        <Formula>
          {`GmSc = PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA − FTM)
       + 0.7·ORB + 0.3·DRB + STL + 0.7·AST + 0.7·BLK
       − 0.4·PF − TOV

value = max(0, player's GmSc − the team's own rotation median)`}
        </Formula>
        <Prose>
          The team&rsquo;s rotation median is a proxy for replacement production. An absent
          player above that median contributes a positive missing-value score; one at or below
          it contributes zero. This does not identify who actually took the missing minutes.
        </Prose>
        <Note>
          Five weightings were compared against the same baseline: minutes,
          points, raw Game Score, Game Score above replacement, and a plain
          best-player-out flag. Value above replacement had the lowest residual error. The
          comparison is in <code>ml/availability_quality.py</code>; weighting by minutes alone,
          was the weakest of the continuous measures. This comparison describes model fit,
          not a held-out forecast evaluation.
        </Note>
      </Section>

      <Section label="TURNING THAT INTO POINTS" descriptor="THE REGRESSION">
        <Prose>
          Every figure on the surface is a coefficient from a regression on{" "}
          <strong>final margin</strong>. Margin retains the size of each result and expresses
          the estimated associations in points.
        </Prose>
        <Formula>
          {`home margin ~ home court
              + team strength (home − away)
              + season position
              + schedule terms      (away − home)
              + absence value       (away − home)`}
        </Formula>
        <Prose>
          Schedule and absence terms are <strong>differenced</strong>, away minus home;
          team strength uses home minus away. Equal values on both sides cancel.
          Team strength is each side&rsquo;s win rate in its{" "}
          <em>prior</em> games only, shrunk toward .500 early in a season so an October record is
          not read as established. It is in the model as a control, never as a published effect:
          without it, an absence would be credited with some of the fact that weaker teams are
          missing players more often.
        </Prose>
        <ValueGrid
          values={[
            { label: "Games measured", value: AVAILABILITY_SAMPLE.games.toLocaleString(), sub: `${AVAILABILITY_SAMPLE.firstSeason} onward` },
            { label: "Best player out", value: `${E.bestPlayerOut.points.toFixed(2)} pts`, sub: `t = ${E.bestPlayerOut.t.toFixed(1)}` },
            { label: "Per point above replacement", value: `${E.missValuePerPoint.points.toFixed(2)} pts`, sub: `t = ${E.missValuePerPoint.t.toFixed(1)}` },
          ]}
        />
        <Note>
          The absence measures are strongly correlated with one another, and entered together
          their estimates become unstable, including a sign reversal. Each published effect comes from
          its own specification rather than from a single model carrying all of them, and they
          should be read as separate answers to separate questions, never summed.
        </Note>
      </Section>

      <Section label="WHY THE SCHEDULE STILL COUNTS" descriptor="THE CONTROL THAT MATTERED">
        <Prose>
          Teams may rest players on the second night of a back-to-back. Adding measured
          absences to the regression checks how much of the schedule association those
          absences account for.
        </Prose>
        <Formula>
          {Object.entries(AVAILABILITY_SCHEDULE_HOLDS_UP)
            .map(
              ([name, t]) =>
                `${name.padEnd(18)} ${t.scheduleOnly.toFixed(3)} → ${t.absenceControlled.toFixed(3)}  (${t.shiftPct.toFixed(1)}%)`
            )
            .join("\n")}
        </Formula>
        <Prose>
          Every schedule coefficient moves by under {Math.ceil(WORST_SHIFT)}%. Measured
          absences account for little of these associations in this specification. That does
          not rule out unmeasured absences, changes in playing time, or other confounders.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="LIMITATIONS">
        <LimitList
          items={[
            "It is not a forecast. Who sat is known only because the game was played. Lineups are not settled until shortly before tip, so nothing here says who will be available tonight.",
            "It does not know why a player was out. Injury, load management, suspension and a personal matter are one category here, and they are not the same thing.",
            `It does not know who replaced him. Replacement level is the team's own rotation median, which is a reasonable stand-in and not the actual substitute.`,
            "Game Score captures limited defensive information and may miss part of a defensive player's contribution.",
            `Final margins have a standard deviation of ${AVAILABILITY_NOISE.marginStdDev.toFixed(1)} points. The model's error remains ${AVAILABILITY_NOISE.rmseWithAbsence.toFixed(1)} points after including team records, schedule, and absences, leaving much of the variation unexplained.`,
            `Player box-score coverage starts in ${AVAILABILITY_SAMPLE.firstSeason}. Earlier games can receive schedule scores but not availability estimates.`,
            "The effects are averages across three decades. The rate of playing without a best player tripled over that span, so a single figure describes an era that changed underneath it.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
