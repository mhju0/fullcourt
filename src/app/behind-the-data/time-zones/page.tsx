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
  title: "Time Zones — Behind the Data",
  description:
    "A pre-registered test of whether a long eastward flight on short rest costs anything. It does not. The large east/west split in the raw data is team strength, not jet lag — and this page shows the arithmetic that separates them.",
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
      description="Whether a long eastward flight on short rest costs anything. Pre-registered, measured once, answered no — while the raw numbers say otherwise, loudly."
    >
      <Section label="WHAT WAS ASKED" descriptor="A NARROWER QUESTION THAN THE MODEL HAD TESTED">
        <Prose>
          The fatigue model already carries time-zone travel, and the weight-fitting work
          recorded in <strong>ADR 0006</strong> measured it as a{" "}
          <em>main effect across every game</em> and found it carried nothing.
          That is not the claim sleep research actually makes. The claim is narrower: a long{" "}
          <strong>eastward</strong> shift arriving on <strong>short rest</strong>, where the body
          clock has had no chance to re-entrain before tip-off.
        </Prose>
        <Prose>
          So it was asked again, properly scoped, and written down before anything was run.
          Four candidate terms, one of them named in advance as the term that would decide it.
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
          a signed field first. It is <strong>reported and never scored</strong> — no term reads
          it, and no fatigue score anywhere on this site changed because it exists.
        </Note>
      </Section>

      <Section label="THE RAW SPLIT" descriptor="READ IT FOR THE DENOMINATORS, NOT THE EFFECT">
        <Prose>
          With no controls at all, the split looks enormous. A visitor who flew{" "}
          {protocol.thresholdHours} hours or more <strong>west</strong> loses{" "}
          {west.homeWinPct.toFixed(2)}% of the time; one who flew the same distance{" "}
          <strong>east</strong> loses only {east.homeWinPct.toFixed(2)}% — a{" "}
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
          A finding that contradicts its own mechanism is a warning, not a discovery.
        </Note>
      </Section>

      <Section label="WHY THE SPLIT IS NOT JET LAG" descriptor="GEOGRAPHY DECIDES WHO FLIES WHICH WAY">
        <Prose>
          A {protocol.thresholdHours}-hour <strong>westward</strong> trip is, almost by definition,
          an Eastern-conference team visiting the Pacific coast. A {protocol.thresholdHours}-hour{" "}
          <strong>eastward</strong> trip is the reverse. The two cells are not two treatments of a
          comparable population — they are two different sets of teams, and the home sides differ
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
          rate follows it. That is the entire {rawSwingPoints(data).toFixed(1)}-point swing. Nothing
          is left over for the body clock to explain.
        </Prose>
        <Note>
          Altitude was the confound to suspect, and it is not this one. Denver and Utah are
          Mountain time — about two hours from Eastern — so a {protocol.thresholdHours}-hour
          threshold excludes them by construction. Overlap between these terms and the model&rsquo;s
          visiting-altitude term is {primary.alsoAltitudePct.toFixed(1)}%.
        </Note>
      </Section>

      <Section label="THE TEST THAT CARRIES THE VERDICT" descriptor="SIXTEEN SEASONS IT HAD NOT SEEN">
        <Prose>
          The verdict is not the raw split with a control bolted on. It is whether adding these
          terms helps predict games the fit never saw, season by season, on the same walk-forward
          protocol ADR 0006 used.
        </Prose>
        <Formula>
          {`held-out log loss (lower is better)

strength only                    ${logLoss.strengthOnly.toFixed(5)}
+ the four fatigue terms         ${logLoss.baseline.toFixed(5)}     ${signedNumber(logLoss.baselineWorth, 5)}
+ east/west × short rest         ${logLoss.withCandidates.toFixed(5)}     ${signedNumber(logLoss.candidatesWorth, 5)}`}
        </Formula>
        <Prose>
          All four candidates together are worth{" "}
          <strong>{signedNumber(logLoss.candidatesWorth, 5)}</strong> — not a small
          gain, a small <em>loss</em>. And the deciding term did not merely fail to help: the
          sign-clamped fit pinned <code>{data.primaryTerm}</code> at zero in{" "}
          <strong>
            {protocol.folds - primary.foldsNonZero} of {protocol.folds}
          </strong>{" "}
          folds, because the unconstrained fit wanted to push it the other way — toward an
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

      <Section label="THE TRAP INSIDE THE RESULT" descriptor="A STABLE WEIGHT IS NOT A CONTRIBUTION">
        <Prose>
          One candidate does look alive. <code>{westShortTerm.term}</code> — a long westward flight
          on short rest — holds a weight of {westShortTerm.meanWeight.toFixed(4)} in{" "}
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
          The term is mostly a second name for the back-to-back the model already carries. It
          holds a steady weight because it is describing something real — just not something new.
          This is the identical misreading ADR 0006 had to correct itself for, which is why the
          test here is always &ldquo;what does it add when added alone?&rdquo; and never &ldquo;is
          its weight stable?&rdquo;
        </Prose>
      </Section>

      <Section label="WHAT THIS DOES NOT SAY" descriptor="INCLUDING ABOUT THE MODEL THAT SHIPPED">
        <Prose>
          No constant in <code>fatigue.ts</code> moved because of this. That is worth stating
          precisely, because it would be easy to read a null as a confirmation.
        </Prose>
        <Formula>
          {`shipped today:   eastward multiplier   ${FATIGUE_CONSTANTS.eastwardMultiplier}
                 westward multiplier   ${FATIGUE_CONSTANTS.westwardMultiplier}

this test found: no directional effect at all`}
        </Formula>
        <Prose>
          The model treats an eastward shift as{" "}
          {(
            FATIGUE_CONSTANTS.eastwardMultiplier / FATIGUE_CONSTANTS.westwardMultiplier
          ).toFixed(2)}
          × as costly as a westward one. This measurement is <strong>not evidence that asymmetry
          is right.</strong> It found no directional effect for an asymmetry to be about. The
          constants are ratified and stay as they are; what changed is that the site now says
          plainly that they are unverified rather than measured.
        </Prose>
        <Note>
          A null is published here for the same reason every other null on this site is: the
          question was asked in writing before the answer was known, and the answer ships either
          way. A site that only published the questions that worked would not be reporting a
          model — it would be reporting a search.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            `It cannot separate direction from geography beyond what strength controls. The control here is a team-strength term, not a matched design — a ${protocol.thresholdHours}-hour eastward trip will always mostly be a Western team, and no amount of held-out testing changes who plays whom.`,
            `It cannot see rest and direction as anything but a schedule fact. Nothing here observes a flight, a departure time, a hotel, or a minute of anyone's sleep. "Short rest" is a gap between dates on a calendar.`,
            "It cannot rule out an effect smaller than the model can measure. A null on 16 held-out seasons means the effect is not large enough to help predict a game — not that it is biologically zero.",
            "It cannot speak to the playoffs. The protocol is regular-season walk-forward, and a postseason series has travel patterns and rest gaps this population does not contain.",
            `It cannot test altitude and time zones together, which is the combination anyone would most want. The ${protocol.thresholdHours}-hour threshold excludes Denver and Utah by construction, so the overlap is ${primary.alsoAltitudePct.toFixed(1)}% and there is no sample to ask the joint question from.`,
            "It cannot be re-run cheaply against a new idea without becoming a search. The corpus makes one more question nearly free, which is exactly why the next one has to be written down before it is asked.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
