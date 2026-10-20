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
    "A pre-registered test of home-base-to-venue clock displacement and short rest found no added predictive value after controlling for team strength and other schedule factors.",
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
      topic="time-zones"
      eyebrow="BEHIND THE DATA · TIME ZONES"
      title="Time zones"
      description="Does playing east of the team’s home time zone on short rest help explain game outcomes? The pre-registered test found no improvement in held-out predictions."
    >
      <Section label="WHAT WAS ASKED" title="The question tested">
        <Prose>
          The fatigue model already carries time-zone displacement, and the weight-fitting work
          recorded in <strong>ADR 0006</strong> measured it as a{" "}
          <em>main effect in the earlier regular-season research</em> and found no added predictive value.
          This test asks a narrower question: a visitor playing at a venue at least
          {" "}{protocol.thresholdHours} clock hours <strong>east of its modeled home base</strong>
          {" "}on <strong>short rest</strong>. Short rest means the visitor played the previous night.
          The shift compares the home base with tonight’s venue, not the previous game’s venue,
          and does not establish the direction or timing of a flight.
        </Prose>
        <Prose>
          The protocol specified four candidate terms before the analysis ran, including one
          primary term for evaluating the hypothesis. The original protocol was declared on
          August 18, 2026; the figures below were regenerated on {data.measuredOn} from
          corrected inputs. This research retains its completed regular-season cohort from
          2002-03 onward, including neutral and bubble games. It therefore differs from the
          public rested-home win-rate population.
        </Prose>
        <ValueGrid
          values={[
            { label: "Threshold", value: `≥ ${protocol.thresholdHours}h`, sub: "civil-clock shift from home base" },
            { label: "Held-out seasons", value: String(protocol.folds), sub: `${protocol.heldOutGames.toLocaleString()} held-out games` },
            { label: "Deciding term", value: data.primaryTerm, sub: `${primary.games} games in the full research sample` },
          ]}
        />
        <details className="fc-disclosure"><summary>How clock displacement was recorded</summary><Note>
          The exporter adds a signed clock-shift field. The existing zone count is absolute,
          and the jet-lag feature combines direction with an acclimation proxy, so neither
          separates the two directions cleanly. Exporting the signed field adds no scoring
          term. The operational model already uses direction internally.
        </Note></details>
      </Section>

      <Section label="THE RAW SPLIT" title="Raw clock-displacement comparisons" disclosure>
        <Prose>
          Before controlling for team strength, a visitor playing at a venue whose clock is{" "}
          {protocol.thresholdHours} hours or more <strong>behind its home base</strong> loses{" "}
          {west.homeWinPct.toFixed(2)}% of the time; one with that shift{" "}
          <strong>ahead of its home base</strong> loses {east.homeWinPct.toFixed(2)}%, a{" "}
          {rawSwingPoints(data).toFixed(1)}-point swing around a{" "}
          {protocol.baselineHomeWinPct.toFixed(2)}% baseline.
        </Prose>
        <Formula>
          {`venue shift from base       games    home win %

all games in the era       ${protocol.gamesInEra.toLocaleString().padStart(6)}       ${protocol.baselineHomeWinPct.toFixed(2)}
east ≥ ${protocol.thresholdHours}h                  ${east.games.toLocaleString().padStart(6)}       ${east.homeWinPct.toFixed(2)}
east ≥ ${protocol.thresholdHours}h, short rest      ${eastShort.games.toLocaleString().padStart(6)}       ${eastShort.homeWinPct.toFixed(2)}
west ≥ ${protocol.thresholdHours}h                  ${west.games.toLocaleString().padStart(6)}       ${west.homeWinPct.toFixed(2)}
west ≥ ${protocol.thresholdHours}h, short rest      ${westShort.games.toLocaleString().padStart(6)}       ${westShort.homeWinPct.toFixed(2)}
no long shift either way   ${neither.games.toLocaleString().padStart(6)}       ${neither.homeWinPct.toFixed(2)}`}
        </Formula>
        <Note>
          The raw comparison runs against the pre-registered expectation that eastward
          displacement would be worse: visitors playing east of home won more often than
          those playing west of home. Team composition and geography must be examined before
          attributing that difference to jet lag.
        </Note>
      </Section>

      <Section label="TEAM STRENGTH AND GEOGRAPHY" title="Differences in team strength and geography" disclosure>
        <Prose>
          The east and west groups contain different teams and venues. In ordinary mainland
          matchups, a {protocol.thresholdHours}-hour shift usually connects Eastern and Pacific
          time zones. This does not match otherwise identical journeys, and the home sides
          differ in their season-to-date records. The strength control uses each team’s prior
          wins and games, shrunk toward .500 with an eight-game prior.
        </Prose>
        <Formula>
          {`strength edge to the HOME side, by venue shift from base
(positive = the home team was the better side)

east ≥ ${protocol.thresholdHours}h        ${signedNumber(east.strengthEdgeToHome ?? 0, 4)}      home win ${east.homeWinPct.toFixed(2)}%
west ≥ ${protocol.thresholdHours}h        ${signedNumber(west.strengthEdgeToHome ?? 0, 4)}      home win ${west.homeWinPct.toFixed(2)}%
no long shift   ${signedNumber(neither.strengthEdgeToHome ?? 0, 4)}      home win ${neither.homeWinPct.toFixed(2)}%`}
        </Formula>
        <Prose>
          The strength edge <strong>flips sign between the clock-displacement groups</strong>, and the win
          rate follows it. Team strength is therefore a confound in the raw{" "}
          {rawSwingPoints(data).toFixed(1)}-point swing. The held-out test below asks whether
          direction adds predictive information after those differences are accounted for.
        </Prose>
        <Note>
          In this sample, overlap between the primary term and the model’s visiting-altitude
          term is {primary.alsoAltitudePct.toFixed(1)}%. The primary test therefore does not
          identify a joint altitude-and-long-shift effect.
        </Note>
      </Section>

      <Section label="HELD-OUT EVALUATION" title="Testing on seasons excluded from training" disclosure>
        <Prose>
          The test asks whether adding these terms improves predictions for held-out games,
          season by season, using the same walk-forward
          protocol ADR 0006 used. Its baseline fits back-to-back, visiting altitude, prior
          overtime and density together with a team-strength control. These research fits
          do not replace the operational fatigue coefficients.
        </Prose>
        <Formula>
          {`held-out log loss (lower is better)

strength only                    ${logLoss.strengthOnly.toFixed(5)}
+ the four fatigue terms         ${logLoss.baseline.toFixed(5)}     ${signedNumber(logLoss.baselineWorth, 5)}
+ east/west × short rest         ${logLoss.withCandidates.toFixed(5)}     ${signedNumber(logLoss.candidatesWorth, 5)}`}
        </Formula>
        <Prose>
          The candidate contribution (baseline loss minus augmented loss) is{" "}
          <strong>{signedNumber(logLoss.candidatesWorth, 5)}</strong>, a {logLoss.candidatesWorth < 0 ? "small deterioration" : "negligible change"}. Positive
          “worth” means lower loss; negative means worse predictions.
          The
          sign-clamped fit pinned <code>{data.primaryTerm}</code> at zero in{" "}
          <strong>
            {protocol.folds - primary.foldsNonZero} of {protocol.folds}
          </strong>{" "}
          folds. This constrained model did not retain a positive cost for the primary term.
        </Prose>
        <ValueGrid
          values={[
            { label: "Candidates worth", value: signedNumber(logLoss.candidatesWorth, 5), sub: "held-out log loss" },
            { label: "Every fatigue term", value: signedNumber(logLoss.everyFatigueFactorCombined, 5), sub: "refreshed ADR 0006 protocol" },
            { label: "Strength alone", value: signedNumber(logLoss.strengthAlone, 3), sub: `same refreshed fit, ≈ ${Math.round(strengthVsFatigueRatio(data))}× every fatigue term` },
          ]}
        />
      </Section>

      <Section label="SENSITIVITY" title="A wider reading of short rest" disclosure>
        <Prose>
          The protocol defined short rest as &ldquo;at most one day of rest&rdquo;. The test
          reads that as the visitor playing the previous night. Read as at most one day off,
          which also admits a visitor with one full calendar day off between games, the short-rest cells grow to{" "}
          {data.sensitivity.eastShortGames.toLocaleString()} eastward and{" "}
          {data.sensitivity.westShortGames.toLocaleString()} westward games.
        </Prose>
        <Prose>
          The verdict does not change, though the margin {Math.sign(data.sensitivity.candidatesWorth) === Math.sign(logLoss.candidatesWorth) ? "moves" : "changes sign"}. The four
          candidates are worth{" "}
          <strong>{signedNumber(data.sensitivity.candidatesWorth, 5)}</strong>, against{" "}
          {signedNumber(logLoss.baselineWorth, 5)} for the four fatigue terms they would join, and{" "}
          <code>{data.primaryTerm}</code> is non-zero in {data.sensitivity.primaryFoldsNonZero} of{" "}
          {protocol.folds} folds. This check is shown beside the pre-registered result, not in
          place of it: changing the definition after seeing the outcome would be choosing the
          test by its answer.
        </Prose>
      </Section>

      <Section label="OVERLAP WITH EXISTING TERMS" title="Overlap with existing schedule factors" disclosure>
        <Prose>
          The westward short-rest term, <code>{westShortTerm.term}</code>, has a mean weight of {westShortTerm.meanWeight.toFixed(4)} in{" "}
          {westShortTerm.foldsNonZero} of {protocol.folds} folds, with a coefficient of variation
          of {westShortTerm.cv?.toFixed(2)}. By the stability standard ADR 0006 set, that is a
          stable term.
        </Prose>
        <Prose>
          It is worth {signedNumber(westShortTerm.aloneVsBaseline, 5)} when added to
          the baseline on its own. It overlaps heavily with the existing back-to-back term:
        </Prose>
        <Formula>
          {`${westShortTerm.term}     ${westShortTerm.games} games
                    ${westShortTerm.visitorBackToBackPct.toFixed(1)}% visitor on a back-to-back
                    ${westShortTerm.backToBackTermPct.toFixed(1)}% already carry the back-to-back term
                    ${westShortTerm.alsoAltitudePct.toFixed(1)}% are also visiting altitude`}
        </Formula>
        <Prose>
          Every one of these visitors played the night before, and most of the games already
          carry the model&rsquo;s back-to-back term. That term compares the two teams, so it is
          zero on the nights both played the evening before. A stable coefficient
          does not establish an independent contribution. The single-term comparison measures
          what the candidate adds beyond the existing baseline, as required by ADR 0006.
        </Prose>
      </Section>

      <Section label="WHAT THIS DOES NOT SAY" title="What this means for the current model" disclosure>
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
          The model treats an eastward home-base-to-venue shift as{" "}
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

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            `Clock displacement remains tied to team geography. The strength control does not match otherwise identical trips, and displacement from home does not establish the direction of the most recent journey.`,
            `It cannot see rest and direction as anything but a schedule fact. Nothing here observes a flight, a departure time, a hotel, or a minute of anyone's sleep. "Short rest" is a gap between dates on a calendar.`,
            `It cannot rule out smaller effects. The test found no predictive improvement across ${protocol.folds} held-out seasons; that does not establish that the biological effect is zero.`,
            "It cannot speak to the playoffs. The protocol is regular-season walk-forward, and a postseason series has travel patterns and rest gaps this population does not contain.",
            `It cannot test the joint effect of altitude and these long shifts. Observed overlap between the primary term and the altitude term is ${primary.alsoAltitudePct.toFixed(1)}%.`,
            "Testing additional ideas on the same corpus increases the risk of selecting a chance result. New questions need a declared evaluation protocol.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
