import { RefereeStyleContent } from "@/components/referee-style-content"
import type { RefereeFoulStyle } from "@/lib/referee-foul-style"
import { readingOf, topShifters, type RefereeTiming, type Verdict } from "@/lib/referee-timing"
import { signedNumber } from "@/lib/signed-number"
import { termCardStyle, termInsetStyle } from "@/lib/terminal-styles"

const BODY: React.CSSProperties = {
  fontSize: 15,
  color: "var(--term-text-muted)",
  lineHeight: 1.55,
  maxWidth: "42rem",
}
const LEAD = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono flex items-center gap-3 py-1"
      style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
    >
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

/**
 * The one figure this page is built on, stated the same way every time: officials past the bar,
 * against the number chance puts there. Rendering it as a pair rather than as a count is what
 * stops a reader treating "ten officials" as ten findings.
 */
function VerdictTile({ label, verdict }: { label: string; verdict: Verdict }) {
  const reading = readingOf(verdict)
  const lit = reading !== "at chance"
  return (
    <div className="flex flex-col gap-1" style={termInsetStyle}>
      <span
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="mono tabular-nums"
        style={{
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.1,
          color: lit ? "var(--term-blue)" : "var(--term-text-muted)",
        }}
      >
        {verdict.observed} vs {verdict.expected}
      </span>
      <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
        {verdict.ratio}× CHANCE · {reading.toUpperCase()}
      </span>
    </div>
  )
}

/**
 * Referee Effect, finished copy.
 *
 * Two of the three sections below are **nulls, published on purpose**, and the page is built so
 * they read as the point rather than as an apology. The site has done this once before with the
 * win-total market check on `/schedule`.
 *
 * Every figure comes from `referee-timing.json` or `referee-foul-style.json`. Nothing is typed
 * into the prose — regenerate the artifacts and the sentences move with them, which is what the
 * pinning rule in `CLAUDE.md` is for. The one thing prose must keep saying in its own words is
 * the attribution caveat, because no number carries it.
 */
export function RefereeEffectContent({
  style,
  timing,
}: {
  style: RefereeFoulStyle
  timing: RefereeTiming
}) {
  const shifters = topShifters(timing.shifters)
  const lateMinutes = timing.lateWindowSeconds / 60

  return (
    <div className="flex flex-col gap-12">
      <p style={BODY}>
        <span style={LEAD}>Officials do not call the same game the same way.</span> Across{" "}
        {timing.gamesCovered.toLocaleString()} regular-season games since {timing.firstSeason},
        one thing separates them clearly, and two of the things people most often assume about
        them do not survive contact with the play-by-play. This page is about what a whistle{" "}
        <em>is</em>, not about who it favours — three officials work every game and the record
        never says which of them made a call, so nothing here can be read as bias, and none of it
        is meant to be.
      </p>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHAT SEPARATES OFFICIALS · THE MIX</SectionHeading>
        <p style={BODY}>
          Give two officials the same game and they will call a different <em>kind</em> of foul.
          Each cell below is one official&rsquo;s share of that foul type against the league
          average for the same season, so an era&rsquo;s rule changes cannot masquerade as a
          personal tendency. Bold cells clear two standard errors; muted ones are noise, and the
          page says so rather than letting you find a pattern in them.
        </p>
        <RefereeStyleContent data={style} />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHEN THE FOULS COME · A REAL, NARROW EFFECT</SectionHeading>
        <p style={BODY}>
          Fouls are not spread evenly through a game — the league calls{" "}
          {timing.leagueQuarterShares.q1.toFixed(1)}% of them in the first quarter and{" "}
          {timing.leagueQuarterShares.q4.toFixed(1)}% in the fourth. Officials differ in how far
          they lean that way, and they differ at the <em>ends</em> of a game rather than through
          it: the first and fourth quarters separate them, the second and third do not.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <VerdictTile label="1ST QUARTER" verdict={timing.byQuarter.q1} />
          <VerdictTile label="2ND QUARTER" verdict={timing.byQuarter.q2} />
          <VerdictTile label="3RD QUARTER" verdict={timing.byQuarter.q3} />
          <VerdictTile label="4TH QUARTER" verdict={timing.byQuarter.q4} />
        </div>
        <p style={BODY}>
          The four shares add to a whole game, so this is one habit rather than two: an official
          light in the first quarter has to be heavy somewhere later. Read the column below as a
          single number — how much of a game&rsquo;s fouls an official moves from its start toward
          its finish.
        </p>
        <ul className="flex flex-col gap-2" style={{ ...termCardStyle }}>
          {shifters.map((s) => (
            <li key={s.name} className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <span
                className="mono tabular-nums"
                style={{ fontSize: 13, color: "var(--term-text-muted)" }}
              >
                {signedNumber(s.shift, 2)} pp · {s.games} games
              </span>
            </li>
          ))}
        </ul>
        <p style={{ ...BODY, fontSize: 13 }}>
          Positive means later. Percentage points of a game&rsquo;s own fouls, against the league
          average for that season, over officials with at least {timing.minGames} games. These
          game counts run slightly higher than the table above: timing is read from the play
          stream alone, which survives in games whose box score does not, so it covers{" "}
          {(timing.gamesCovered - style.gamesCovered).toLocaleString()} more of them.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>TWO THINGS THAT ARE NOT TRUE</SectionHeading>

        <p style={BODY}>
          <span style={LEAD}>Officials do not swallow the whistle at the end.</span> It is the
          most repeated claim about NBA officiating, and in{" "}
          {timing.gamesCovered.toLocaleString()} games it does not happen. The league calls{" "}
          {timing.leagueLateFoulsPerGame.toFixed(2)} fouls in the last {lateMinutes} minutes of a
          fourth quarter — {timing.leagueLateShareOfQ4.toFixed(1)}% of that quarter&rsquo;s fouls
          — and the number of officials who differ from each other there is{" "}
          <strong>{timing.lateWindow.observed} against {timing.lateWindow.expected} expected by
          chance</strong>. Below chance, not above it. The quarter-level habit above is real and
          has nothing to do with the closing minutes.
        </p>

        <p style={BODY}>
          <span style={LEAD}>And no official tilts the whistle home.</span> Home teams do commit
          fewer fouls — {Math.abs(timing.leagueHomeAwayCounts.shooting).toFixed(2)} fewer shooting
          fouls a game than visitors — but that gap belongs to the league, not to any individual
          in it. Splitting each official&rsquo;s home-minus-away gap by foul type puts them at{" "}
          {timing.homeAway.shooting.ratio}× chance on shooting fouls and{" "}
          {timing.homeAway.personal.ratio}× on personals, against the {timing.expectedByChance}{" "}
          that noise alone produces among {timing.eligibleOfficials} officials. This is the second
          time the question has been asked here and the second time the answer has been no.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>WHAT THESE NUMBERS CANNOT DO</SectionHeading>
        <p style={BODY}>
          A call belongs to one of three officials and the play-by-play never records which, so
          every game credits all three and each figure here is roughly a third of the real
          individual effect — the true spread is <em>wider</em> than what is shown, not narrower.
          What makes that survivable is that crews barely repeat: partners are effectively
          reshuffled across a career, so they wash out as noise instead of accumulating as bias.
        </p>
        <p style={BODY}>
          None of this is a fairness claim. Calling more offensive fouls says nothing about whom
          an official favours, and no measurement on this page distinguishes a correct call from
          an incorrect one — only how often a kind of call is made.
        </p>
      </section>
    </div>
  )
}
