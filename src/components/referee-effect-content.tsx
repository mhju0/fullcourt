import { RefereeStyleContent } from "@/components/referee-style-content"
import type { RefereeFoulStyle } from "@/lib/referee-foul-style"
import { readingOf, topShifters, type RefereeTiming, type Verdict } from "@/lib/referee-timing"
import { signedNumber } from "@/lib/signed-number"
import { BODY, LEAD_IN, SectionHeading } from "@/components/referee-parts"
import { RefereeLegendsContent } from "@/components/referee-legends-content"
import type { RefereeLegends } from "@/lib/referee-legends"
import { termCardStyle, termInsetStyle, TYPE } from "@/lib/terminal-styles"
import { StatTile } from "@/components/ui/stat-tile"

/**
 * The one figure this page is built on, stated the same way every time: officials past the bar,
 * against the number chance puts there. Rendering it as a pair rather than as a count is what
 * stops a reader treating "ten officials" as ten findings.
 */
function VerdictTile({ label, verdict }: { label: string; verdict: Verdict }) {
  const reading = readingOf(verdict)
  const lit = reading !== "at chance"
  // A recessed band is the box here, so the tile draws none of its own. `termInsetStyle` is
  // padded vertically at the call site and never horizontally — that is the whole point of it.
  return (
    <div className="py-3" style={termInsetStyle}>
      <StatTile
        variant="cell"
        label={label}
        value={`${verdict.observed} vs ${verdict.expected}`}
        sub={`${verdict.ratio}× CHANCE · ${reading.toUpperCase()}`}
        tone={lit ? "var(--term-blue)" : "var(--term-text-muted)"}
      />
    </div>
  )
}

/** Keep the crew-attribution caveat beside figures derived from the published artifacts. */
export function RefereeEffectContent({
  style,
  timing,
  legends,
}: {
  style: RefereeFoulStyle
  timing: RefereeTiming
  legends: RefereeLegends
}) {
  const shifters = topShifters(timing.shifters)
  const lateMinutes = timing.lateWindowSeconds / 60

  return (
    <div className="flex flex-col gap-12">
      <p style={BODY}>
        <span style={LEAD_IN}>Foul patterns vary across officials&apos; games.</span> Across{" "}
        {timing.gamesCovered.toLocaleString()} regular-season games since {timing.firstSeason},
        the analysis compares foul mix, timing, and home-away differences. Because the data
        records crews rather than individual calls, it cannot establish an official&apos;s bias.
      </p>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHAT SEPARATES OFFICIALS · THE MIX</SectionHeading>
        <p style={BODY}>
          Each cell compares a foul type&apos;s share in an official&rsquo;s games with the league
          average for those seasons. Every row uses the official&apos;s <strong>most recent 200
          games</strong>. Bold cells exceed two standard errors; muted cells do not. Some
          cells will cross that threshold by chance when many are compared.
        </p>
        <RefereeStyleContent data={style} />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHEN THE FOULS COME · A REAL, NARROW EFFECT</SectionHeading>
        <p style={BODY}>
          In this sample, the league calls{" "}
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
          The four quarter shares sum to a whole game, so they are dependent: a lower share
          in one quarter requires a higher share elsewhere. The measure below summarises the
          shift toward later fouls in each official&apos;s games.
        </p>
        <ul className="flex flex-col gap-2" style={{ ...termCardStyle }}>
          {shifters.map((s) => (
            <li key={s.name} className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: TYPE.body, fontWeight: 600 }}>{s.name}</span>
              <span
                className="mono tabular-nums"
                style={{ fontSize: TYPE.data, color: "var(--term-text-muted)" }}
              >
                {signedNumber(s.shift, 2)} pp · {s.games} games
              </span>
            </li>
          ))}
        </ul>
        <p style={{ ...BODY }}>
          Positive means later. Percentage points of a game&rsquo;s own fouls, against the league
          average for that season, over officials with at least {timing.minGames} games. These
          game counts run slightly higher than the table above: timing is read from the play
          stream alone, which survives in games whose box score does not, so it covers{" "}
          {(timing.gamesCovered - style.gamesCovered).toLocaleString()} more of them.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>LATE-GAME AND HOME-AWAY COMPARISONS</SectionHeading>

        <p style={BODY}>
          <span style={LEAD_IN}>Late-game variation does not exceed the chance expectation.</span> Across{" "}
          {timing.gamesCovered.toLocaleString()} games, the league calls{" "}
          {timing.leagueLateFoulsPerGame.toFixed(2)} fouls in the last {lateMinutes} minutes of a
          fourth quarter, {timing.leagueLateShareOfQ4.toFixed(1)}% of that quarter&rsquo;s fouls.
          The number of officials crossing the comparison threshold is{" "}
          <strong>{timing.lateWindow.observed} against {timing.lateWindow.expected} expected by
          chance</strong>. This test compares officials; it cannot determine whether officials
          collectively pass up calls or whether any individual call was correct.
        </p>

        <p style={BODY}>
          <span style={LEAD_IN}>Home-away foul counts differ modestly.</span> Home teams are called for{" "}
          {Math.abs(timing.leagueHomeAwayCounts.shooting).toFixed(2)}{" "}fewer shooting fouls a game
          than visitors, and officials do differ in how far they lean that way: splitting each
          one&rsquo;s home-minus-away gap by foul type puts{" "}
          {timing.homeAway.shooting.observed} of them past the bar on shooting fouls and{" "}
          {timing.homeAway.personal.observed} on personals, against the{" "}
          {timing.expectedByChance} that noise alone produces among {timing.eligibleOfficials}{" "}
          officials. These counts exceed the chance expectation, but the home-away spread
          is about one foul per game across officials. Crew assignment and team behaviour
          limit what can be attributed to an individual.
        </p>
      </section>

      <RefereeLegendsContent legends={legends} />

      <section className="flex flex-col gap-3">
        <SectionHeading>WHAT THESE NUMBERS CANNOT DO</SectionHeading>
        <p style={BODY}>
          Every game credits all three officials because the play-by-play does not identify
          who made each call. Changing crewmates may reduce the influence of any one partner,
          but the analysis cannot isolate an individual official&apos;s contribution.
        </p>
        <p style={BODY}>
          None of this is a fairness claim. Calling more offensive fouls says nothing about whom
          an official favours, and no measurement on this page distinguishes a correct call from
          an incorrect one. It measures how often each kind of call is recorded.
        </p>
      </section>
    </div>
  )
}
