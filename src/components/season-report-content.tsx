"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ExploreGameDetailModal } from "@/components/explore-game-detail-modal"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/ui/stat-tile"
import { ZeroRestWorkload } from "@/components/zero-rest-workload"
import { apiFetcher } from "@/lib/fetcher"
import { useBacktest } from "@/hooks/useBacktest"
import { browsableSeasons, NBA_SEASONS } from "@/lib/nba-season"
import {
  ABNORMAL_SEASON_NOTES,
  allSeasonNormExcluding,
  MIN_GAMES_FOR_INFERENCE,
  seasonReportVerdict,
  type SeasonReportCall,
  type SeasonReportRate,
  type SeasonReportResponse,
  type SeasonReportTeamLabelled,
  type SeasonReportVerdict,
  type SeasonReportWeek,
} from "@/lib/season-report"
import {
  HOME_COURT_SPAN_PP,
  REST_SHARE_OF_HOME_COURT,
  REST_SPAN_PP,
} from "@/lib/schedule-value"
import { LEAD, termCardStyle, termDashedEmptyStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { signedNumber } from "@/lib/signed-number"
import { MessageCard } from "@/components/ui/message-card"

// The newest season with data, which is the current one by construction: NBA_SEASONS is
// derived from the ET date. No separate "is it the current season" question to get wrong.
const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1]

/**
 * The vs-history blurb, read off the loaded season rather than a hardcoded 82-game figure —
 * a shortened season (1998-99, 2019-20 pre-bubble) or a mid-season one carries a real, much
 * wider band, and stating "roughly 940 games" beside either was simply false.
 *
 * Says "with the rested team at home", not "with a decidable rest gap": `season-report.ts`
 * filters through `isCalledSide`, so these counts are the home row alone. The wider decidable
 * set includes rested-visitor games this page never counts, and the old wording named a
 * population about 40% larger than the one behind the number.
 */
function countedGamesSentence(rate: SeasonReportRate): string {
  if (rate.band === null) return "This season has no games yet with the rested team at home."
  return `This season has produced ${rate.games.toLocaleString()} games with the rested team at home so far, worth about ±${rate.band.toFixed(1)} percentage points either way. Seasons move inside that range more often than they move outside it.`
}

/** The middle value of a sorted number list, for a prose figure that should track real data. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** A rate tile that refuses to print a number it cannot stand behind. */
function RateTile({ label, rate, testId }: { label: string; rate: SeasonReportRate; testId?: string }) {
  const gated = rate.games < MIN_GAMES_FOR_INFERENCE || rate.band === null
  return (
    <StatTile
      label={label}
      value={gated ? "—" : `${rate.winPct.toFixed(1)}%`}
      sub={
        !gated
          ? `±${rate.band!.toFixed(1)} · ${rate.games.toLocaleString()} GAMES`
          : rate.games === 0
            ? "NO GAMES YET WITH THE RESTED TEAM AT HOME"
            : `TOO EARLY · ${rate.games} OF ${MIN_GAMES_FOR_INFERENCE} GAMES NEEDED`
      }
      accent={gated ? "var(--term-neutral)" : "var(--term-blue)"}
      valueTestId={testId}
    />
  )
}

/**
 * The note above the tiles when the selected season did not run the ordinary 82-game shape.
 *
 * Rendered from the season alone, so it is up before the data arrives rather than after —
 * the point is to be read *first*, not to caption numbers already on screen.
 */
function AbnormalSeasonNote({ season }: { season: string }) {
  const note = ABNORMAL_SEASON_NOTES[season]
  if (!note) return null

  return (
    <div
      data-testid="abnormal-season-note"
      className="flex flex-col gap-2"
      style={{ ...termCardStyle, padding: 16, borderLeft: "2px solid var(--term-amber)" }}
    >
      <span
        className="mono"
        style={{ fontSize: 11, letterSpacing: TRACK.label, fontWeight: 700, color: "var(--term-amber)" }}
      >
        {note.label}
      </span>
      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        {note.note}
      </p>
    </div>
  )
}

function SectionDivider({ label, descriptor, testId }: { label: string; descriptor?: string; testId?: string }) {
  return (
    <div
      className="mono flex items-center gap-3 py-2"
      style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}
    >
      <span data-testid={testId} style={{ fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      {descriptor ? <span style={{ fontWeight: 600 }}>{descriptor}</span> : null}
    </div>
  )
}

/** The one sentence under the tiles. Four states, no superlative. */
function VerdictLine({ verdict }: { verdict: SeasonReportVerdict }) {
  const { text, tone } =
    verdict.kind === "tooEarly"
      ? {
          text: `TOO EARLY TO CALL — ${verdict.games.toLocaleString()} GAMES SO FAR`,
          tone: "var(--term-text-muted)",
        }
      : verdict.kind === "noNorm"
        ? {
            text: "ALL-SEASON NORM UNAVAILABLE",
            tone: "var(--term-text-muted)",
          }
        : verdict.kind === "inLine"
          ? {
              text: `IN LINE WITH THE ALL-SEASON NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
              tone: "var(--term-text)",
            }
          : {
              text: `${verdict.kind === "above" ? "ABOVE" : "BELOW"} THE NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
              tone: verdict.kind === "above" ? "var(--term-blue-text)" : "var(--term-red-text)",
            }

  return (
    <p className="mono" style={{ fontSize: 12, letterSpacing: TRACK.sub, fontWeight: 600, color: tone }}>
      {text}
    </p>
  )
}

/**
 * Blue above the baseline, red below, grey on it — the diverging pair the other pages use.
 *
 * Diverging around `baseline` rather than around zero, because zero is not this column's
 * no-effect point: the rested arm is played at home and the tired arm on the road, so a team
 * with no rest-conversion skill still posts about +10. Colouring from zero painted twenty-odd
 * teams blue for having home-court advantage.
 */
function swingColor(swing: number | null, baseline: number | null): string {
  if (swing === null) return "var(--term-neutral)"
  const zero = baseline ?? 0
  if (swing === zero) return "var(--term-neutral)"
  return swing > zero ? "var(--term-blue-text)" : "var(--term-red-text)"
}

/**
 * The three cells for one arm of the split — wins, losses, win rate — or em dashes across
 * all three when the team never played on that side. Wins and losses get their own columns
 * rather than a packed "21-8" so neither number has to be inferred from its position.
 */
/**
 * The three columns one arm of the rested/tired split contributes, under a shared group heading.
 *
 * Was `ArmCells`, a fragment of three `<td>`s the row spliced in — which meant the header row
 * and the body row each described this arm separately and could disagree about how many columns
 * it had. As columns they carry their own headers, so they cannot.
 */
function armColumns(
  group: string,
  arm: (row: SeasonReportTeamLabelled) => { wins: number; games: number; pct: number | null }
): DataColumn<SeasonReportTeamLabelled>[] {
  const of =
    (pick: (a: { wins: number; games: number; pct: number }) => string | number) =>
    (row: SeasonReportTeamLabelled) => {
      const a = arm(row)
      return a.pct === null ? "—" : pick({ wins: a.wins, games: a.games, pct: a.pct })
    }
  return [
    { group, label: "WINS", numeric: true, cell: of((a) => a.wins) },
    { group, label: "LOSSES", numeric: true, cell: of((a) => a.games - a.wins) },
    { group, label: "WIN%", numeric: true, cell: of((a) => `${a.pct.toFixed(0)}%`) },
  ]
}

/**
 * The edge-conversion blurb, read off the loaded teams rather than a hardcoded "roughly
 * thirty" — true only of a completed 82-game season, and false mid-season or in a shortened
 * one, where each arm carries far fewer games.
 */
function edgeConversionSentence(teams: SeasonReportTeamLabelled[]): string {
  const armSize = teams.length > 0 ? Math.round(median(teams.map((t) => t.restedGames))) : 0
  const armSentence =
    armSize > 0
      ? `Around ${armSize} games sit behind each arm for a typical team, so treat these`
      : "Treat these"
  return `How much better each team played as the fresher side than as the tireder one. A team is its own comparison here, because win rate when rested on its own mostly ranks how good the team was. ${armSentence} as records rather than as a table of who manages rest well.`
}

/**
 * The swing column's zero line, stated above the table.
 *
 * Every rested-arm game is a home game and every tired-arm game is a road game — the site only
 * calls a rest edge when the rested side is also at home — so most of what this column measures
 * is home court. Without this line a reader takes a +35 swing for a finding about rest.
 */
function SwingBaselineNote({ baseline }: { baseline: number | null }) {
  if (baseline === null) return null

  return (
    <p className="mono" data-testid="swing-baseline-note" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
      A TEAM THAT CONVERTS REST NO BETTER THAN THE LEAGUE STILL SWINGS{" "}
      {signedNumber(baseline, 1)} THIS SEASON · THE RESTED ARM IS PLAYED AT HOME AND THE TIRED ARM
      ON THE ROAD, SO READ EVERY ROW AGAINST THAT AND NOT AGAINST ZERO
    </p>
  )
}

/**
 * Rest edge conversion.
 *
 * A record table, deliberately not a ranking. Each team is measured against its own
 * tired record rather than the league's, because raw win-rate-when-rested ranks team
 * quality — but the difference of two ~30-game proportions still carries roughly twelve
 * points of standard error, so nothing here is crowned and every row shows its n.
 */
function EdgeConversion({
  teams,
  swingBaseline,
}: {
  teams: SeasonReportTeamLabelled[]
  swingBaseline: number | null
}) {
  const thin = teams.filter((t) => t.restedGames < 10 || t.tiredGames < 10).length

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="REST EDGE CONVERSION" descriptor="RECORDS, NOT A RANKING" />
      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        {edgeConversionSentence(teams)}
      </p>
      <SwingBaselineNote baseline={swingBaseline} />
      {/* Full within the wide track, not content-sized: a 30-team league table is this page's
          widest kind of block, and at ~600px inside the 1040 column it read as lost rather
          than compact. Ten columns fill 1040 without the empty-gap stretch the numeric cap
          exists to prevent. */}
      <DataTable
        width="full"
        minWidth={560}
        rows={teams}
        rowKey={(t) => t.teamId}
        rowAttrs={(t) => ({
          "data-testid": "edge-conversion-row",
          style: { opacity: t.restedGames < 10 || t.tiredGames < 10 ? 0.45 : 1 },
        })}
        columns={[
          { label: "TEAM", cell: (t) => t.abbreviation },
          ...armColumns("RESTED", (t) => ({ wins: t.restedWins, games: t.restedGames, pct: t.restedWinPct })),
          ...armColumns("TIRED", (t) => ({ wins: t.tiredWins, games: t.tiredGames, pct: t.tiredWinPct })),
          {
            label: "SWING",
            unit:
              swingBaseline === null
                ? "PCT POINTS"
                : `PCT POINTS · BASELINE ${signedNumber(swingBaseline, 1)}`,
            numeric: true,
            style: { fontWeight: 700 },
            cell: (t) => (
              <span style={{ color: swingColor(t.swing, swingBaseline) }}>
                {t.swing === null ? "—" : signedNumber(t.swing, 1)}
              </span>
            ),
          },
        ]}
      />
      {thin > 0 ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {thin} {thin === 1 ? "TEAM HAS" : "TEAMS HAVE"} FEWER THAN 10 GAMES ON ONE SIDE AND {thin === 1 ? "IS" : "ARE"} DIMMED
        </p>
      ) : null}
    </div>
  )
}

/**
 * What the schedule was worth.
 *
 * The section leads with the per-game effect and only then gives the season's extremes, and
 * that order is the whole design. Four-tenths of a win, read cold, invites a first-time reader
 * to conclude rest is nothing. Read after "a rest edge is worth just under a fifth of home
 * court", the same number says what is true: the effect is real and the schedule never lets it
 * accumulate, because the league hands out edges close to evenly.
 *
 * The scale, the finding and this season's two extremes — no table. The full per-team pricing
 * had its 30 rows here until 2026-08-23, a strict subset of Schedule Edge's breakdown, which
 * meant a reader crossing the two pages met the same table twice and this page's own results
 * sections sat five screens deep. The figure's one home is Schedule Edge, beside the edge
 * counts it is priced from; this section states the season in two lines and points there.
 *
 * Deliberately no result data. Every figure here is a property of the calendar, so a 64-win
 * team and a 17-win team handed the same schedule get the same number — which is what makes it
 * schedule *luck* and not a verdict on anybody.
 */
function ScheduleValue({ teams }: { teams: SeasonReportTeamLabelled[] }) {
  const ranked = [...teams].sort(
    (a, b) => b.scheduleValueWins - a.scheduleValueWins || a.teamId - b.teamId
  )
  const most = ranked[0]
  const least = ranked[ranked.length - 1]

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider
        label="WHAT THE SCHEDULE WAS WORTH"
        descriptor="SCHEDULE LUCK, NOT RESULTS"
        testId="schedule-value-heading"
      />

      {/* The scale line. Rendered as a callout rather than as body copy because it is the
          sentence no wins figure on this page can be read honestly without. */}
      <div
        data-testid="rest-scale-line"
        style={{ ...termCardStyle, padding: 16, borderLeft: `2px solid var(--term-blue)` }}
      >
        <p style={{ fontSize: TYPE.body, color: "var(--term-text)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
          Being the fresher side moves a home team&rsquo;s win probability by{" "}
          <strong>{REST_SPAN_PP.toFixed(1)} points</strong>. Playing at home instead of away moves
          it by <strong>{HOME_COURT_SPAN_PP.toFixed(1)}</strong>. So a rest edge is worth about{" "}
          <strong>
            {Math.round(REST_SHARE_OF_HOME_COURT * 100)}% of home court
          </strong>{" "}
          — real, and far smaller than the thing every fan already accounts for.
        </p>
      </div>

      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        Priced at that rate, every rest edge a team was handed, minus every one it had to face,
        is small for everyone — the league spreads rest around evenly enough that no schedule is
        worth half a game either way, and that is the finding. No score is read, so none of it
        says how any team played.{" "}
        {/* The figure is derived, so it owes the reader its method. Schedule Edge publishes the
            identical number and its method page documents the conversion. */}
        <a href="/behind-the-data/schedule-edge" style={{ color: "var(--term-blue-text)", fontWeight: 600 }}>
          How this is priced →
        </a>
      </p>

      {most && least ? (
        <p className="mono" data-testid="schedule-value-extremes" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {most.abbreviation} GAINED THE MOST AT {signedNumber(most.scheduleValueWins, 1)} WINS ·{" "}
          {least.abbreviation} LOST THE MOST AT {signedNumber(least.scheduleValueWins, 1)}
        </p>
      ) : null}

      {/* The one home of the per-team table. Not a season deep link on purpose: Schedule Edge
          keeps its own season state, and it withholds the one season (2019-20) this selector
          can show. */}
      <a
        data-testid="schedule-value-crosslink"
        href="/schedule"
        className="mono w-fit"
        style={{ fontSize: 12, letterSpacing: TRACK.sub, fontWeight: 700, color: "var(--term-blue-text)" }}
      >
        EVERY TEAM, PRICED AND RANKED — SCHEDULE EDGE →
      </a>
    </div>
  )
}

/**
 * Loudest calls.
 *
 * Ranked by rest gap and not by margin, because the two are uncorrelated: a
 * margin ranking fills up with blowouts the model had no opinion about.
 */
function LoudestCalls({
  calls,
  abbrById,
}: {
  calls: SeasonReportCall[]
  abbrById: Map<number, string>
}) {
  const [openGameId, setOpenGameId] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="LOUDEST CALLS" descriptor="RANKED BY REST GAP" />
      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        The games where the two teams arrived in the most different states, whether or not
        it worked out. Ranked by the size of the rest gap rather than by the final margin,
        because the two have nothing to do with each other.
      </p>
      <div className="flex flex-col gap-[2px]">
        {calls.map((c) => (
          <button
            key={c.gameId}
            type="button"
            data-testid="loudest-call-row"
            onClick={() => setOpenGameId(c.gameId)}
            // Background is a class, not an inline `style`. It was inline until 2026-08-13, and
            // an inline declaration outranks a class rule — so `hover:bg-` never painted on a row
            // that is a button and needs to look like one. Measured: computed background
            // identical at rest and on hover.
            className="mono flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors bg-[var(--term-surface)] hover:bg-[var(--term-surface-2)]"
            style={{
              border: "1px solid var(--term-border)",
              borderLeft: `2px solid ${c.restedTeamWon ? "var(--term-blue)" : "var(--term-red)"}`,
              borderRadius: "var(--term-radius)",
              fontSize: 12,
            }}
          >
            <span className="tabular-nums" style={{ color: "var(--term-text-muted)", minWidth: 84 }}>
              {c.date}
            </span>
            <span style={{ flex: 1, color: "var(--term-text)", fontWeight: 600 }}>
              {abbrById.get(c.awayTeamId) ?? "—"} @ {abbrById.get(c.homeTeamId) ?? "—"}
            </span>
            {/* Dropped below `sm`: the five columns' minimum widths total more than a 390px
                phone, which pushed the whole page into a horizontal scroll. The score is the
                one value here a reader can get by opening the row, so it is the one to cut. */}
            <span
              className="hidden tabular-nums sm:inline"
              style={{ color: "var(--term-text-muted)", minWidth: 64 }}
            >
              {c.awayScore}-{c.homeScore}
            </span>
            <span className="tabular-nums" style={{ color: "var(--term-text)", minWidth: 76 }}>
              RA {c.restAdvantage.toFixed(2)}
            </span>
            <span
              style={{
                minWidth: 72,
                textAlign: "right",
                fontWeight: 700,
                color: c.restedTeamWon ? "var(--term-blue-text)" : "var(--term-red-text)",
              }}
            >
              {c.restedTeamWon ? "HIT" : "MISS"} {signedNumber(c.restedMargin, 1).replace(".0", "")}
            </span>
          </button>
        ))}
      </div>
      <ExploreGameDetailModal
        gameId={openGameId}
        open={openGameId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenGameId(null)
        }}
      />
    </div>
  )
}

/** Schedule tax — facts about what each team was asked to do. No inference, so no gate. */
function ScheduleTax({
  teams,
  basis,
}: {
  teams: SeasonReportTeamLabelled[]
  basis: SeasonReportResponse["basis"]
}) {
  const byMiles = [...teams].sort((a, b) => b.travelMiles - a.travelMiles || a.teamId - b.teamId)
  const most = byMiles[0]
  const least = byMiles[byMiles.length - 1]

  return (
    <div className="flex flex-col gap-3">
      {/* The descriptor has to move with the basis. "COMPLETED GAMES ONLY" over a season with
          no completed game describes an empty set, when what is actually shown is the whole
          published schedule. */}
      <SectionDivider
        label="SCHEDULE TAX"
        descriptor={basis === "schedule" ? "FULL PUBLISHED SCHEDULE" : "COMPLETED GAMES ONLY"}
      />
      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        What the schedule asked of each team. These are counts, not estimates — nothing here is
        a claim about who won because of it. They count what a team <em>played</em>: whether it
        faced more back-to-backs than it inflicted is a different fact, answered by the B2B and
        3-in-4 edge columns on{" "}
        {/* Same words, different facts: 17 back-to-backs played can coexist with a positive B2B
            edge. Each page states its own and names the other, so neither reads as the both. */}
        <a href="/schedule" style={{ color: "var(--term-blue-text)", fontWeight: 600 }}>
          Schedule Edge →
        </a>
      </p>
      {most && least ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {most.abbreviation} FLEW THE MOST AT {most.travelMiles.toLocaleString()} MILES ·{" "}
          {least.abbreviation} THE LEAST AT {least.travelMiles.toLocaleString()}
        </p>
      ) : null}
      {/* Full for the same reason as the conversion table above: one row per team, the page's
          column is the measure. The zero-rest player list below stays numeric — a compact
          lookup, not a league table. */}
      <DataTable
        width="full"
        minWidth={520}
        rows={byMiles}
        rowKey={(t) => t.teamId}
        rowAttrs={() => ({ "data-testid": "schedule-tax-row" })}
        columns={[
          { label: "TEAM", cell: (t) => t.abbreviation },
          { label: "MILES FLOWN", numeric: true, cell: (t) => t.travelMiles.toLocaleString() },
          { label: "BACK-TO-BACKS", unit: "GAMES", numeric: true, cell: (t) => t.backToBacks },
          { label: "3-IN-4", unit: "GAMES", numeric: true, cell: (t) => t.threeInFours },
          { label: "JET LAG", unit: "GAMES", numeric: true, cell: (t) => t.jetLagGames },
        ]}
      />
    </div>
  )
}

/** The league's fatigue curve across the season, in seven-day buckets from the first game. */
/**
 * A section that cannot be filled until games are played.
 *
 * Rendered instead of the section, never as an empty version of it: a win-rate table with zeros
 * in it is a claim that the rested team won none of its games, and a 0.0 swing is a claim that
 * rest made no difference. Neither has been measured. The same distinction the Games board
 * draws between an em dash and a zero, at section scale.
 */
function AwaitingGames({
  label,
  descriptor,
  needs,
  testId,
}: {
  label: string
  descriptor: string
  needs: string
  testId?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label={label} descriptor={descriptor} testId={testId} />
      <div className="mono px-6 py-8 text-center" style={termDashedEmptyStyle}>
        <p style={{ fontSize: TYPE.label, fontWeight: 600, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}>
          AWAITING GAMES
        </p>
        <p
          className="sans mx-auto mt-2"
          style={{
            fontSize: TYPE.body,
            color: "var(--term-text-muted)",
            lineHeight: LEAD.body,
            maxWidth: WIDTH.prose,
          }}
        >
          {needs}
        </p>
      </div>
    </div>
  )
}

function FatigueCalendar({ weeks }: { weeks: SeasonReportWeek[] }) {
  const peak = weeks.reduce<SeasonReportWeek | null>(
    (best, w) => (best === null || w.avgFatigue > best.avgFatigue ? w : best),
    null
  )

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="FATIGUE CALENDAR" descriptor="LEAGUE AVERAGE BY WEEK" />
      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
        Average fatigue across every team in every game, week by week. The season is not evenly
        hard — density, travel and back-to-backs pile up in stretches.
      </p>
      {peak ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          PEAK: WEEK {peak.week} OF {weeks.length}, FROM {peak.startDate}, AT {peak.avgFatigue.toFixed(2)}
        </p>
      ) : null}
      <div data-testid="fatigue-calendar" style={{ ...termCardStyle, height: 220, padding: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              width={32}
            />
            <Bar dataKey="avgFatigue" fill="var(--term-hardwood)" maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SeasonReportContent() {
  const [season, setSeason] = useState(LATEST_SEASON)

  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  // The all-season baseline. Season-independent, so it does not refetch when the
  // selector moves.
  const { data: analysis, loading: normLoading } = useBacktest()

  const norm = useMemo(
    () => (analysis ? allSeasonNormExcluding(analysis.seasonWinRates, season) : null),
    [analysis, season]
  )

  // Held back while the baseline request is in flight: a pending norm and a missing norm
  // are both `null`, and passing the pending one through flashed "ALL-SEASON NORM
  // UNAVAILABLE" on every load — a claim about the data that was really a claim about the
  // network. The line renders nothing until the verdict is actually known; if the request
  // fails, `loading` settles false with no payload and `noNorm` shows for real.
  const verdict = useMemo(
    () => (data && !normLoading ? seasonReportVerdict(data.overall, norm) : null),
    [data, norm, normLoading]
  )

  const abbrById = useMemo(
    () => new Map((data?.teams ?? []).map((t) => [t.teamId, t.abbreviation])),
    [data]
  )

  if (error) {
    return <MessageCard tone="error" title="FAILED TO LOAD THE SEASON REPORT." />
  }

  return (
    // The wide track (1040), the same cap /availability and /playoffs already run at. Uncapped,
    // this page's dividers and call rows spanned the full 1280 while its content-sized tables
    // stopped near 600, leaving half the container empty on every wide screen — the imbalance
    // was between blocks on the SAME page, not between the page and the viewport (2026-08-23).
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      <div style={{ ...termCardStyle, padding: 16 }}>
        {/* The browsable list, so a released-but-unplayed season can be chosen. The initial
            value stays the newest season WITH data: this page's results half is its point, and
            opening on a season that has none would bury a complete report behind a choice. */}
        <SeasonSelector
          id="season-report-season"
          season={season}
          onSeasonChange={setSeason}
          seasons={browsableSeasons()}
        />
      </div>

      <AbnormalSeasonNote season={season} />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-[92px] w-full bg-[var(--term-surface-2)]"
              style={{ borderRadius: "var(--term-radius)" }}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {/* Both rates are records. Before a ball is thrown up there is no record, and a
                RateTile reading 0.0% over 0 games states one. */}
            {data.basis === "schedule" ? (
              <>
                <StatTile label="RESTED TEAM AT HOME · WIN RATE" value="—" sub="AWAITING GAMES" />
                <StatTile label="WIN RATE · RA ≥ 2" value="—" sub="AWAITING GAMES" />
              </>
            ) : (
              <>
                <RateTile label="RESTED TEAM AT HOME · WIN RATE" rate={data.overall} testId="season-rest-win-rate" />
                <RateTile label="WIN RATE · RA ≥ 2" rate={data.atLeastTwo} />
              </>
            )}
            <StatTile
              label="SEASON PROGRESS"
              value={`${data.completedGames.toLocaleString()} / ${data.scheduledGames.toLocaleString()}`}
              sub={
                data.scheduledGames === 0
                  ? "NO GAMES SCHEDULED"
                  : `${Math.round((data.completedGames / data.scheduledGames) * 100)}% PLAYED`
              }
            />
          </div>

          {data.basis === "schedule" ? (
            <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
              No {data.season} game has been played. What the schedule hands each team is already
              decided, so the sections below that read the calendar are complete; the ones that
              read a scoreboard stay empty until games are played rather than showing a zero.{" "}
              <a href="/analysis" style={{ color: "var(--term-blue-text)", fontWeight: 600 }}>
                See the full backtest →
              </a>
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <SectionDivider
                label={`${data.season} VS HISTORY`}
                descriptor="EXCLUDES THE DISPLAYED SEASON"
                testId="season-vs-history-heading"
              />
              {verdict ? <VerdictLine verdict={verdict} /> : null}
              <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose, lineHeight: LEAD.body }}>
                {countedGamesSentence(data.overall)}{" "}
                <a href="/analysis" style={{ color: "var(--term-blue-text)", fontWeight: 600 }}>
                  See the full backtest →
                </a>
              </p>
            </div>
          )}

          {/* Before the conversion table on purpose: this section carries the scale a reader
              needs before any per-team rest number can be read at its true size.
              Schedule-derived throughout, so it renders on either basis. */}
          <ScheduleValue teams={data.teams} />

          {data.basis === "schedule" ? (
            <AwaitingGames
              label="REST EDGE CONVERSION"
              descriptor="RECORDS, NOT A RANKING"
              needs="A team's record as the rested side is a result. Nothing here can be filled until games are played."
            />
          ) : (
            <EdgeConversion teams={data.teams} swingBaseline={data.swingBaseline} />
          )}

          {data.basis === "schedule" ? (
            <AwaitingGames
              label="LOUDEST CALLS"
              descriptor="RANKED BY REST GAP"
              needs="The season's widest rest gaps are already known, but whether the rested team won them is not."
            />
          ) : (
            <LoudestCalls calls={data.loudestCalls} abbrById={abbrById} />
          )}

          {/* Travel, back-to-backs and 3-in-4s are properties of the calendar. */}
          <ScheduleTax teams={data.teams} basis={data.basis} />

          {data.basis === "schedule" ? (
            <AwaitingGames
              label="FATIGUE CALENDAR"
              descriptor="LEAGUE AVERAGE BY WEEK"
              needs="The weekly curve is a record of how heavy the season was. A projected tail on the same axis would read as measurement."
            />
          ) : (
            <FatigueCalendar weeks={data.weeks} />
          )}

          {data.basis === "schedule" ? (
            <AwaitingGames
              label="ZERO-REST WORKLOAD"
              descriptor="VOLUME, NOT EFFECT"
              needs="Minutes played on zero days' rest are counted from box scores, which do not exist yet."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <SectionDivider label="ZERO-REST WORKLOAD" descriptor="VOLUME, NOT EFFECT" />
              <ZeroRestWorkload season={data.season} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
