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
  title: "Availability Cost — Behind the Data",
  description:
    "How the cost of a missing player is measured: what counts as the rotation, why an absence is valued above replacement rather than by minutes, and why the schedule effects survive the control.",
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
      description="What a missing rotation player costs, in the same points of final margin as the schedule effects. Measured after the fact, from who actually took the floor — this is not a forecast, and it is not an injury report."
    >
      <Section label="WHAT COUNTS AS MISSING" descriptor="THE ROTATION, NOT THE ROSTER">
        <Prose>
          A player is missing when the team had been playing him and then did not. That has to be
          worked out from <strong>prior participation</strong>{" "}
          rather than from tonight&rsquo;s box score, because a player on a long-term injury often
          does not appear on the sheet at all — no row, no did-not-play note, nothing. Counting
          listed absences would quietly treat the longest absences as though they had never
          happened.
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
          The window is short on purpose. A rotation is not a season-long fact — it changes with
          trades, with a coach&rsquo;s patience, and with who is already hurt. Five games is
          recent enough to describe the team that actually took the floor last week and long
          enough that one blowout does not redefine it.
        </Note>
      </Section>

      <Section label="WHAT AN ABSENCE IS WORTH" descriptor="VALUE ABOVE REPLACEMENT">
        <Prose>
          Not every absence is the same size, so each one is weighted by the player&rsquo;s value
          — measured over a longer history than rotation membership, since how good a player is
          moves far more slowly than whether he is currently in the rotation. Value is{" "}
          <strong>Game Score</strong>, a single number from the box score line.
        </Prose>
        <Formula>
          {`GmSc = PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA − FTM)
       + 0.7·ORB + 0.3·DRB + STL + 0.7·AST + 0.7·BLK
       − 0.4·PF − TOV

value = max(0, player's GmSc − the team's own rotation median)`}
        </Formula>
        <Prose>
          The second line is the part that matters. What a team loses is not the missing
          player&rsquo;s production, it is the <strong>gap to whoever takes his minutes</strong>.
          Subtracting the team&rsquo;s own rotation median makes a missing sixth man cost close to
          nothing and a missing star cost a great deal, which is the shape the effect actually
          has.
        </Prose>
        <Note>
          This was not assumed. Five weightings were tested against the same baseline — minutes,
          points, raw Game Score, Game Score above replacement, and a plain
          best-player-out flag — and value above replacement won on residual error. The
          comparison is in <code>ml/availability_quality.py</code>; weighting by minutes alone,
          which is the obvious first idea, was the weakest of the continuous measures.
        </Note>
      </Section>

      <Section label="TURNING THAT INTO POINTS" descriptor="THE REGRESSION">
        <Prose>
          Every figure on the surface is a coefficient from a regression on{" "}
          <strong>final margin</strong>, not on wins. A win-or-lose outcome throws away the size
          of the result, which is most of the information a game carries; margin keeps it, and
          gives each effect a far tighter error bar.
        </Prose>
        <Formula>
          {`home margin ~ home court
              + team strength (home − away)
              + season position
              + schedule terms      (away − home)
              + absence value       (away − home)`}
        </Formula>
        <Prose>
          Every term is <strong>differenced</strong>, away minus home, so anything that affects
          both teams equally cancels and contributes nothing — the same convention the rest
          advantage metric already uses. Team strength is each side&rsquo;s win rate in its{" "}
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
          they split unstably — one of them even flips sign. So each published effect comes from
          its own specification rather than from a single model carrying all of them, and they
          should be read as separate answers to separate questions, never summed.
        </Note>
      </Section>

      <Section label="WHY THE SCHEDULE STILL COUNTS" descriptor="THE CONTROL THAT MATTERED">
        <Prose>
          The obvious objection to this whole site is that its schedule effects are really
          absences in disguise: teams rest their stars on the second night of a back-to-back, so
          perhaps a back-to-back does not tire anyone and simply predicts who sits. Putting
          absence and the schedule terms into one regression tests that directly.
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
          Every schedule effect moves by under {Math.ceil(WORST_SHIFT)}%. Teams do rest people
          more on a back-to-back, and it accounts for almost none of what a back-to-back costs.
          The objection is reasonable and the answer is that it is wrong.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "It is not a forecast. Who sat is known only because the game was played. Lineups are not settled until shortly before tip, so nothing here says who will be available tonight.",
            "It does not know why a player was out. Injury, load management, suspension and a personal matter are one category here, and they are not the same thing.",
            `It does not know who replaced him. Replacement level is the team's own rotation median, which is a reasonable stand-in and not the actual substitute.`,
            "Game Score is a box-score measure, so it undervalues defence. A defensive anchor's absence is worth more than this credits.",
            `A basketball game is mostly noise. Final margins vary by ${AVAILABILITY_NOISE.marginStdDev.toFixed(1)} points, and knowing both teams' records, their schedule and who was missing still leaves ${AVAILABILITY_NOISE.rmseWithAbsence.toFixed(1)}. These effects are real and precisely estimated; they are a small share of what happens.`,
            `Coverage starts in ${AVAILABILITY_SAMPLE.firstSeason}, where the player box scores this rests on begin — earlier than that, the site can score a schedule but not a lineup.`,
            "The effects are averages across three decades. The rate of playing without a best player tripled over that span, so a single figure describes an era that changed underneath it.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
