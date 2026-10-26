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
import { DataTable } from "@/components/ui/data-table";
import timeZoneData from "@/data/timezone-null.json";
import { FATIGUE_CONSTANTS } from "@/lib/fatigue";
import { TYPE } from "@/lib/terminal-styles";
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

const H = protocol.thresholdHours;

/** A row label with its game count beneath it, so a phone keeps the rate columns on screen. */
function LabelWithGames({ label, games }: { label: string; games: number }) {
  return (
    <>
      {label}
      <br />
      <span className="mono" style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {games.toLocaleString()} games
      </span>
    </>
  );
}

export default function TimeZonesMethodPage() {
  return (
    <BehindTheDataShell
      topic="time-zones"
      eyebrow="BEHIND THE DATA · TIME ZONES"
      title="Time zones"
      description="Does playing far east of home on short rest help explain results? A pre-registered test found it did not improve held-out predictions."
    >
      <Section label="WHAT WAS ASKED" title="The question tested">
        <Prose>
          The fatigue model already includes time-zone shifts. The weight-fitting work in{" "}
          <strong>ADR 0006</strong> tested them as a general effect and found they added no
          predictive value. This test asks something narrower.
        </Prose>
        <Prose>
          <strong>The question:</strong> does a visitor do worse at a venue at least {H} clock
          hours <strong>east of its home base</strong>, on <strong>short rest</strong> (it
          played the night before)? The shift compares home base with tonight&rsquo;s arena,
          not with the last game&rsquo;s, so it says nothing about the actual flight.
        </Prose>
        <ValueGrid
          values={[
            { label: "Threshold", value: `≥ ${H}h`, sub: "clock shift from home base" },
            { label: "Held-out seasons", value: String(protocol.folds), sub: `${protocol.heldOutGames.toLocaleString()} held-out games` },
            { label: "Deciding term", value: data.primaryTerm, sub: `${primary.games} games in the full sample` },
          ]}
        />
        <Note>
          Four candidate terms were fixed before the analysis, one of them the deciding term.
          The protocol was declared on August 18, 2026; the figures were rebuilt on{" "}
          {data.measuredOn} from corrected inputs. The sample is every completed
          regular-season game from 2002-03 on, including neutral-site and bubble games, so it
          differs from the headline win-rate sample.
        </Note>
        <details className="fc-disclosure"><summary>How clock displacement was recorded</summary><Note>
          The export adds a signed clock-shift field. The existing zone count has no sign, and
          the jet-lag feature mixes direction with time to adjust, so neither separates east
          from west cleanly. The new field adds no scoring term. The live model already uses
          direction internally.
        </Note></details>
      </Section>

      <Section label="THE RAW SPLIT" title="Raw clock-displacement comparisons" disclosure>
        <Prose>
          Before accounting for team strength, visitors playing far <strong>west</strong> of
          home lost {west.homeWinPct.toFixed(2)}% of the time, and those playing far{" "}
          <strong>east</strong> lost {east.homeWinPct.toFixed(2)}%. That is a{" "}
          {rawSwingPoints(data).toFixed(1)}-point swing around a{" "}
          {protocol.baselineHomeWinPct.toFixed(2)}% baseline.
        </Prose>
        <DataTable
          rows={[
            { label: "All games in the era", games: protocol.gamesInEra, pct: protocol.baselineHomeWinPct },
            { label: `East ${H}h+`, games: east.games, pct: east.homeWinPct },
            { label: `East ${H}h+, short rest`, games: eastShort.games, pct: eastShort.homeWinPct },
            { label: `West ${H}h+`, games: west.games, pct: west.homeWinPct },
            { label: `West ${H}h+, short rest`, games: westShort.games, pct: westShort.homeWinPct },
            { label: "No long shift", games: neither.games, pct: neither.homeWinPct },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { label: "VISITOR'S SHIFT", unit: "FROM HOME BASE", cell: (r) => <LabelWithGames label={r.label} games={r.games} /> },
            { label: "HOME WON", unit: "%", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.pct.toFixed(2) },
          ]}
        />
        <Note>
          This runs against the pre-registered expectation that east would be worse: visitors
          playing east of home won more often than those playing west. Before blaming or
          crediting jet lag, the teams and places involved need a look.
        </Note>
      </Section>

      <Section label="TEAM STRENGTH AND GEOGRAPHY" title="Differences in team strength and geography" disclosure>
        <Prose>
          The east and west groups are different teams in different places. On the mainland, a{" "}
          {H}-hour shift usually means Eastern to Pacific time or back, and the home
          teams in each group had different records. Strength here is each team&rsquo;s record
          in earlier games, pulled toward .500 with an eight-game prior. A
          positive home edge means the home team was the stronger side.
        </Prose>
        <DataTable
          rows={[
            { label: `East ${H}h+`, edge: east.strengthEdgeToHome, pct: east.homeWinPct },
            { label: `West ${H}h+`, edge: west.strengthEdgeToHome, pct: west.homeWinPct },
            { label: "No long shift", edge: neither.strengthEdgeToHome, pct: neither.homeWinPct },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { label: "VISITOR'S SHIFT", cell: (r) => r.label },
            { label: "HOME EDGE", unit: "STRENGTH", numeric: true, cell: (r) => (r.edge === null ? "—" : signedNumber(r.edge, 4)) },
            { label: "HOME WON", unit: "%", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.pct.toFixed(2) },
          ]}
        />
        {[east, west, neither].some((g) => g.strengthEdgeToHome === null) && (
          <Note>— strength not broken out for that group.</Note>
        )}
        <Prose>
          The strength edge <strong>flips sign between the groups</strong>, and the win rate
          follows it. So team strength explains the raw {rawSwingPoints(data).toFixed(1)}-point
          swing at least in part. The held-out test below asks whether direction adds anything
          once strength is accounted for.
        </Prose>
        <Note>
          {primary.alsoAltitudePct.toFixed(1)}% of the deciding term&rsquo;s games are also
          altitude games, so this test cannot measure a combined altitude-and-shift effect.
        </Note>
      </Section>

      <Section label="HELD-OUT EVALUATION" title="Testing on seasons excluded from training" disclosure>
        <Prose>
          Each season is predicted by a model trained only on earlier seasons, the same
          walk-forward method as ADR 0006. The baseline has team strength plus four fatigue
          terms: back-to-back, visiting altitude, prior overtime and density. These research
          fits do not replace the live model&rsquo;s constants.
        </Prose>
        <DataTable
          rows={[
            { label: "Strength only", loss: logLoss.strengthOnly, worth: null },
            { label: "+ four fatigue terms", loss: logLoss.baseline, worth: logLoss.baselineWorth },
            { label: "+ east/west × short rest", loss: logLoss.withCandidates, worth: logLoss.candidatesWorth },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { label: "MODEL", cell: (r) => r.label },
            { label: "LOG LOSS", numeric: true, cell: (r) => r.loss.toFixed(5) },
            { label: "WORTH", numeric: true, style: { fontWeight: 700 }, cell: (r) => (r.worth === null ? "—" : signedNumber(r.worth, 5)) },
          ]}
        />
        <Prose>
          Lower log loss is better. Worth is the drop in log loss from adding a row&rsquo;s
          terms, so a positive worth helps.
          The time-zone terms are worth{" "}
          <strong>{signedNumber(logLoss.candidatesWorth, 5)}</strong>, a{" "}
          {logLoss.candidatesWorth < 0 ? "small step backward" : "negligible change"}. The fit,
          which could only give the deciding term a cost, set <code>{data.primaryTerm}</code>{" "}
          to zero in{" "}
          <strong>
            {protocol.folds - primary.foldsNonZero} of {protocol.folds}
          </strong>{" "}
          seasons.
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
          read that as playing the night before. Read more widely, to also include one full day
          off, the short-rest groups grow to {data.sensitivity.eastShortGames.toLocaleString()}{" "}
          eastward and {data.sensitivity.westShortGames.toLocaleString()} westward games.
        </Prose>
        <Prose>
          The verdict holds, though the margin{" "}
          {Math.sign(data.sensitivity.candidatesWorth) === Math.sign(logLoss.candidatesWorth) ? "moves" : "changes sign"}.
          The four candidates are worth{" "}
          <strong>{signedNumber(data.sensitivity.candidatesWorth, 5)}</strong>, against{" "}
          {signedNumber(logLoss.baselineWorth, 5)} for the four fatigue terms, and{" "}
          <code>{data.primaryTerm}</code> is non-zero in {data.sensitivity.primaryFoldsNonZero} of{" "}
          {protocol.folds} seasons.
        </Prose>
        <Note>
          This check sits beside the pre-registered result, not in place of it. Changing the
          definition after seeing the answer would be picking the test by its answer.
        </Note>
      </Section>

      <Section label="OVERLAP WITH EXISTING TERMS" title="Overlap with existing schedule factors" disclosure>
        <Prose>
          The westward short-rest term, <code>{westShortTerm.term}</code>, has a mean weight of{" "}
          {westShortTerm.meanWeight.toFixed(4)}, non-zero in {westShortTerm.foldsNonZero} of{" "}
          {protocol.folds} seasons, with a coefficient of variation of{" "}
          {westShortTerm.cv?.toFixed(2)}. By ADR 0006&rsquo;s standard, that is stable. Added to
          the baseline alone, it is worth {signedNumber(westShortTerm.aloneVsBaseline, 5)}.
        </Prose>
        <Prose>
          But it mostly repeats the back-to-back term. Of its {westShortTerm.games} games:
        </Prose>
        <DataTable
          rows={[
            { label: "Visitor on a back-to-back", pct: westShortTerm.visitorBackToBackPct },
            { label: "Already carry the back-to-back term", pct: westShortTerm.backToBackTermPct },
            { label: "Also visiting altitude", pct: westShortTerm.alsoAltitudePct },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { label: "OVERLAP", cell: (r) => r.label },
            { label: "SHARE", unit: "%", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.pct.toFixed(1) },
          ]}
        />
        <Prose>
          Every one of these visitors played the night before. The back-to-back term compares
          the two teams, so it is zero when both played the night before. That is why not
          all of these games carry it. A stable weight does not mean an independent effect. Under ADR
          0006, what counts is what a term adds beyond the baseline.
        </Prose>
      </Section>

      <Section label="WHAT THIS DOES NOT SAY" title="What this means for the current model" disclosure>
        <Prose>
          This test changed no constant in <code>fatigue.ts</code>. It also did not confirm the
          direction multipliers already there:
        </Prose>
        <Formula>
          {`eastward multiplier  ${FATIGUE_CONSTANTS.eastwardMultiplier}
westward multiplier  ${FATIGUE_CONSTANTS.westwardMultiplier}`}
        </Formula>
        <Prose>
          The model treats an eastward shift as{" "}
          {(
            FATIGUE_CONSTANTS.eastwardMultiplier / FATIGUE_CONSTANTS.westwardMultiplier
          ).toFixed(2)}
          × as costly as a westward one. This test is <strong>not evidence that the asymmetry
          is right.</strong> It found no added predictive value from direction. The ratified
          constants stay in the model, unverified by this analysis.
        </Prose>
        <Note>
          The question and the evaluation rule were written down before the analysis ran. The
          result is published even though the terms did not help.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Clock shift stays tied to geography. The strength control does not match otherwise identical trips, and a shift from home base says nothing about the most recent trip.",
            `Rest and direction are calendar facts here. Nothing observes a flight, a departure time, a hotel or anyone's sleep. "Short rest" is a gap between dates.`,
            `It cannot rule out a smaller effect. No predictive gain across ${protocol.folds} held-out seasons does not mean the biological effect is zero.`,
            "It says nothing about the playoffs. The test is regular-season only, and playoff series have travel and rest patterns this sample does not contain.",
            `It cannot test altitude and long shifts together. ${primary.alsoAltitudePct.toFixed(1)}% of the deciding term's games are altitude games.`,
            "Each new idea tested on the same games raises the chance of a fluke. New questions need their own declared protocol.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
