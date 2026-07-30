import { PageHeader } from "@/components/page-header";
import { FATIGUE_CONSTANTS as K } from "@/lib/fatigue";
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles";

/**
 * Methodology page. Every constant is read from `FATIGUE_CONSTANTS` rather than retyped,
 * so the page cannot drift from the model it describes.
 *
 * The ablation deltas are from the 2026-07-30 recompute and are stated as of that date,
 * because they need a full-table analysis that is not worth running per page view. Anything
 * that could go stale is dated.
 */

const MEASURED_ON = "2026-07-30";

function Section({
  label,
  descriptor,
  children,
}: {
  label: string;
  descriptor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={termCardStyle}>
      <div
        className="mono flex items-center gap-3 py-2"
        style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
      >
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
        {descriptor && <span style={{ fontWeight: 600 }}>{descriptor}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ maxWidth: "46rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ maxWidth: "46rem", fontSize: 14, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

/** Monospace formula block — the actual arithmetic, not a paraphrase of it. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="mono overflow-x-auto"
      style={{
        background: "var(--term-surface-2)",
        border: "1px solid var(--term-border)",
        borderRadius: "var(--term-radius)",
        padding: "12px 14px",
        fontSize: 12,
        lineHeight: 1.7,
        color: "var(--term-text)",
      }}
    >
      {children}
    </pre>
  );
}

/** Single-term ablations from the 2026-07-30 recompute: swing lost when the term is removed. */
const ABLATIONS = [
  { term: "Recent workload (decay)", delta: -1.59, verdict: "The engine" },
  { term: "Back-to-back", delta: -0.9, verdict: "Second" },
  { term: "Travel", delta: -0.35, verdict: "Real but modest" },
  { term: "Road segment", delta: -0.15, verdict: "Marginal" },
  { term: "Altitude", delta: -0.04, verdict: "Near zero" },
  { term: "Overtime", delta: -0.02, verdict: "Near zero" },
  { term: "Freshness", delta: -0.01, verdict: "Near zero" },
  { term: "Schedule density", delta: 0.04, verdict: "Slightly harmful" },
] as const;

export function BehindTheDataContent() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="BEHIND THE DATA"
        title="How this is calculated"
        description="Every number on this site comes out of one function. This page states what that function does, what each piece of it is actually worth, and what it cannot see. Where a measurement flatters the model, it is labelled."
        descriptionMaxWidth="46rem"
      />

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
              against a normal pace, capped at {K.densityMaxMultiplier}. Extended rest earns a
              discount that begins at {K.freshnessPlateauDays} days and approaches{" "}
              {/* A true minus sign, and one decimal, so these read as the quantities the
                  model uses rather than as bare integers. */}
              {K.freshnessMaxBonus.toFixed(1).replace("-", "−")}. A prior game that went to
              overtime adds {K.overtimeSingle.toFixed(1)}, or {K.overtimeMulti.toFixed(1)} for
              double overtime or more.
            </Prose>
          </div>
        </div>
      </Section>

      <Section label="WHAT EACH TERM IS WORTH" descriptor={`MEASURED ${MEASURED_ON}`}>
        <Prose>
          Terms were removed one at a time and the model re-scored, holding the set of games
          fixed. The column shows how much of the rest effect disappears without that term.
          The result is lopsided: the model is essentially <strong>recent workload plus
          back-to-backs</strong>, with travel a distant third.
        </Prose>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>TERM REMOVED</th>
                <th style={{ ...termThStyle, textAlign: "right" }}>EFFECT LOST</th>
                <th style={termThStyle}></th>
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
                      color:
                        Math.abs(a.delta) >= 0.3 ? "var(--term-text)" : "var(--term-text-muted)",
                    }}
                  >
                    {a.delta > 0 ? `+${a.delta}` : `−${Math.abs(a.delta)}`}pp
                  </td>
                  <td style={{ ...termTdStyle, color: "var(--term-text-muted)" }}>{a.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          Four terms — altitude, overtime, freshness and density — contribute essentially
          nothing to predictive ranking, and density is very slightly harmful. They are kept
          because they are physically real and correctly computed, not because they earn their
          place in the backtest. Being correct and being useful are different claims, and this
          table is the one that separates them. Terms interact multiplicatively, so these
          figures do not sum to the total.
        </Note>
      </Section>

      <Section label="WHERE THE DATA COMES FROM" descriptor="1985-86 TO PRESENT">
        <Prose>
          Schedules, scores and results come from the NBA&rsquo;s own feeds. Overtime periods,
          tip-off times and neutral-site venues come from ESPN, because the NBA endpoint that
          serves them is not reachable from outside the United States — a failure that went
          unnoticed long enough that the overtime term sat dormant across all 49,353 games
          before it was found and fixed on {MEASURED_ON}.
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
        <ul
          className="flex flex-col gap-2"
          style={{ maxWidth: "46rem", fontSize: 15, color: "var(--term-text)", lineHeight: 1.55 }}
        >
          {[
            "No injuries, rotations or minutes played. A rested team missing two starters scores the same as a healthy one.",
            "No team quality. Rest advantage is not a prediction of who is better, and a rested visitor is often a good team midway through a road trip — which is why the win rates here are associational, not causal.",
            "No actual itineraries. Teams are assumed to fly venue to venue and only home when the next game is home. No public source records what they really did.",
            "No load management. A star sitting a back-to-back is exactly the effect this model would want to capture, and it is invisible here.",
            "Playoffs are excluded entirely. A fixed two-team series breaks the travel assumptions.",
            "The 2019-20 bubble is excluded. No travel happened.",
          ].map((limit) => (
            <li key={limit} className="flex gap-2.5">
              <span className="mono" style={{ color: "var(--term-red)", flexShrink: 0 }}>
                —
              </span>
              <span>{limit}</span>
            </li>
          ))}
        </ul>
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
    </div>
  );
}
