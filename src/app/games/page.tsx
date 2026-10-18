"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { apiFetcher } from "@/lib/fetcher"
import { formatRestAdvantageValue } from "@/lib/rest-advantage-display"
import type { GameDateCount } from "@/types"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EdgesAhead } from "@/components/edges-ahead"
import { GameSlateRefreshNotice, GameSlateRefreshWarning } from "@/components/game-slate-refresh-notice"
import { MatchupTable } from "@/components/matchup-table"
import { BoardGuide } from "@/components/board-guide"
import { restEdgeSize } from "@/components/matchup-parts"
import { GamesViewTabs } from "@/components/games-view-tabs"
import { PageHeader } from "@/components/page-header"
import { SeasonSelector } from "@/components/season-selector"
import { SummaryLine } from "@/components/summary-line"
import { useGameSlate, type GameSlate } from "@/hooks/useGameSlate"
import { browsableSeasons, currentDisplaySeason, isNbaOffSeason, nextSeasonLabel } from "@/lib/nba-season"
import { MessageCard } from "@/components/ui/message-card"
import { MethodLink } from "@/components/method-link"
import type { SlateDay } from "@/lib/game-slate-machine"
import { LEAD, SPACE, SPACE_CARD, termCardStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────

// Terminal-style flat button: white bg, 1px border, mono uppercase, 4px corners.
const termBtn =
  "fc-control-button mono inline-flex items-center gap-2 bg-[var(--term-surface)] px-3 py-2 text-data uppercase tracking-data text-[var(--term-text-dim)] transition-[background-color,border-color,transform] hover:bg-[var(--term-surface-2)]"
const termBtnStyle: React.CSSProperties = { border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }

// One box for the month and date rows, so their columns line up: OCT sits over the 1st
// chip, APR over the 7th. The date chip sets the size. 15 GMS, its longest count line, is
// 55px wide, so the width is 60px.
const PICKER_BOX = "h-12 w-[3.75rem] shrink-0 justify-center"

/* The site's headline figure used to sit here, between the header and the day's controls. It
   moved out on 2026-08-12 with the front door: `/` now carries the argument, and its evidence
   section states the same finding as a lift against the baseline rather than as a raw rate,
   which is the more honest form. Repeating it here would put a forty-one-season result among
   controls that describe one day's slate. */

/**
 * The three slate measures as one line above the matchups. It answers "is this slate worth
 * reading" before the list, which on an eleven-game slate is three phone screens long (D-78).
 */
function SlateSummaryLine({
  gamesToday,
  avgRestAdv,
  markedEdgeGames,
  className,
}: {
  gamesToday: number | null
  avgRestAdv: string
  markedEdgeGames: string
  className?: string
}) {
  return (
    <SummaryLine
      label="Slate summary"
      testId="slate-summary-line"
      className={cn("grid-cols-3", className)}
      items={[
        { label: "GAMES", value: gamesToday === null ? "—" : String(gamesToday) },
        { label: "AVG REST GAP", value: avgRestAdv },
        { label: "3+ REST EDGES", value: markedEdgeGames, note: "AT HOME" },
      ]}
    />
  )
}

// ─── Control-panel group label ───────────────────────────────────

/**
 * Names one group of controls inside the filter panel. 10px is the micro-label slot. `action`
 * sits at the right end of the label's line, with the same gap above the rule as the label.
 */
function GroupLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      className="mono flex items-center justify-between gap-2 uppercase"
      style={{
        fontSize: 10,
        letterSpacing: TRACK.label,
        fontWeight: 600,
        color: "var(--term-text-muted)",
        paddingBottom: action ? SPACE.sm : 4,
        borderBottom: "1px solid var(--term-surface-2)",
      }}
    >
      {children}
      {action}
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────

/** The matchups heading leads its row: the refresh control beside it is smaller (2026-10-16). */
function SectionDivider({
  label,
  count,
  detail,
}: {
  label: string
  count: number | null
  detail?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <h2 className="m-0" style={{ fontSize: TYPE.emph, fontWeight: 600, color: "var(--term-text)" }}>{label}</h2>
      {detail}
      <span className="mono whitespace-nowrap" style={{ fontSize: TYPE.data, letterSpacing: TRACK.label, fontWeight: 600, color: "var(--term-text-muted)" }}>
        {count === null ? "—" : count} {count === 1 ? "GAME" : "GAMES"}
      </span>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────

function MatchupRowSkeleton() {
  return (
    <div
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        // Matches the resting accent of the card this skeleton stands in for, so the
        // left rule does not change colour when the real data lands.
        borderLeft: "2px solid var(--term-neutral)",
        borderRadius: "var(--term-radius)",
        padding: "12px 16px",
      }}
    >
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-[110px] bg-[var(--term-surface-2)]" />
        <Skeleton className="h-9 flex-1 bg-[var(--term-surface-2)]" />
        <Skeleton className="h-9 w-[110px] bg-[var(--term-surface-2)]" />
        <Skeleton className="h-9 w-16 bg-[var(--term-surface-2)]" />
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <MatchupRowSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Empty / error states ─────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="mono flex flex-col items-center gap-2 px-6 py-12 text-center"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p style={{ fontSize: 12, letterSpacing: TRACK.label, color: "var(--term-text)", fontWeight: 700 }}>
        NO GAMES SCHEDULED
      </p>
      {/* The preposition lives in the label so this reads correctly for a single
          date ("on December 25, 2024") and for a whole season alike. */}
      <p style={{ fontSize: 11, color: "var(--term-text-muted)" }}>NO NBA GAMES {label.toUpperCase()}</p>
    </div>
  )
}

function OffSeasonBanner({ season, finalSlate, onUpcoming, className }: { season: string; finalSlate: boolean; onUpcoming?: () => void; className?: string }) {
  return (
    <div
      className={cn("mono flex flex-wrap items-center justify-between gap-2 px-4 py-3", className)}
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderLeft: "2px solid var(--term-hardwood)",
        borderRadius: "var(--term-radius)",
      }}
    >
      <span style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-text)", fontWeight: 600 }}>
        {season} complete{finalSlate ? " · final games" : ""}
      </span>
      {onUpcoming && <button type="button" onClick={onUpcoming} className="min-h-11 text-left text-xs underline">View {nextSeasonLabel(season)} →</button>}
      <a
        href="/season"
        className="inline-flex min-h-11 items-center hover:underline"
        style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-accent)", fontWeight: 700 }}
      >
        Season report →
      </a>
    </div>
  )
}

// ─── Date picker chip ────────────────────────────────────────────

function DateChip({
  day,
  count,
  selected,
  onClick,
  ariaLabel,
}: {
  day: string
  count: number | null
  selected: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={selected ? "date" : undefined}
      // Colours live in classes, not the style prop: an inline `border`/`background`
      // shorthand outranks any class rule, which silently killed the hover state.
      className={cn(
        // Fixed width, not min-width: the count line varies from "1 GM" to "15 GMS",
        // so a minimum let the wider chips grow and the row came out at three
        // different widths. The month buttons share the box (PICKER_BOX).
        "fc-control-button mono flex flex-col items-center border border-[var(--term-border)] px-0",
        PICKER_BOX,
        // Selected = a solid ink block (the 08-front-office mock's .dchip.on), not the
        // rested-pole teal: teal is a data color, and a chip is chrome.
        selected
          ? "border-[var(--term-text)] bg-[var(--term-text)] text-[var(--term-surface)]"
          : "bg-[var(--term-surface)] text-[var(--term-text)] hover:border-[var(--term-blue)]"
      )}
      style={{ borderRadius: "var(--term-radius)" }}
    >
      <span className="tabular-nums" style={{ fontSize: TYPE.data, fontWeight: 700, lineHeight: LEAD.figure }}>
        {day}
      </span>
      {/* #B7BBC6 is the mock's .dchip.on count line — muted light gray on the ink fill. */}
      <span className="tabular-nums" style={{ fontSize: 10, color: selected ? "#B7BBC6" : "var(--term-text-muted)" }}>
        {count} {count === 1 ? "GM" : "GMS"}
      </span>
    </button>
  )
}

// ─── Phone day cell ──────────────────────────────────────────────

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const

/**
 * One day in the phone's week strip and month grid. Seven share a row with no gap, so each
 * stays a 44px target on a 360px screen; the date chips above cannot, at 60px apiece.
 * Days without games stay pressable, because the day arrows already reach them.
 */
function DayCell({ day, weekday, onClick }: { day: SlateDay; weekday?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={day.ariaLabel}
      aria-current={day.isSelected ? "date" : undefined}
      className={cn(
        "mono -ml-px -mt-px flex min-h-12 min-w-0 flex-col items-center justify-center border border-[var(--term-border)] py-1 transition-[background-color,border-color] active:bg-[var(--term-surface-2)]",
        day.isSelected
          ? "relative border-[var(--term-text)] bg-[var(--term-text)] text-[var(--term-surface)] active:bg-[var(--term-text)]"
          : day.gameCount === 0
            ? "bg-[var(--term-surface-2)] text-[var(--term-text-muted)]"
            : "bg-[var(--term-surface)] text-[var(--term-text)]"
      )}
    >
      {weekday ? <span aria-hidden="true" style={{ fontSize: TYPE.micro, color: day.isSelected ? "#B7BBC6" : "var(--term-text-muted)" }}>{weekday}</span> : null}
      <span className="tabular-nums" style={{ fontSize: TYPE.data, fontWeight: 700, lineHeight: LEAD.figure }}>
        {day.dayOfMonth}
      </span>
      <span className="tabular-nums" style={{ fontSize: TYPE.micro, color: day.isSelected ? "#B7BBC6" : "var(--term-text-muted)" }}>
        {day.gameCount}
      </span>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────


/**
 * The exhaustive switch. Every status must render something, which is what makes
 * the old `errorGames ?? errorDates` fallback unnecessary — and, more to the
 * point, impossible to forget. Adding an eighth status breaks the build here.
 */
function Matchups({
  slate,
}: {
  slate: GameSlate
}) {
  switch (slate.status) {
    case "loadingDays":
    case "loadingSlate":
      return <SkeletonList />

    case "daysError":
    case "slateError":
      return (
        <MessageCard
          tone="error"
          title="FAILED TO LOAD GAMES"
          body={slate.message ?? "Something went wrong"}
          action={
            <button
              type="button"
              onClick={() => slate.send({ type: "RETRY_REQUESTED" })}
              className={cn(termBtn, "active:scale-[0.97]")}
              style={termBtnStyle}
            >
              TRY AGAIN
            </button>
          }
        />
      )

    case "noDays":
      return <EmptyState label={`in the ${slate.season} season`} />

    case "slateEmpty":
      return <EmptyState label={`on ${slate.selectedLabel?.short ?? "this date"}`} />

    case "slateReady":
      // The Front Office table spine: one continuous grid-table for the whole slate
      // (docs/design/mocks/08-front-office.html) instead of a stack of cards.
      return <MatchupTable games={slate.games} />

    default: {
      const exhaustive: never = slate.status
      return exhaustive
    }
  }
}

// The select's one option before mount. This page is prerendered, so anything derived from
// "today" — the season, the selected month, the offseason note — is held back until
// `slate.urlReady`; the served HTML can be weeks older than the visitor's date.
const PENDING_SEASON = [{ value: "", label: "—" }] as const

export default function GamesPage() {
  const offSeasonLabel = currentDisplaySeason()

  // ADR 0010: one date board; EDGES AHEAD finds rest advantages across future dates.

  // Season/month/day browsing, the two fetches and the Realtime overlay all live in
  // the hook; its decisions live in a pure reducer that is unit-tested without a DOM.
  const slate = useGameSlate()
  const showOffSeasonBanner = slate.urlReady && isNbaOffSeason()
  // Phones show one week and keep the month controls behind this toggle (D-78).
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarToggle = useRef<HTMLButtonElement>(null)

  const upcomingSeason = nextSeasonLabel(offSeasonLabel)
  const { data: upcomingDays } = useSWR<GameDateCount[]>(
    showOffSeasonBanner && browsableSeasons().includes(upcomingSeason)
      ? `/api/games/dates?season=${upcomingSeason}` : null,
    apiFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )

  // Summary metrics for the stat row. Page policy, not slate policy — the threshold
  // is this page's editorial call, so it stays here rather than inside the hook.
  //
  // One pass, memoized on the slate: this used to run map + filter + reduce + a second
  // filter on every render — including renders driven by the season selector and
  // the Realtime score overlay, none of which change the answer.
  const { avgRestAdv, markedEdgeGames } = useMemo(() => {
    let sum = 0
    let markedEdges = 0
    let measured = 0
    for (const g of slate.games) {
      if (g.restAdvantage === null) continue
      measured += 1
      const diff = Math.abs(g.restAdvantage.differential)
      // An exact-zero game is a measured gap of 0, so it stays in the average.
      sum += diff
      if (restEdgeSize(g.restAdvantage, g.neutralCity)) markedEdges += 1
    }
    // An em dash, not "0.0" and not "0". A slate whose games carry no fatigue pair — every date
    // of a released-but-unplayed season — has no average to report, and printing zero states a
    // measurement that was never taken. A slate on which every game came out exactly even is
    // different and prints 0.0.
    return {
      avgRestAdv: measured === 0 ? "—" : formatRestAdvantageValue(sum / measured),
      markedEdgeGames: measured === 0 ? "—" : String(markedEdges),
    }
  }, [slate.games])

  return (
    // The compact entry keeps a complete matchup above the mobile dock.
    <div className="flex flex-col gap-2 sm:gap-6">
      <div className="page-intro">
        {/* "Games", and the reasoning is worth keeping because it reversed twice.

            This read "Games" until 2026-08-11, when it became a claim — the largest type on the
            site's *front door* named the format rather than the subject, and a first-time
            visitor read "scores site" and left. That was correct while this page was the front
            door. It no longer is: the thesis moved to `/` on 2026-08-12 and this became an
            interior page reached by clicking the GAMES tab, where naming the format is exactly
            right and a claim in the largest type would leave a reader unsure whether it is the
            page's name or its finding. The claim itself is not lost — it opens the description.

            Not "Today's Matchups" either: the season selector reaches back to 1985-86, so that
            heading was already wrong on any past date, and the UPCOMING view widened it. */}
        <PageHeader
          eyebrow="GAME SLATE · REST ADVANTAGE"
          title="Games"
          description="Compare each team’s schedule. Rest gap is a model-score difference, not a win probability."
        />
        {/* A span, not a div: `.page-intro > div` would stretch it. Phones get it in the tabs row. */}
        <span className="hidden sm:block">
          <MethodLink surfaceHref="/games" />
        </span>
      </div>
      <GamesViewTabs current="/games" />
      <div className="grid items-start gap-8">
      <div className="flex min-w-0 flex-col gap-2 sm:gap-6" data-testid="games-main">
      <section aria-label="Choose a game date" className="flex flex-col gap-2" style={{ ...termCardStyle, padding: SPACE_CARD }}>
        <div className="flex flex-wrap items-end justify-between gap-2">
              <SeasonSelector
                id="nba-season"
                season={slate.urlReady ? slate.season : ""}
                options={slate.urlReady ? undefined : PENDING_SEASON}
                disabled={!slate.urlReady}
                onSeasonChange={(season) => slate.send({ type: "SEASON_SELECTED", season })}
                seasons={browsableSeasons().filter((season) => season !== upcomingSeason || Boolean(upcomingDays?.length) || season === slate.season)}
              />
          <button
            ref={calendarToggle}
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            aria-expanded={calendarOpen}
            aria-controls="games-calendar"
            className={cn(
              termBtn,
              "shrink-0 sm:hidden",
              calendarOpen
                ? "border-[var(--term-text)] bg-[var(--term-text)] text-[var(--term-surface)] hover:bg-[var(--term-text)]"
                : "border-[var(--term-border)] text-[var(--term-text)]"
            )}
            style={{ borderWidth: 1, borderStyle: "solid", borderRadius: "var(--term-radius)" }}
          >
            <CalendarDays aria-hidden="true" className="size-4" />
            Calendar
          </button>
        </div>
        {/* From `sm` up this is the page's month and date rows, always shown. On a phone it is the
            panel the Calendar button opens: the same month buttons, then the month as a grid. */}
        <div id="games-calendar" className={cn(calendarOpen ? "flex" : "hidden", "flex-col gap-2 sm:flex")}>
        <div>
          <GroupLabel>Month</GroupLabel>
          <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Month">
              {slate.months.map(({ value, label, dayCount, isSelected: isSeasonMonth }) => {
                const isSelected = slate.urlReady && isSeasonMonth
                return (
                <button
                  key={value}
                  type="button"
                  onClick={() => slate.send({ type: "MONTH_SELECTED", month: value })}
                  aria-pressed={isSelected}
                  // A season-wide day list means we know which months were never
                  // played (the 1998-99 and 2011-12 lockouts), so these disable
                  // instead of round-tripping to an empty result.
                  disabled={dayCount === 0}
                  className={cn(
                    termBtn,
                    PICKER_BOX,
                    "px-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                    isSelected
                      ? "bg-[var(--term-text)] text-[var(--term-surface)] hover:bg-[var(--term-text)]"
                      : "text-[var(--term-text)]"
                  )}
                  style={{
                    ...termBtnStyle,
                    borderColor: isSelected ? "var(--term-text)" : "var(--term-border)",
                  }}
                >
                  {label.toUpperCase()}
                </button>
                )
              })}
          </div>
        </div>
        {slate.calendar.kind === "loading" ? (
          <Skeleton className="h-48 w-full bg-[var(--term-surface-2)] sm:hidden" style={{ borderRadius: "var(--term-radius)" }} />
        ) : slate.monthGrid.days.length > 0 ? (
          <div className="sm:hidden">
            <GroupLabel>Date · games per day</GroupLabel>
            <div aria-hidden="true" className="mono -mx-2 grid grid-cols-7 pt-2 text-center" style={{ fontSize: TYPE.micro, color: "var(--term-text-muted)" }}>
              {WEEKDAYS.map((letter, i) => <span key={i}>{letter}</span>)}
            </div>
            <div className="-mx-2 grid grid-cols-7 pl-px pt-px" role="group" aria-label="Date">
              {Array.from({ length: slate.monthGrid.leadingBlanks }).map((_, i) => <span key={i} />)}
              {slate.monthGrid.days.map((d) => (
                <DayCell
                  key={d.date}
                  day={d}
                  onClick={() => {
                    slate.send({ type: "DATE_SELECTED", date: d.date })
                    // The panel closes on a pick, which hides the pressed cell; focus goes
                    // back to the button that opened it rather than to the top of the page.
                    setCalendarOpen(false)
                    calendarToggle.current?.focus()
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="hidden sm:block">
          {/* The arrows sit on the label's line, not beside the chips: a full month wraps to as
              many as four rows, and arrows at the row ends were left beside the first one. With no
              date text between them they never move; the date names the Matchups heading instead. */}
          <GroupLabel
            action={
              <span className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => slate.send({ type: "DAY_SHIFTED", delta: -1 })}
                  disabled={!slate.selectedDate}
                  aria-label="Previous day"
                  className="fc-control-button bg-[var(--term-surface)]"
                  style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => slate.send({ type: "DAY_SHIFTED", delta: 1 })}
                  disabled={!slate.selectedDate}
                  aria-label="Next day"
                  className="fc-control-button bg-[var(--term-surface)]"
                  style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
                >
                  <ChevronRight />
                </Button>
              </span>
            }
          >
            Date
          </GroupLabel>
        {slate.calendar.kind === "loading" ? (
          <Skeleton className="mt-2 h-16 w-full max-w-md bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        ) : slate.calendar.kind === "error" ? (
          slate.selectedDate ? null : (
            <p className="mono pt-2" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
              DATES DID NOT LOAD.
            </p>
          )
        ) : slate.calendar.kind === "empty" ? (
          <p className="mono pt-2" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
            NO GAMES IN THIS MONTH.
          </p>
        ) : (
          // Wraps instead of scrolling: a full month is thirty chips, which no screen holds in
          // one row, and a row that scrolls hid most of the month behind a swipe.
          <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Date">
            {slate.days.map((d) => (
              <DateChip
                key={d.date}
                day={d.dayOfMonth}
                count={d.gameCount}
                selected={d.isSelected}
                onClick={() => slate.send({ type: "DATE_SELECTED", date: d.date })}
                ariaLabel={d.ariaLabel}
              />
            ))}
          </div>
        )}

        </div>
        </div>
        {slate.calendar.kind === "error" && slate.selectedDate ? (
          <MessageCard
            tone="error"
            title="FAILED TO LOAD DATES"
            body={slate.calendar.message}
            action={
              <button
                type="button"
                onClick={() => slate.send({ type: "RETRY_REQUESTED" })}
                className={cn(termBtn, "active:scale-[0.97]")}
                style={termBtnStyle}
              >
                RETRY DATES
              </button>
            }
          />
        ) : null}
        {/* The phone's date control: one week, every day a full-size target, no sideways scroll.
            The open calendar already shows this week inside its month, so the strip steps aside. */}
        <div className={cn("sm:hidden", calendarOpen && "hidden")}>
          <GroupLabel>Week · games per day</GroupLabel>
          {slate.calendar.kind === "loading" ? (
            <Skeleton className="mt-2 h-12 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          ) : slate.calendar.kind === "error" ? (
            slate.selectedDate ? null : (
              <p className="mono pt-2" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
                DATES DID NOT LOAD.
              </p>
            )
          ) : slate.week.length === 0 ? (
            <p className="mono pt-2" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
              NO GAMES IN THIS SEASON.
            </p>
          ) : (
            <div className="-mx-2 grid grid-cols-7 pl-px pt-px" role="group" aria-label="Week">
              {slate.week.map((d, i) => (
                <DayCell key={d.date} day={d} weekday={WEEKDAYS[i]} onClick={() => slate.send({ type: "DATE_SELECTED", date: d.date })} />
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:hidden">
          {/* A phone steps by week, since its strip is a week; wider screens step by day from the
              DATE label above. */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => slate.send({ type: "WEEK_SHIFTED", delta: -1 })}
            disabled={!slate.selectedDate}
            aria-label="Previous week"
            className="fc-control-button bg-[var(--term-surface)]"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
          >
            <ChevronLeft />
          </Button>
          <p
            className="mono min-w-0 text-center"
            style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-text)", fontWeight: 600 }}
          >
            {slate.selectedLabel ? `DATE · ${slate.selectedLabel.short.toUpperCase()}` : "PICK A DATE"}
          </p>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => slate.send({ type: "WEEK_SHIFTED", delta: 1 })}
            disabled={!slate.selectedDate}
            aria-label="Next week"
            className="fc-control-button bg-[var(--term-surface)]"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
          >
            <ChevronRight />
          </Button>
          </div>
          {showOffSeasonBanner && slate.season === offSeasonLabel ? (
            <OffSeasonBanner
              season={offSeasonLabel}
              finalSlate={slate.selectedDate === slate.lastDate}
              onUpcoming={upcomingDays?.length ? () => slate.send({ type: "SEASON_SELECTED", season: upcomingSeason }) : undefined}
            />
          ) : null}
      </section>

      <SlateSummaryLine
        gamesToday={slate.status === "slateReady" || slate.status === "slateEmpty" ? slate.games.length : null}
        avgRestAdv={avgRestAdv}
        markedEdgeGames={markedEdgeGames}
        className="grid"
      />

      {/* Matchups section */}
      <div className="flex flex-col gap-2">
        <div data-testid="matchups-heading-controls" className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--term-border)]">
          <SectionDivider
            label="Matchups"
            count={slate.status === "slateReady" || slate.status === "slateEmpty" ? slate.games.length : null}
            detail={
              // Hidden on a phone, whose week row above already names the day; tests read it at
              // every width, so it is one node either way.
              <span
                className="mono hidden truncate sm:inline"
                style={{ fontSize: TYPE.data, letterSpacing: TRACK.label, fontWeight: 600, color: "var(--term-text)" }}
                data-testid="selected-date-display"
              >
                {slate.selectedLabel?.long.toUpperCase() ?? "PICK A DATE"}
              </span>
            }
          />
          <GameSlateRefreshNotice slate={slate} />
        </div>
        <GameSlateRefreshWarning message={slate.refreshMessage} />
        {/* After the list on a phone, so the first game stays above the fold. */}
        <BoardGuide className="max-sm:order-last" />
        <Matchups slate={slate} />
      </div>
      </div>
      <aside aria-label="Upcoming edges" className="flex min-w-0 flex-col gap-6">
        <EdgesAhead onJump={(season, date) => {
          slate.send({ type: "SEASON_SELECTED", season })
          slate.send({ type: "DATE_SELECTED", date })
        }} />
      </aside>
      </div>
    </div>
  )
}
