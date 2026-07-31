import { PlayoffGrindMatrix } from "@/components/playoff-grind-matrix"
import {
  PLAYOFF_BEST_OF_FIVE,
  PLAYOFF_ENTRY_REST_BUCKETS,
  PLAYOFF_EQUAL_REST,
  PLAYOFF_GRIND_EXOGENOUS,
  PLAYOFF_ROUND_SPLIT,
  PLAYOFF_ROUNDS_TWO_PLUS_RECORD,
} from "@/lib/playoff-rest-facts"
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles"

const BODY: React.CSSProperties = {
  fontSize: 15,
  color: "var(--term-text-muted)",
  lineHeight: 1.55,
  maxWidth: "42rem",
}
const LEAD = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

/**
 * Section A — the fact that justifies this page existing separately from /analysis.
 *
 * Deliberately the smallest section on the page: one number, why it is structural, and the one
 * exception. The claim is exact rather than rounded, which is why the facts test asserts
 * equality rather than a threshold.
 */
function NoRestSection() {
  const { laterGames, laterEqual, game1Games, game1Equal } = PLAYOFF_EQUAL_REST
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE POSTSEASON HAS NO REST</SectionHeading>
      <div style={termCardStyle}>
        <span
          className="mono tabular-nums block"
          style={{ fontSize: 40, fontWeight: 700, color: "var(--term-text)", lineHeight: 1.05 }}
        >
          {laterEqual.toLocaleString()} of {laterGames.toLocaleString()}
        </span>
        <span className="mono block" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700, marginTop: 6 }}>
          PLAYOFF GAMES AFTER GAME 1, BOTH TEAMS ON THE SAME REST
        </span>
        <p className="mt-3" style={BODY}>
          <span style={LEAD}>Every single one.</span> Once a series starts, the two teams are
          playing each other — so they are on the same schedule, and neither can be more rested
          than the other. Rest, the thing the rest of this site measures, has exactly one place
          to exist in the playoffs: the wait before Game 1.
        </p>
        <p className="mt-2" style={BODY}>
          That wait is where the whole story is. Only {game1Equal} of {game1Games} Game 1s were
          played with both teams equally rested.
        </p>
      </div>
    </section>
  )
}

/** Section B — the finding. The matrix carries it; the layoff buckets corroborate from a second angle. */
function GrindTaxSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE GRIND TAX</SectionHeading>
      <p style={BODY}>
        <span style={LEAD}>The round before decides the round after.</span> A team that had to
        go the distance to survive its last series is in trouble in the next one — and the
        team waiting for them is the one that benefits.
      </p>
      <PlayoffGrindMatrix />
      <div style={termCardStyle}>
        <p className="mono pb-3" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
          THE SAME THING, COUNTED BY DAYS OFF · ROUNDS 2+
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 380 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>REST INTO GAME 1</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>WON THE SERIES (%)</th>
              </tr>
            </thead>
            <tbody>
              {PLAYOFF_ENTRY_REST_BUCKETS.map((b) => (
                <tr key={b.label} style={{ borderTop: "1px solid var(--term-border)" }}>
                  <td style={{ ...termTdStyle, textAlign: "left" }}>{b.label}</td>
                  <td className="tabular-nums" style={termTdStyle}>{b.n}</td>
                  <td className="tabular-nums" style={termTdStyle}>{b.winPct.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/**
 * Section C — the objection, answered, then the part of it that survives.
 *
 * This is the section that earns the page. It also publishes the caveat rather than burying
 * it: the mechanism is arguable even though the effect is not.
 */
function ConfoundSection() {
  const { oppClosedEarly, oppWentLong, closeMatchupOppClosedEarly, closeMatchupOppWentLong, mirrorDeltaPts } =
    PLAYOFF_GRIND_EXOGENOUS
  const closeDelta = closeMatchupOppWentLong.winPct - closeMatchupOppClosedEarly.winPct

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>&ldquo;ISN&rsquo;T THAT JUST THE BETTER TEAM?&rdquo;</SectionHeading>
      <p style={BODY}>
        Fair objection. You earn a short series by being good, so maybe the fresh team just wins
        because it was better all along. Here is why that does not cover it:{" "}
        <span style={LEAD}>how long your opponent&rsquo;s last series went is not up to you.</span>{" "}
        It was decided by two other teams. So hold your own last round fixed at a quick close,
        and let only their side vary.
      </p>
      <div style={termCardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>THEIR LAST ROUND</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>YOU WON THE SERIES (%)</th>
                <th style={termThStyle}>YOUR RECORD EDGE (WIN%)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>They closed it early</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.winPct.toFixed(1)}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.meanWinPctDiff.toFixed(3)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>They went the distance</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.winPct.toFixed(1)}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.meanWinPctDiff.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p style={BODY}>
        <span style={LEAD}>
          {(oppWentLong.winPct - oppClosedEarly.winPct).toFixed(1)} points, from something you did
          not control.
        </span>{" "}
        But read the last column honestly: the teams whose opponents went long were also
        slightly better on record, so part of that gap is quality rather than exhaustion.
      </p>
      <p style={BODY}>
        Widen back out to every second-round-or-later series — no longer holding your own last
        round fixed — and keep only the evenly-matched ones, where neither side has a real
        record advantage to hide behind:{" "}
        <span style={LEAD}>
          {closeMatchupOppClosedEarly.winPct.toFixed(1)}% becomes{" "}
          {closeMatchupOppWentLong.winPct.toFixed(1)}%
        </span>{" "}
        ({closeMatchupOppClosedEarly.n} series against {closeMatchupOppWentLong.n}), a gap of{" "}
        {closeDelta.toFixed(1)} points. It barely shrinks. And running it the other way — when
        you are the one who went the distance — moves it {mirrorDeltaPts.toFixed(1)} points,
        the wrong direction entirely.
      </p>
      <div style={{ ...termCardStyle, borderLeft: "2px solid var(--term-neutral)" }}>
        <p className="mono pb-2" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
          WHAT WE CANNOT TELL YOU
        </p>
        <p style={BODY}>
          Whether it is really fatigue. A team that needed seven games to get past someone has
          also just shown it is worse than its record said — and this data cannot separate
          &ldquo;worn down&rdquo; from &ldquo;not as good as we thought.&rdquo; Game-by-game the
          edge does not fade the way tiredness should, which cuts against the fatigue reading.
          The effect is solid. The reason for it is arguable, and we would rather say so.
        </p>
      </div>
    </section>
  )
}

/**
 * Section D — the model, with the half it loses published beside the half it wins.
 *
 * Both rows ship. Reporting only the rounds-2+ gain would be the same omission that made the
 * previous version of this page hollow, just pointed the other way.
 */
function ModelSection() {
  const { roundsTwoPlus, roundOne } = PLAYOFF_ROUND_SPLIT
  const { win, tie, loss } = PLAYOFF_ROUNDS_TWO_PLUS_RECORD
  const gain = roundsTwoPlus.model - roundsTwoPlus.baseline
  const drop = roundOne.baseline - roundOne.model

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>WHAT THE MODEL DOES WITH IT</SectionHeading>
      <p style={BODY}>
        The bracket below carries a win probability for every series. It is worth knowing where
        that number is worth anything — because there is a rule so simple it barely counts as a
        model: <span style={LEAD}>always pick the team with home-court advantage.</span> Beating
        it is the only bar that matters.
      </p>
      <div style={termCardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>SERIES PREDICTED</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>OUR MODEL (% RIGHT)</th>
                <th style={termThStyle}>ALWAYS HOME COURT (% RIGHT)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>Second round onward</td>
                <td className="tabular-nums" style={termTdStyle}>{roundsTwoPlus.n}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, color: "var(--term-blue)", fontWeight: 700 }}>
                  {roundsTwoPlus.model.toFixed(1)}
                </td>
                <td className="tabular-nums" style={termTdStyle}>{roundsTwoPlus.baseline.toFixed(1)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>First round</td>
                <td className="tabular-nums" style={termTdStyle}>{roundOne.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{roundOne.model.toFixed(1)}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, fontWeight: 700 }}>
                  {roundOne.baseline.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p style={BODY}>
        <span style={LEAD}>
          It gains {gain.toFixed(1)} points from the second round on, and loses{" "}
          {drop.toFixed(1)} in the first.
        </span>{" "}
        That is exactly what it should do. In the first round nobody has a previous round to be
        tired from, so the model knows nothing the simple rule does not — and it is worse for
        pretending otherwise. From the second round on there is a grind to read, and it reads it.
      </p>
      <p style={BODY}>
        {roundsTwoPlus.n} series is not many, so one number is not proof. Season by season, from
        the second round on, the model beat that rule in {win}, tied it in {tie}, and lost to it
        in {loss}. That is the comparison worth trusting: same brackets, same seasons, counted
        in pairs.
      </p>
      <p style={BODY}>
        Grind is measured as games beyond a sweep rather than raw games played because{" "}
        {PLAYOFF_BEST_OF_FIVE.round1BestOfFive} of {PLAYOFF_BEST_OF_FIVE.round1Total} first
        rounds in this record were best-of-five, where five games means a team went the full
        distance rather than closing early.
      </p>
    </section>
  )
}

/**
 * Sections A-D: the argument. A server component with no props and no data fetching — every
 * figure is a published constant, so none of this needs to reach the client as JS.
 *
 * Kept as a sibling of the bracket rather than wrapping it, so reordering the page to put the
 * bracket first is a swap of two elements in `page.tsx` and nothing else.
 */
export function PlayoffRestArgument() {
  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: 1040 }}>
      <NoRestSection />
      <GrindTaxSection />
      <ConfoundSection />
      <ModelSection />
    </div>
  )
}
