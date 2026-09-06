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

/** Named pair records need their chance comparison, sample limits, and crew attribution. */
export function RefereeLegendsContent({ legends }: { legends: RefereeLegends }) {
  const { legend, noiseFloor, pairNobodyNamed, makeupCalls, starFoulTrouble } = legends
  const others = winnersFirst(legends.sameOfficialOtherPairs)
  const charms = others.filter((p) => p.playerWon)
  const curses = others.filter((p) => !p.playerWon)
  const beats = beatsNoiseFloor(legend.p, noiseFloor)

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <SectionHeading>THE FEATURED PLAYOFF RECORD</SectionHeading>
        <StatFigure
          value={formatRecord(legend.wins, legend.losses)}
          caption={`${legend.player.toUpperCase()}\u2019S PLAYOFF RECORD IN GAMES ${legend.official.toUpperCase()} WORKED · ${legend.expectedWins.toFixed(2)} WINS EXPECTED`}
        />
        <p style={BODY}>
          <span style={LEAD_IN}>Observed wins and model expectation.</span> Across the{" "}
          {legends.playoffGames.toLocaleString()} playoff games played since {legends.firstSeason},{" "}
          {legend.player}&rsquo;s teams won {legend.wins} of the {legend.wins + legend.losses} that{" "}
          {legend.official} worked. Expected wins come from a model fitted to playoff team-games
          using both teams&rsquo; regular-season strength and home court. This adjusts for those
          factors but does not fully account for how officials are assigned.
        </p>
        <p style={BODY}>
          Opponents faced with {legend.official.split(" ")[1]} had a slightly lower mean
          regular-season win rate than those faced without him:{" "}
          {legend.opponentStrengthWith.toFixed(3)} against{" "}
          {legend.opponentStrengthWithout.toFixed(3)} by win rate. Of the{" "}
          {noiseFloor.pairsTested.toLocaleString()} official-and-player pairs with at least{" "}
          {noiseFloor.minSharedGames} shared playoff games, this one ranks{" "}
          <strong>#{legend.rank}</strong> in this dataset.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>OTHER PLAYERS WITH THE SAME OFFICIAL</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>
            {countWord(charms.length)} other players finished above their expected wins.
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
          or more in games worked by the same official
          {curses.length > 0 ? (
            <>
              {" "}
              while {joinWithAnd(curses.map((p) => p.player))} won{" "}
              {curses.map((p) => `${p.wins} of ${p.games}`).join(" and ")}
            </>
          ) : null}
          . Comparing many pairs produces both positive and negative extremes.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>ANOTHER LARGE GAP</SectionHeading>
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
          {pairNobodyNamed.player} and {pairNobodyNamed.official} have a larger shortfall in
          wins than the featured pair. A larger raw shortfall does not necessarily mean a
          smaller p-value, because sample size and expected wins also differ.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>EXTREMES EXPECTED FROM MANY COMPARISONS</SectionHeading>
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
          <span style={LEAD_IN}>Chance also produces extreme records.</span> Across{" "}
          {noiseFloor.pairsTested.toLocaleString()}{" "}pairs, the chance calculation&apos;s expected
          minimum p-value is{" "}
          {noiseFloor.mostExtremePFromNoise}. {legend.official} and {legend.player} come in at p ={" "}
          {legend.p}, {beats ? "more extreme than" : "less extreme than"} that reference.
          The expected minimum is a comparison scale, not a corrected significance threshold
          or a guarantee about what chance will produce.
        </p>
        <p style={BODY}>
          In the full grid, {noiseFloor.clearedPoint01}{" "}pairs clear p &lt; 0.01
          where chance predicts {noiseFloor.expectedPoint01}, and{" "}
          {noiseFloor.clearedPoint05} clear p &lt; 0.05 where chance predicts{" "}
          {noiseFloor.expectedPoint05}. These counts do not exceed their chance expectations.
          They provide no aggregate evidence of excess extreme pairs under this comparison.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>GAMES AFTER THE CLAIM BECAME KNOWN</SectionHeading>
        <p style={BODY}>
          A claim found by looking can only be confirmed on games nobody had seen when they found
          it. This one was in circulation by the end of {legend.famousBySeason}. Before then,
          {legend.player} was{" "}
          {formatRecord(legend.beforeClaimWasFamous.wins, legend.beforeClaimWasFamous.losses)} with{" "}
          {legend.official}, and after it was famous,{" "}
          {formatRecord(legend.afterClaimWasFamous.wins, legend.afterClaimWasFamous.losses)}.
        </p>
        <p style={BODY}>
          <span style={LEAD_IN}>Both periods are too small for the declared test.</span> Both halves
          fall under the {legend.minGamesToJudge} shared games this page requires before it will
          evaluate a pair. That threshold was written down before the analysis. The available
          later games therefore cannot provide the planned confirmation test.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>WHILE WE ARE HERE · MAKE-UP CALLS</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>Consecutive calls switch teams more often than after shuffling.</span>{" "}
          Across {makeupCalls.pairs.toLocaleString()} consecutive foul pairs, the next whistle goes
          against the other team {pct(makeupCalls.observedSwitchRate)} of the time, against{" "}
          {pct(makeupCalls.shuffledNull)} when you shuffle the same game&rsquo;s calls into a random
          order, with t = {makeupCalls.excessT}.
        </p>
        <p style={BODY}>
          Shuffling also removes possession order. After an <em>offensive</em> foul, the
          fouling team turns the ball over and defends. If possession drives the pattern, the
          next foul may be on that same team; a simple make-up-call explanation predicts a switch.
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
          The reversal after offensive fouls is consistent with possession changes. It
          weakens the simple make-up-call explanation but cannot rule out individual make-up calls.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>STAR FOUL TROUBLE</SectionHeading>
        <p style={BODY}>
          <span style={LEAD_IN}>Two first-quarter fouls are associated with fewer minutes.</span> They occur in{" "}
          {pct(starFoulTrouble.twoFoulsFirstQuarterRate)} of{" "}
          {starFoulTrouble.starGames.toLocaleString()} star-games, with{" "}
          {Math.abs(starFoulTrouble.minutesLost).toFixed(2)}{" "}fewer minutes than the player&apos;s own average.
          Across {starFoulTrouble.officialsTested} officials the
          spread is {starFoulTrouble.spreadRatio}× what random assignment produces, at p ={" "}
          {starFoulTrouble.p}. The rates are {pct(starFoulTrouble.onTheRoad)}{" "}
          on the road against {pct(starFoulTrouble.atHome)} at home, a gap of{" "}
          {((starFoulTrouble.onTheRoad - starFoulTrouble.atHome) * 100).toFixed(2)} percentage
          points.
        </p>
      </section>

      <section className="flex flex-col gap-3" style={{ ...termCardStyle, gap: SPACE.md }}>
        <SectionHeading>HOW TO READ ANY OF THIS</SectionHeading>
        <p style={{ ...BODY, fontSize: TYPE.data }}>
          Three officials work every game and the play-by-play never records which one made a call,
          so every figure on this page credits all three and cannot isolate an individual
          effect. None of it separates a correct call from an incorrect one. The
          questions, the thresholds and the five named claims were all fixed in writing before the
          playoff data was fetched ({legends.preRegistration}). Results are published even
          when they do not meet their declared evidence thresholds.
        </p>
      </section>
    </div>
  )
}
