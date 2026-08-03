import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import { FATIGUE_CONSTANTS as K } from "@/lib/fatigue";
import { termTdStyle, termThStyle, termThUnitStyle } from "@/lib/terminal-styles";
import { signedNumber } from "@/lib/signed-number";

export const metadata: Metadata = {
  title: "Rest Advantage — Behind the Data",
  description:
    "The fatigue score in full: its eight terms, every constant, and single-term ablations showing which of them actually carry the result.",
};

/**
 * The flagship model's reference page. Constants are read from `FATIGUE_CONSTANTS` rather
 * than retyped, so the prose cannot drift from the code. Measured figures carry the date
 * they were measured, because they need a full-table analysis that is not worth running per
 * page view.
 */
const MEASURED_ON = "2026-07-30";

/**
 * Single-term ablations, re-measured 2026-08-02 by `ml/ablate_fatigue_terms.py`.
 *
 * These replace a table measured on 2026-07-30 that asked a question the model can no
 * longer be asked. That version held the set of games fixed and reported how much
 * *accuracy* each term was worth, which only had an answer while the rule could pick
 * either side: drop a term, the pick flips home to away, accuracy moves. Since
 * 2026-08-02 a called game is always a pick of the home team, so on a fixed sample every
 * ablated model makes the identical pick and every term would score exactly zero.
 *
 * What the terms do now is *select* — they decide which games get called at all. Each row
 * neutralises one term and re-derives the call under the shipped rule.
 *
 * `found` / `foundWinPct` are the load-bearing columns, and `delta` is the trap. A term
 * that finds extra winners at a rate below the model's own 61.17% average *lowers* the
 * headline while *raising* the number of games won. Travel is exactly that: it is the
 * single largest contributor of correct calls (+404 above a coin flip, more than any other
 * term) and it still moves the headline +0.32pp when removed, because its 5,994 games win
 * at 59.14% rather than 61.17%. Reading `delta` alone says delete it. Deleting it would
 * give up more winning predictions than any other change available.
 *
 * Ordered by wins-above-a-coin-flip surrendered, not by delta.
 */
const ABLATIONS_MEASURED_ON = "2026-08-02";
const ABLATION_BASELINE = { winPct: 61.17, called: 27400, edge: 3061 };
const ABLATIONS = [
  { term: "Travel", delta: 0.32, found: 5994, foundWinPct: 59.14, edgeLost: 404 },
  { term: "Recent workload (decay)", delta: -0.68, found: 3437, foundWinPct: 63.37, edgeLost: 336 },
  { term: "Back-to-back", delta: -0.31, found: 1743, foundWinPct: 63.57, edgeLost: 210 },
  { term: "Road segment", delta: 0.24, found: 2784, foundWinPct: 58.94, edgeLost: 209 },
  { term: "Altitude", delta: -0.03, found: 616, foundWinPct: 62.34, edgeLost: 71 },
  { term: "Schedule density", delta: -0.08, found: 707, foundWinPct: 60.54, edgeLost: 41 },
  { term: "Overtime", delta: -0.07, found: 148, foundWinPct: 64.86, edgeLost: 20 },
  { term: "Freshness", delta: 0.02, found: 148, foundWinPct: 60.14, edgeLost: -10 },
] as const;


export default function RestAdvantageMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · REST ADVANTAGE"
      title="Rest advantage"
      description="Every number on the Games and Model Results pages comes out of one function. This states what it does, what each piece of it is worth, and what it cannot see."
    >
      <Section label="THE SCORE" descriptor="ONE FUNCTION, EIGHT TERMS">
        <Prose>
          Each team carries a fatigue score for each game. It is not a rating of the team — it
          is a reading of what the schedule did to them before tip-off. Higher is more tired.
          The difference between the two teams&rsquo; scores is the <strong>rest advantage</strong>,
          and that single number drives every claim on the site.
        </Prose>
        <Formula>
          {`baseLoad   = recentWorkload + travel + roadSegment
score      = max(0, baseLoad × backToBack × altitude × density + freshness + overtime)
restEdge   = awayScore − homeScore     (positive ⇒ the home side is fresher)`}
        </Formula>
        <Note>
          A difference under 0.5 is treated as no call. That threshold is why the model declines
          a fifth of all games rather than predicting every one of them.
        </Note>
        <Prose>
          There is a <strong>second</strong> reason to decline, added on 2026-08-02: the model
          only makes a call when the fresher team is also the home team. Backing a rested
          visitor was measured at 44.4% across 7,224 games, and no threshold rescues it — the
          rate is still under a coin flip at a rest edge of 3, and only reaches even at an edge
          of 5, which the schedule produces a few dozen times a decade.
        </Prose>
        <Note>
          Rest alone never outweighs home court at any magnitude the NBA schedule generates.
          That is a finding rather than a defect, and the honest response is to decline the call
          instead of publishing one already measured as a loser. Adding home court to the rule
          and letting it decide was tested too: it covers 96.5% of games at 58.4% and still makes
          776 losing road calls, which is a worse answer wearing better clothes.
        </Note>
      </Section>

      <Section label="THE TERMS" descriptor="WITH THE CONSTANTS THE CODE USES">
        <div className="flex flex-col gap-5">
          <div>
            <Prose>
              {/* Hyphenated so no space is needed after the expression: a JSX text node
                  that wraps to the next line loses its leading space, which rendered
                  "30days" here. */}
              <strong>Recent workload.</strong> Every game in the last{" "}
              {K.decayLookbackDays}-day window adds load that decays exponentially, so last
              night matters far more than last week. Each game&rsquo;s cost is scaled down when it was
              a blowout — a 30-point rout rests the starters, and overtime used to be the only
              way the model knew a game was hard.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`cost      = ${K.gameBaseCost} × e^(−${K.decayRate} × daysAgo) × blowoutFactor
blowout   = 1 − ${K.blowoutMaxDiscount} × clamp((|margin| − ${K.blowoutFloor}) / ${K.blowoutRange}, 0, 1)`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Travel.</strong> Great-circle miles between consecutive venues over a{" "}
              {K.travelLookbackDays}-day window, log-scaled so the tenth thousand miles hurts
              less than the first. A team only flies home when its <em>next</em> game is at home —
              no phantom round trips between two road games.
            </Prose>
            <div className="mt-2">
              <Formula>{`travel = ${K.travelScale} × ln(1 + miles / ${K.travelReferenceMiles})`}</Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Body clock.</strong> A charge for playing at least a{" "}
              {K.displacementMinHours}-hour clock shift from home, resolved from each
              venue&rsquo;s real UTC offset rather than from raw longitude. Travelling east
              advances the body clock, which is harder than delaying it, so east and west are
              not charged equally. The charge then decays as the team re-entrains, at roughly a
              day per zone crossed — night six of an east-coast trip is not night one.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`displacement = ${K.displacementBonus} × direction × max(0, 1 − nightsInZone / zonesCrossed)
direction    = ${K.eastwardMultiplier} eastward, ${K.westwardMultiplier} westward`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>Back-to-back.</strong> Playing last night multiplies the load. The size of
              that multiplier depends on the real gap between tip-offs, because a 10:30pm game
              into a 7pm game is roughly 21 hours of recovery and the reverse ordering is 27.
            </Prose>
            <div className="mt-2">
              <Formula>
                {`b2b = clamp(${K.b2bMultiplier} + ${K.b2bPerHour} × (${K.b2bNominalHours} − turnaroundHours), ${K.b2bMin}, ${K.b2bMax})`}
              </Formula>
            </div>
          </div>

          <div>
            <Prose>
              <strong>The rest.</strong> Consecutive road games add{" "}
              {K.roadStreakPerGame} each after the first {K.roadStreakFree} are free. Visiting
              altitude (Denver, Utah, and Mexico City at 7,350 ft) multiplies by{" "}
              {K.altitudeMultiplier}, and the following night at normal elevation by{" "}
              {K.altitudeCarryover}. Schedule density compares games played across five windows
              {/* No cap is quoted here on purpose. SCHEDULE_STRESS_MAX_MULT is 1.42, but each
                  of the five windows is clamped before the curve is applied, so the multiplier
                  cannot structurally exceed ~1.33 and tops out at 1.307 on real schedules.
                  Printing 1.42 told readers density could multiply fatigue by half again as
                  much as it can. Verified 2026-08-03. */}{" "}
              against a normal pace. Extended rest earns a discount that begins at{" "}
              {K.freshnessPlateauDays} days and approaches{" "}
              {/* A true minus sign, and one decimal, so these read as the quantities the
                  model uses rather than as bare integers. */}
              {signedNumber(K.freshnessMaxBonus, 1)}. A prior game that went to
              overtime adds {K.overtimeSingle.toFixed(1)}, or {K.overtimeMulti.toFixed(1)} for
              double overtime or more.
            </Prose>
          </div>
        </div>
      </Section>

      <Section
        label="WHAT EACH TERM IS WORTH"
        descriptor={`MEASURED ${ABLATIONS_MEASURED_ON}`}
      >
        <Prose>
          Removing a term no longer changes <em>which</em> team gets picked — a called game is
          always a pick of the home side. What it changes is which games get called at all. So
          each term was neutralised in turn, the call re-derived, and the published win rate
          re-measured against a baseline of{" "}
          <strong>
            {ABLATION_BASELINE.winPct}% across {ABLATION_BASELINE.called.toLocaleString()} games
          </strong>
          .
        </Prose>
        <Prose>
          <strong>Every term finds winners.</strong> They differ in how they do it. Back-to-backs
          and recent workload are the <em>sharpest</em> — the games only they flag win at over
          63%. Travel is the <em>widest</em>: it alone accounts for{" "}
          {ABLATIONS[0].found.toLocaleString()}{" "}
          of the model&rsquo;s calls, more than twice any other term, at{" "}
          {ABLATIONS[0].foundWinPct}%.
        </Prose>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>TERM</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>
                  GAMES ONLY IT FINDS
                  <span style={termThUnitStyle}>COUNT</span>
                </th>
                <th style={{ ...termThStyle, textAlign: "right" }}>
                  THOSE GAMES
                  <span style={termThUnitStyle}>WIN RATE</span>
                </th>
                <th style={{ ...termThStyle, textAlign: "right" }}>
                  HEADLINE IF REMOVED
                  <span style={termThUnitStyle}>PCT POINTS</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ABLATIONS.map((a) => (
                <tr key={a.term}>
                  <td style={termTdStyle}>{a.term}</td>
                  <td
                    style={{
                      ...termTdStyle,
                      textAlign: "right",
                      fontWeight: 700,
                      // Weight by what the term contributes, which is the column that
                      // decides whether it earns its place.
                      color:
                        a.edgeLost >= 200 ? "var(--term-text)" : "var(--term-text-muted)",
                    }}
                  >
                    {a.found.toLocaleString()}
                  </td>
                  <td style={{ ...termTdStyle, textAlign: "right" }}>{a.foundWinPct}%</td>
                  <td
                    style={{
                      ...termTdStyle,
                      textAlign: "right",
                      color: "var(--term-text-muted)",
                    }}
                  >
                    {signedNumber(a.delta)}pp
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          The last column is a trap, and it is shown because hiding it would be worse. Travel
          and road segment are the two terms whose removal <em>raises</em>{" "}
          the published rate, which reads like an argument for deleting them. It is not. Both find winners at a rate
          below the model&rsquo;s own {ABLATION_BASELINE.winPct}% average, so including them
          pulls the average down while pushing the number of games won up. Travel gives the
          model {ABLATIONS[0].edgeLost} more correct calls than a coin flip — the largest
          contribution of any single term — and deleting it would buy a prettier headline by
          giving up {ABLATIONS[0].found.toLocaleString()} winning predictions. A batting average
          rises when you stop taking the harder at-bats.
        </Note>
        <Note>
          The whole model sits at {ABLATION_BASELINE.edge.toLocaleString()} correct calls above a
          coin flip across {ABLATION_BASELINE.called.toLocaleString()} games. Freshness is the
          only term that gives back more than it brings, and it does so by ten calls. The others
          are kept because they are physically real, correctly computed <em>and</em> additive.
          Terms interact multiplicatively, so these figures do not sum to the total.
        </Note>
        <Note>
          A separate out-of-sample fit found travel adds little <em>independent</em> information
          once the other schedule terms are known, which is unsurprising — a team deep in a road
          trip already scores high on workload and road segment, so the terms partly restate one
          another. That is a narrower claim than it sounds, and it is not in tension with the
          table above: travel is the tie-breaker that pushes those genuinely worn-down teams over
          the line, and the games it pushes over do win.
        </Note>
      </Section>

      <Section label="WHERE THE DATA COMES FROM" descriptor="1985-86 TO PRESENT">
        <Prose>
          Schedules, scores and results come from the NBA&rsquo;s own feeds. Overtime periods,
          tip-off times and neutral-site venues come from ESPN, because the NBA endpoint that
          serves them is not reachable from outside the United States — a failure that went
          unnoticed long enough that the overtime term sat dormant across every game in the
          dataset before it was found and fixed on {MEASURED_ON}.
        </Prose>
        <Prose>
          Arena coordinates are era-correct: Sonics games resolve to Seattle, not Oklahoma City,
          and the 2005-06 Hornets to their Katrina-season home. Distances are great-circle, not
          routed.
        </Prose>
        <Note>
          ESPN coverage begins around 2002, and its neutral-site flag only from 2013. Earlier
          seasons are scored by the same formula with those three inputs absent, which means a
          pre-2002 overtime count of zero denotes <em>unknown</em>, not &ldquo;no overtime&rdquo;.
          The trade was taken deliberately rather than restricting the model to a shorter span,
          and the cost is that a 1994 score and a 2024 score are not built from quite the same
          information.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <Prose>
          The model reads schedules. It knows nothing about the teams playing.
        </Prose>
        <LimitList
          items={[
            "No injuries, rotations or minutes played. A rested team missing two starters scores the same as a healthy one.",
            "No team quality. Rest advantage is not a prediction of who is better, and a rested visitor is often a good team midway through a road trip — which is why these win rates are associational, not causal.",
            "No actual itineraries. Teams are assumed to fly venue to venue and only home when the next game is home. No public source records what they really did.",
            "No load management. A star sitting a back-to-back is exactly the effect this model would want to capture, and it is invisible here.",
            "Playoffs are excluded entirely. A fixed two-team series breaks the travel assumptions.",
            "The 2019-20 Orlando bubble is excluded — one site, no travel, no crowd. The roughly 970 games that season played before the March 2020 suspension are ordinary and are included. 2020-21 is included too, but it is a condensed 72-game season, so its schedule density runs hotter than the anchors were set against.",
          ]}
        />
      </Section>

      <Section label="HOW THE MODEL IS SCORED" descriptor="NO TUNING AGAINST THE BACKTEST">
        <Prose>
          Every constant above was set by reasoning about the physical effect and reviewed
          before the backtest was run — none was fitted to maximise a win rate. That is the
          only reason the historical numbers mean anything: a model tuned against its own test
          set would report whatever accuracy it was asked for.
        </Prose>
        <Note>
          The most recent overhaul is a fair illustration of why that discipline matters. Nine
          fixes landed together and the published hit rates rose about a point — but on games
          both the old and new model called, accuracy moved 0.15pp and the two picked the same
          team 98.8% of the time. The gain was almost entirely the new model declining 2,661
          games the old one had called at below a coin flip. Better selectivity, not better
          prediction. The distinction is easy to lose and worth keeping.
        </Note>
      </Section>
    </BehindTheDataShell>
  );
}
