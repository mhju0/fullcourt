import { BODY, LEAD_IN, SectionHeading } from "@/components/referee-parts"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { StatFigure, StatTile } from "@/components/ui/stat-tile"
import {
  beatsNoiseFloor,
  countWord,
  formatRecord,
  joinWithAnd,
  winnersFirst,
  type OtherPair,
  type RefereeLegends,
} from "@/lib/referee-legends"
import { signedNumber } from "@/lib/signed-number"
import { SPACE, termCardStyle, termInsetStyle, TYPE } from "@/lib/terminal-styles"

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

const OTHER_PAIR_COLUMNS: DataColumn<OtherPair>[] = [
  { label: "Player", cell: (r) => r.player },
  { label: "With Foster", unit: "won–played", numeric: true,
    cell: (r) => `${r.wins}–${r.games}` },
  { label: "Expected", unit: "wins", numeric: true, cell: (r) => r.expectedWins.toFixed(2) },
  { label: "Difference", unit: "wins", numeric: true,
    cell: (r) => signedNumber(r.wins - r.expectedWins, 2) },
]

/**
 * Referee folklore, finished copy.
 *
 * The page is built around one turn and everything else serves it: the famous record is **real**,
 * and it is still not evidence. Those two sentences have to land in that order, because a reader
 * who is told "it's noise" before seeing the number simply disbelieves the page.
 *
 * So the structure is deliberate. The legend gets its own figure at full size and its confounds
 * genuinely tested — not waved at — before a word of doubt appears. Only then does the same
 * official show up as a good-luck charm for four other players, followed by a pair *more*
 * lopsided than the famous one that nobody has ever written about, and finally the arithmetic
 * that explains all of it at once.
 *
 * Every number comes from `referee-legends.json`. Nothing is typed into a sentence — regenerate
 * the artifact and the prose moves with it. What prose must keep saying in its own words is the
 * attribution caveat, because no figure carries it: a call belongs to one of three officials and
 * the record never says which.
 */
export function RefereeLegendsContent({ legends }: { legends: RefereeLegends }) {
  const { legend, noiseFloor, pairNobodyNamed, makeupCalls, starFoulTrouble } = legends
  const others = winnersFirst(legends.sameOfficialOtherPairs)
  const charms = others.filter((p) => p.playerWon)
  const curses = others.filter((p) => !p.playerWon)
  const beats = beatsNoiseFloor(legend.p, noiseFloor)

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionHeading>THE MOST FEARED REFEREE IN BASKETBALL</SectionHeading>
        <StatFigure
          value={formatRecord(legend.wins, legend.losses)}
          caption={`${legend.player.toUpperCase()}\u2019S PLAYOFF RECORD IN GAMES ${legend.official.toUpperCase()} WORKED · ${legend.expectedWins.toFixed(2)} WINS EXPECTED`}
        />
        <p style={BODY}>
          <span style={LEAD_IN}>The record is real.</span> Across the{" "}
          {legends.playoffGames.toLocaleString()} playoff games played since {legends.firstSeason},{" "}
          {legend.player}&rsquo;s teams won {legend.wins} of the {legend.wins + legend.losses} that{" "}
          {legend.official} worked. The
          obvious explanation is assignment — senior officials work the biggest games, and the
          biggest games are the hardest ones — so the expectation above is not his overall record
          but a win model fitted on every playoff team-game, from both sides&rsquo; regular-season
          strength and home court.
        </p>
        <p style={BODY}>
          It survives that. The opponents he faced with {legend.official.split(" ")[1]} were, if
          anything, slightly <em>weaker</em> than the ones he faced without him —{" "}
          {legend.opponentStrengthWith.toFixed(3)} against{" "}
          {legend.opponentStrengthWithout.toFixed(3)} by win rate. Of the{" "}
          {noiseFloor.pairsTested.toLocaleString()} official-and-player pairs with at least{" "}
          {noiseFloor.minSharedGames} shared playoff games, this one ranks{" "}
          <strong>#{legend.rank}</strong>. It is the most lopsided pairing in the sport.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>THE SAME MAN, THE SAME ELEVEN POSTSEASONS</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>
            He is also the best thing that ever happened to {countWord(charms.length)} other
            players.
          </span>{" "}
          Same official, same seasons, same method that produced the figure above.
        </p>
        <DataTable
          columns={OTHER_PAIR_COLUMNS}
          rows={others}
          rowKey={(r) => r.player}
          width="numeric"
        />
        <p style={BODY}>
          {joinWithAnd(charms.map((p) => p.player))} all cleared their expectation by four wins
          or more with the same man {legend.player} could not beat
          {curses.length > 0 ? (
            <>
              {" "}
              — while {joinWithAnd(curses.map((p) => p.player))} went{" "}
              {curses.map((p) => `${p.wins} of ${p.games}`).join(" and ")}, which is{" "}
              {legend.player}&rsquo;s story told a second time about someone nobody mentions
            </>
          ) : null}
          . One referee cannot be a curse and a charm on the same whistle. What he can be is one
          name attached to a lot of pairs.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>AND THE PAIR NOBODY EVER NAMED</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatFigure
            value={`${pairNobodyNamed.wins} of ${pairNobodyNamed.games}`}
            caption={`${pairNobodyNamed.player.toUpperCase()} WITH ${pairNobodyNamed.official.toUpperCase()} · ${pairNobodyNamed.expectedWins.toFixed(2)} WINS EXPECTED`}
            tone="var(--term-text)"
          />
          <div className="py-3" style={termInsetStyle}>
            <StatTile
              variant="cell"
              label="MISSED BY"
              value={signedNumber(pairNobodyNamed.wins - pairNobodyNamed.expectedWins, 2)}
              sub="WINS · WIDER THAN THE FAMOUS ONE"
            />
          </div>
        </div>
        <p style={BODY}>
          By the same measure, {pairNobodyNamed.player} and {pairNobodyNamed.official} is a{" "}
          <em>bigger</em> gap than the one everybody knows about. There is no nickname for it, no
          clip compilation, no broadcast mention. The only difference between this pair and the
          famous one is that somebody went looking for the famous one.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>SOMEBODY HAS TO FINISH FIRST</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="py-3" style={termInsetStyle}>
            <StatTile
              variant="cell"
              label="PAIRS EXAMINED"
              value={noiseFloor.pairsTested.toLocaleString()}
              sub={`AT LEAST ${noiseFloor.minSharedGames} SHARED PLAYOFF GAMES`}
            />
          </div>
          <div className="py-3" style={termInsetStyle}>
            <StatTile
              variant="cell"
              label="CLEARED p < 0.01"
              value={`${noiseFloor.clearedPoint01} vs ${noiseFloor.expectedPoint01}`}
              sub="OBSERVED VS EXPECTED BY CHANCE"
            />
          </div>
          <div className="py-3" style={termInsetStyle}>
            <StatTile
              variant="cell"
              label="CLEARED p < 0.05"
              value={`${noiseFloor.clearedPoint05} vs ${noiseFloor.expectedPoint05}`}
              sub="FEWER THAN CHANCE PRODUCES"
            />
          </div>
        </div>
        <p style={BODY}>
          <span style={LEAD_IN}>Here is the part that undoes all of it.</span> Line up{" "}
          {noiseFloor.pairsTested.toLocaleString()} pairs of coin flips and the most extreme one
          you should expect, from nothing at all, lands at p ={" "}
          {noiseFloor.mostExtremePFromNoise}. {legend.official} and {legend.player} come in at p ={" "}
          {legend.p} — {beats ? "past that mark" : "short of it"}. The single most lopsided
          referee-and-player record in basketball is{" "}
          {beats ? "barely past" : "not even as extreme as"} what a grid this size hands you when
          nothing whatsoever is going on.
        </p>
        <p style={BODY}>
          And the grid agrees with itself: {noiseFloor.clearedPoint01} pairs clear p &lt; 0.01
          where chance predicts {noiseFloor.expectedPoint01}, and{" "}
          {noiseFloor.clearedPoint05} clear p &lt; 0.05 where chance predicts{" "}
          {noiseFloor.expectedPoint05} — <em>fewer</em> than there should be. There is no pattern
          here to find. There is a leaderboard, and leaderboards always have somebody on top.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>THE ONE TEST THAT WOULD SETTLE IT</SectionHeading>
        <p style={BODY}>
          A claim found by looking can only be confirmed on games nobody had seen when they found
          it. This one was in circulation by the end of {legend.famousBySeason}, so the honest
          test is everything after: before it was famous {legend.player} was{" "}
          {formatRecord(legend.beforeClaimWasFamous.wins, legend.beforeClaimWasFamous.losses)} with{" "}
          {legend.official}, and after it was famous,{" "}
          {formatRecord(legend.afterClaimWasFamous.wins, legend.afterClaimWasFamous.losses)}.
        </p>
        <p style={BODY}>
          <span style={LEAD_IN}>The direction holds, and it still proves nothing.</span> Both halves
          fall under the {legend.minGamesToJudge} shared games this page requires before it will
          judge a pair at all — a threshold written down before any of these numbers were
          computed, precisely so it could not be relaxed once they were. The famous record is real,
          it is the most extreme in the sport, and it is exactly as extreme as chance guarantees
          somebody&rsquo;s will be. All three of those are true at once.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHILE WE ARE HERE · MAKE-UP CALLS</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>The most repeated belief about officiating looks true.</span>{" "}
          Across {makeupCalls.pairs.toLocaleString()} consecutive foul pairs, the next whistle goes
          against the other team {pct(makeupCalls.observedSwitchRate)} of the time, against{" "}
          {pct(makeupCalls.shuffledNull)} when you shuffle the same game&rsquo;s calls into a random
          order. That is a t of {makeupCalls.excessT}, which in this sport is enormous.
        </p>
        <p style={BODY}>
          It is also entirely the ball changing hands. Shuffling the order destroys possession, and
          basketball alternates possession. The way to tell them apart is an{" "}
          <em>offensive</em> foul, which is a turnover: the fouling team goes straight onto defence,
          so possession predicts the next foul lands on <em>them</em> — below chance — while
          compensation predicts above it either way.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="py-3" style={termInsetStyle}>
            <StatTile variant="cell" label="AFTER A DEFENSIVE FOUL"
              value={pct(makeupCalls.afterDefensiveFoul)} sub="NEXT CALL SWITCHES TEAMS" />
          </div>
          <div className="py-3" style={termInsetStyle}>
            <StatTile variant="cell" label="AFTER AN OFFENSIVE FOUL"
              value={pct(makeupCalls.afterOffensiveFoul)} sub="BELOW CHANCE, NOT ABOVE"
              tone="var(--term-blue)" />
          </div>
          <div className="py-3" style={termInsetStyle}>
            <StatTile variant="cell" label="…WITHIN 15 SECONDS"
              value={pct(makeupCalls.afterOffensiveWithin15s)} sub="THE SAME TEAM, FOUR TIMES IN FIVE" />
          </div>
        </div>
        <p style={BODY}>
          The sign flips exactly where possession says it must. There is no evening-up in the
          whistle; there is a ball, and it keeps changing hands.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>AND NOBODY IS HUNTING THE STARS</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>Two quick fouls and your best player sits.</span> It happens in{" "}
          {pct(starFoulTrouble.twoFoulsFirstQuarterRate)} of{" "}
          {starFoulTrouble.starGames.toLocaleString()} star-games, and it costs him{" "}
          {Math.abs(starFoulTrouble.minutesLost).toFixed(2)} minutes against his own average. What
          it is not is anybody&rsquo;s doing: across {starFoulTrouble.officialsTested} officials the
          spread is {starFoulTrouble.spreadRatio}× what random assignment produces, at p ={" "}
          {starFoulTrouble.p}. Nor does the visiting star wear it — {pct(starFoulTrouble.onTheRoad)}{" "}
          on the road against {pct(starFoulTrouble.atHome)} at home, a gap of{" "}
          {((starFoulTrouble.onTheRoad - starFoulTrouble.atHome) * 100).toFixed(2)} percentage
          points.
        </p>
      </section>

      <section className="flex flex-col gap-3" style={{ ...termCardStyle, gap: SPACE.md }}>
        <SectionHeading>HOW TO READ ANY OF THIS</SectionHeading>
        <p style={{ ...BODY, fontSize: TYPE.data }}>
          Three officials work every game and the play-by-play never records which one made a call,
          so every figure on this page credits all three and is roughly a third of whatever the
          individual effect is. None of it separates a correct call from an incorrect one. The
          questions, the thresholds and the five named claims were all fixed in writing before the
          playoff data existed — {legends.preRegistration} — and every result is published whether
          it came back interesting or empty. Most of them came back empty.
        </p>
      </section>
    </div>
  )
}
