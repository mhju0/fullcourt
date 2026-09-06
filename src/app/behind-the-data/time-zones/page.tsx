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
import timeZoneData from "@/data/timezone-null.json";
import { FATIGUE_CONSTANTS } from "@/lib/fatigue";
import { signedNumber } from "@/lib/signed-number";
import {
  rawSwingPoints,
  strengthVsFatigueRatio,
  termRow,
  tripRow,
  type TimeZoneNull,
} from "@/lib/timezone-null";

export const metadata: Metadata = {
  title: "Time Zones · Behind the Data",
  description:
    "A pre-registered test of travel direction and short rest found no added predictive value after controlling for team strength and other schedule factors.",
};

const data = timeZoneData as TimeZoneNull;
const { protocol, logLoss } = data;

const east = tripRow(data, "east ≥ 3h");
const west = tripRow(data, "west ≥ 3h");
const eastShort = tripRow(data, "east ≥ 3h, short rest");
const westShort = tripRow(data, "west ≥ 3h, short rest");
const neither = tripRow(data, "no long shift either way");

const primary = termRow(data, data.primaryTerm);
const westShortTerm = termRow(data, "d_west3_short");

export default function TimeZonesMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · TIME ZONES"
      title="Time zones"
      description="Does eastward travel on short rest help explain game outcomes? The pre-registered test found no improvement in held-out predictions."
    >
      <Section label="WHAT WAS ASKED" descriptor="A NARROWER QUESTION THAN THE MODEL HAD TESTED">
        <Prose>
          The fatigue model already carries time-zone travel, and the weight-fitting work
          recorded in <strong>ADR 0006</strong> measured it as a{" "}
          <em>main effect across every game</em> and found no added predictive value.
          This test asks a narrower question: a long{" "}
          <strong>eastward</strong> shift arriving on <strong>short rest</strong>, where the body
          clock may have less time to adjust before tip-off.
        </Prose>
        <Prose>
          The protocol specified four candidate terms before the analysis ran, including one
          primary term for evaluating the hypothesis.
        </Prose>
        <ValueGrid
          values={[
            { label: "Threshold", value: `≥ ${protocol.thresholdHours}h`, sub: "zones crossed, signed" },
            { label: "Held-out seasons", value: String(protocol.folds), sub: `${protocol.heldOutGames.toLocaleString()} blind games` },
            { label: "Deciding term", value: data.primaryTerm, sub: `${primary.games} games` },
          ]}
        />
        <Note>
          Direction was not recoverable from the model&rsquo;s features before this. The stored
          zone count is an absolute value and the jet-lag term multiplies direction by a
          re-entrainment fraction, so &ldquo;east&rdquo; and &ldquo;west&rdquo; had to be added as
          a signed field first. It is <strong>reported and never scored</strong>: no term reads
          it, and no fatigue score anywhere on this site changed because it exists.
        </Note>
      </Section>

      <Section label="THE RAW SPLIT" descriptor="READ IT FOR THE DENOMINATORS, NOT THE EFFECT">
        <Prose>
          Before controlling for team strength, a visitor with an inferred clock shift of{" "}
          {protocol.thresholdHours} hours or more <strong>west</strong> loses{" "}
          {west.homeWinPct.toFixed(2)}% of the time; one with that shift{" "}
          <strong>east</strong> loses {east.homeWinPct.toFixed(2)}%, a{" "}
          {rawSwingPoints(data).toFixed(1)}-point swing around a{" "}
          {protocol.baselineHomeWinPct.toFixed(2)}% baseline.
        </Prose>
        <Formula>
          {`visitor's trip              games    home win %

all games in the era       ${protocol.gamesInEra.toLocaleString().padStart(6)}       ${protocol.baselineHomeWinPct.toFixed(2)}
east ≥ ${protocol.thresholdHours}h                  ${east.games.toLocaleString().padStart(6)}       ${east.homeWinPct.toFixed(2)}
east ≥ ${protocol.thresholdHours}h, short rest      ${eastShort.games.toLocaleString().padStart(6)}       ${eastShort.homeWinPct.toFixed(2)}
west ≥ ${protocol.thresholdHours}h                  ${west.games.toLocaleString().padStart(6)}       ${west.homeWinPct.toFixed(2)}
west ≥ ${protocol.thresholdHours}h, short rest      ${westShort.games.toLocaleString().padStart(6)}       ${westShort.homeWinPct.toFixed(2)}
no long shift either way   ${neither.games.toLocaleString().padStart(6)}       ${neither.homeWinPct.toFixed(2)}`}
        </Formula>
        <Note>
          Before reading that as jet lag, notice that it points the <strong>wrong way</strong>.
          Circadian disruption is supposed to punish <em>eastward</em> travel hardest, and here the
          eastward visitors do <em>better</em> than everyone else while the westward ones do worse.
          This is a reason to examine which teams make each kind of trip before attributing
          the difference to jet lag.
        </Note>
      </Section>

      <Section label="TEAM STRENGTH AND GEOGRAPHY" descriptor="DIFFERENT TEAMS IN EACH GROUP">
        <Prose>
          A {protocol.thresholdHours}-hour <strong>westward</strong> trip is, almost by definition,
          an Eastern-conference team visiting the Pacific coast. A {protocol.thresholdHours}-hour{" "}
          <strong>eastward</strong> trip is the reverse. The two cells are not two treatments of a
          comparable population. They are different sets of teams, and the home sides differ
          in quality accordingly.
        </Prose>
        <Formula>
          {`strength edge to the HOME side, by the visitor's trip
(positive = the home team was the better side)

east ≥ ${protocol.thresholdHours}h        ${signedNumber(east.strengthEdgeToHome ?? 0, 4)}      home win ${east.homeWinPct.toFixed(2)}%
west ≥ ${protocol.thresholdHours}h        ${signedNumber(west.strengthEdgeToHome ?? 0, 4)}      home win ${west.homeWinPct.toFixed(2)}%
no long shift   ${signedNumber(neither.strengthEdgeToHome ?? 0, 4)}      home win ${neither.homeWinPct.toFixed(2)}%`}
        </Formula>
        <Prose>
          The strength edge <strong>flips sign with the direction of travel</strong>, and the win
          rate follows it. Team strength is therefore a confound in the raw{" "}
          {rawSwingPoints(data).toFixed(1)}-point swing. The held-out test below asks whether
          direction adds predictive information after those differences are accounted for.
        </Prose>
        <Note>
          Denver and Utah are in Mountain time, about two hours from Eastern, so a {protocol.thresholdHours}-hour
          threshold excludes them by construction. Overlap between these terms and the model&rsquo;s
          visiting-altitude term is {primary.alsoAltitudePct.toFixed(1)}%.
        </Note>
      </Section>

      <Section label="HELD-OUT EVALUATION" descriptor="SIXTEEN SEASONS OUTSIDE TRAINING">
        <Prose>
          The test asks whether adding these terms improves predictions for held-out games,
          season by season, using the same walk-forward
          protocol ADR 0006 used.
        </Prose>
        <Formula>
          {`held-out log loss (lower is better)

strength only                    ${logLoss.strengthOnly.toFixed(5)}
+ the four fatigue terms         ${logLoss.baseline.toFixed(5)}     ${signedNumber(logLoss.baselineWorth, 5)}
+ east/west × short rest         ${logLoss.withCandidates.toFixed(5)}     ${signedNumber(logLoss.candidatesWorth, 5)}`}
        </Formula>
        <Prose>
          Adding all four candidates changes held-out log loss by{" "}
          <strong>{signedNumber(logLoss.candidatesWorth, 5)}</strong>, a small deterioration.
          The
          sign-clamped fit pinned <code>{data.primaryTerm}</code> at zero in{" "}
          <strong>
            {protocol.folds - primary.foldsNonZero} of {protocol.folds}
          </strong>{" "}
          folds, because the unconstrained estimate pointed toward an
          eastward flight on short rest being an <em>advantage</em>.
        </Prose>
        <ValueGrid
          values={[
            { label: "Candidates worth", value: signedNumber(logLoss.candidatesWorth, 5), sub: "held-out log loss" },
            { label: "Every fatigue term", value: signedNumber(logLoss.everyFatigueFactorCombined, 5), sub: "for comparison" },
            { label: "Strength alone", value: signedNumber(logLoss.strengthAlone, 3), sub: `≈ ${Math.round(strengthVsFatigueRatio(data))}× the whole fatigue model` },
          ]}
        />
      </Section>

      <Section label="OVERLAP WITH EXISTING TERMS" descriptor="STABILITY AND ADDED VALUE">
        <Prose>
          The westward short-rest term, <code>{westShortTerm.term}</code>, has a mean weight of {westShortTerm.meanWeight.toFixed(4)} in{" "}
          {westShortTerm.foldsNonZero} of {protocol.folds} folds, with a coefficient of variation
          of {westShortTerm.cv?.toFixed(2)}. By the stability standard ADR 0006 set, that is a
          stable term.
        </Prose>
        <Prose>
          It is worth {signedNumber(westShortTerm.aloneVsBaseline, 5)} when added to
          the baseline on its own. The reason is in the overlap:
        </Prose>
        <Formula>
          {`${westShortTerm.term}     ${westShortTerm.games} games
                    ${westShortTerm.alsoBackToBackPct.toFixed(1)}% are ALSO back-to-backs
                    ${westShortTerm.alsoAltitudePct.toFixed(1)}% are also visiting altitude`}
        </Formula>
        <Prose>
          Most of these games are already covered by the back-to-back term. A stable coefficient
          does not establish an independent contribution. The single-term comparison measures
          what the candidate adds beyond the existing baseline, as required by ADR 0006.
        </Prose>
      </Section>

      <Section label="WHAT THIS DOES NOT SAY" descriptor="INCLUDING ABOUT THE MODEL THAT SHIPPED">
        <Prose>
          This test did not change any constant in <code>fatigue.ts</code>. It also did not
          validate the existing directional multipliers.
        </Prose>
        <Formula>
          {`shipped today:   eastward multiplier   ${FATIGUE_CONSTANTS.eastwardMultiplier}
                 westward multiplier   ${FATIGUE_CONSTANTS.westwardMultiplier}

this test found: no added predictive value from direction`}
        </Formula>
        <Prose>
          The model treats an eastward shift as{" "}
          {(
            FATIGUE_CONSTANTS.eastwardMultiplier / FATIGUE_CONSTANTS.westwardMultiplier
          ).toFixed(2)}
          × as costly as a westward one. This measurement is <strong>not evidence that asymmetry
          is right.</strong> The test found no added predictive value from the directional terms.
          The ratified constants remain in the model, but this analysis does not verify them.
        </Prose>
        <Note>
          The question and evaluation rule were written down before the analysis ran. The result
          is published even though the tested terms did not improve predictions.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="LIMITATIONS">
        <LimitList
          items={[
            `Direction remains tied to geography. The analysis controls for team strength but does not match otherwise identical trips: a ${protocol.thresholdHours}-hour eastward trip usually involves a Western team.`,
            `It cannot see rest and direction as anything but a schedule fact. Nothing here observes a flight, a departure time, a hotel, or a minute of anyone's sleep. "Short rest" is a gap between dates on a calendar.`,
            "It cannot rule out smaller effects. The test found no predictive improvement across 16 held-out seasons; that does not establish that the biological effect is zero.",
            "It cannot speak to the playoffs. The protocol is regular-season walk-forward, and a postseason series has travel patterns and rest gaps this population does not contain.",
            `It cannot test the joint effect of altitude and these long shifts. The ${protocol.thresholdHours}-hour threshold excludes Denver and Utah, and overlap with the altitude term is ${primary.alsoAltitudePct.toFixed(1)}%.`,
            "Testing additional ideas on the same corpus increases the risk of selecting a chance result. New questions need a declared evaluation protocol.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
