"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MatchupTable } from "@/components/matchup-table"
import { PageHeader } from "@/components/page-header"
import { SeasonSelector } from "@/components/season-selector"
import { UpcomingContentLazy } from "@/components/upcoming-lazy"
import { useBacktest } from "@/hooks/useBacktest"
import { useGameSlate, type GameSlate } from "@/hooks/useGameSlate"
import { currentDisplaySeason, isNbaOffSeason } from "@/lib/nba-season"
import { MessageCard } from "@/components/ui/message-card"
import { MethodLink } from "@/components/method-link"
import { REST_SPLIT_BASELINE, RESTED_AT_HOME } from "@/lib/rest-split-facts"
import { signedNumber } from "@/lib/signed-number"
import { termCardStyle } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────

const HIGH_CONF_THRESHOLD = 2.0

// Terminal-style flat button: white bg, 1px border, mono uppercase, 4px corners.
const termBtn =
  "mono inline-flex items-center gap-2 bg-[var(--term-surface)] px-3 py-2 text-[12px] uppercase tracking-[0.05em] text-[var(--term-text-dim)] transition-[background-color,border-color,transform] hover:bg-[var(--term-surface-2)]"
const termBtnStyle: React.CSSProperties = { border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }

// ─── Thesis figure ───────────────────────────────────────────────

/**
 * The site's one headline number, stated on the front door.
 *
 * Deliberately NOT a fourth stat tile: the tiles below describe the selected day, and a
 * forty-one-season result sitting in that row would read as another property of today's slate.
 * It is one figure with one sentence, above the day's controls, so the claim lands before the
 * data does.
 *
 * Every figure here is read from `rest-split-facts.ts` rather than typed, which is the rule for
 * anything published (CLAUDE.md). The season span is stated as "since 1985-86" rather than as a
 * count, so it cannot age.
 */
function ThesisFigure() {
  const lift = RESTED_AT_HOME.winPct - REST_SPLIT_BASELINE.homeWinPct
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8" style={termCardStyle}>
      <span
        className="mono tabular-nums shrink-0 whitespace-nowrap"
        style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, color: "var(--term-blue)" }}
      >
        {RESTED_AT_HOME.winPct.toFixed(1)}%
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <span style={{ fontSize: 15, color: "var(--term-text)", fontWeight: 600, lineHeight: 1.45 }}>
          is how often the more-rested team wins when it is also at home.
        </span>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--term-text-muted)", lineHeight: 1.5 }}>
          {RESTED_AT_HOME.games.toLocaleString()} GAMES · {signedNumber(lift, 1)} AGAINST THE{" "}
          {REST_SPLIT_BASELINE.homeWinPct.toFixed(1)}% HOME TEAMS WIN ANYWAY
        </span>
        <MethodLink surfaceHref="/" />
      </div>
    </div>
  )
}

// ─── Stat summary row ────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="mono flex flex-col gap-2"
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        // Top rule, not left: as a left border the tiles read as a list with coloured
        // bullets. Along the top edge they read as a row of measures, which is what they are.
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--term-radius)",
        padding: 16,
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 500 }}>
        {label}
      </span>
      <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--term-text)", lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

/* Three tiles, all of them about the slate on screen. The fourth used to carry the
   all-seasons backtest rate, which described none of these games: the historical claim
   belongs on each matchup card, where it is stated for that game's own rest gap, and
   on /analysis, which exists to prove it. */
function StatSummaryRow({
  gamesToday,
  avgRestAdv,
  highConfGames,
}: {
  gamesToday: number
  avgRestAdv: string
  highConfGames: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {/* Not "TODAY": this is the count for the selected date, and the page deliberately
          auto-selects the most recent date with games whenever today has none. */}
      <StatCard label="GAMES ON THIS DATE" value={String(gamesToday)} accent="var(--term-neutral)" />
      <StatCard label="AVG REST ADV" value={avgRestAdv} accent="var(--term-neutral)" />
      {/* Accent, not a data pole: HIGH CONF is confidence chrome, same as the badge. */}
      <StatCard label="HIGH CONF GAMES" value={String(highConfGames)} accent="var(--term-accent)" />
    </div>
  )
}

// ─── Control-panel group label ───────────────────────────────────

/** Names one group of controls inside the filter panel. 10px is the micro-label slot. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mono uppercase"
      style={{
        fontSize: 10,
        letterSpacing: "0.1em",
        fontWeight: 600,
        color: "var(--term-text-muted)",
        paddingBottom: 8,
        marginBottom: 14,
        borderBottom: "1px solid var(--term-surface-2)",
      }}
    >
      {children}
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="mono flex items-center gap-3 py-2" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      <span style={{ fontWeight: 600 }}>
        {count} {count === 1 ? "GAME" : "GAMES"}
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
      className="mono flex flex-col items-center gap-2 px-6 py-16 text-center"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--term-text)", fontWeight: 700 }}>
        NO GAMES SCHEDULED
      </p>
      {/* The preposition lives in the label so this reads correctly for a single
          date ("on December 25, 2024") and for a whole season alike. */}
      <p style={{ fontSize: 11, color: "var(--term-text-muted)" }}>NO NBA GAMES {label.toUpperCase()}</p>
    </div>
  )
}

function OffSeasonBanner({ season }: { season: string }) {
  return (
    <div
      className="mono flex flex-wrap items-center justify-between gap-2 px-4 py-3"
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderLeft: "2px solid var(--term-hardwood)",
        borderRadius: "var(--term-radius)",
      }}
    >
      <span style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--term-text)", fontWeight: 600 }}>
        {season} SEASON COMPLETE — SHOWING FINAL SLATE
      </span>
      <a
        href="/season"
        className="transition-colors hover:underline"
        style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--term-accent)", fontWeight: 700 }}
      >
        SEE THE FULL SEASON REPORT →
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
  count: number
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
        // different widths. 15 is the most games a 30-team league can play in a day,
        // and that longest line measures 55px, so 60px fits every case with room.
        "mono flex w-[3.75rem] flex-col items-center border border-[var(--term-border)] px-2 py-2 transition-[transform,background-color,border-color] active:scale-[0.97]",
        // Selected = a solid ink block (the 08-front-office mock's .dchip.on), not the
        // rested-pole teal: teal is a data color, and a chip is chrome.
        selected
          ? "border-[var(--term-text)] bg-[var(--term-text)] text-[var(--term-surface)]"
          : "bg-[var(--term-surface)] text-[var(--term-text)] hover:border-[var(--term-blue)]"
      )}
      style={{ borderRadius: "var(--term-radius)" }}
    >
      <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>
        {day}
      </span>
      {/* #B7BBC6 is the mock's .dchip.on count line — muted light gray on the ink fill. */}
      <span className="tabular-nums" style={{ fontSize: 10, color: selected ? "#B7BBC6" : "var(--term-text-muted)" }}>
        {count} {count === 1 ? "GM" : "GMS"}
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
  evidenceSource,
}: {
  slate: GameSlate
  evidenceSource: React.ComponentProps<typeof MatchupTable>["evidenceSource"]
}) {
  switch (slate.status) {
    case "loadingDays":
    case "loadingSlate":
      return <SkeletonList />

    case "daysError":
    case "slateError":
      return <MessageCard tone="error" title="FAILED TO LOAD GAMES" body={slate.message ?? "Something went wrong"} />

    case "noDays":
      return <EmptyState label={`in the ${slate.season} season`} />

    case "slateEmpty":
      return <EmptyState label={`on ${slate.selectedLabel?.short ?? "this date"}`} />

    case "slateReady":
      // The Front Office table spine: one continuous grid-table for the whole slate
      // (docs/design/mocks/08-front-office.html) instead of a stack of cards.
      return <MatchupTable games={slate.games} evidenceSource={evidenceSource} />

    default: {
      const exhaustive: never = slate.status
      return exhaustive
    }
  }
}

export default function HomePage() {
  const showOffSeasonBanner = isNbaOffSeason()
  const offSeasonLabel = currentDisplaySeason()

  // The two views the old /upcoming tab and this page used to split between. Local state,
  // not a query param: the nav no longer links to /upcoming, so the only inbound deep link
  // is an old bookmark, and that redirects here and lands on the date browser.
  const [view, setView] = useState<"date" | "upcoming">("date")

  // Season/month/day browsing, the two fetches and the Realtime overlay all live in
  // the hook; its decisions live in a pure reducer that is unit-tested without a DOM.
  const slate = useGameSlate()

  // The backtest, read only to denominate the matchup cards' evidence sentences.
  // Deliberately outside the slate: it is season-independent and must not gate the
  // date browser.
  const { evidenceSource } = useBacktest()

  // Summary metrics for the stat row. Page policy, not slate policy — the threshold
  // is this page's editorial call, so it stays here rather than inside the hook.
  //
  // One pass, memoized on the slate: this used to run map + filter + reduce + a second
  // filter on every render — including renders driven by `view`, the season selector and
  // the Realtime score overlay, none of which change the answer.
  const { avgRestAdv, highConfGames } = useMemo(() => {
    let sum = 0
    let counted = 0
    let highConf = 0
    for (const g of slate.games) {
      const diff = Math.abs(g.restAdvantage?.differential ?? 0)
      if (diff > 0) {
        sum += diff
        counted += 1
      }
      if (diff >= HIGH_CONF_THRESHOLD) highConf += 1
    }
    return {
      avgRestAdv: counted === 0 ? "0.0" : (sum / counted).toFixed(1),
      highConfGames: highConf,
    }
  }, [slate.games])

  return (
    // gap-12 sets the distance between chapters — heading, controls, results — while
    // elements that belong together carry their own tighter spacing. The previous uniform
    // gap-6 gave a heading the same separation as two halves of one control panel.
    <div className="flex flex-col gap-12">
      {/* Heading + view toggle: one chapter, so they sit close together. */}
      <div className="flex flex-col gap-6">
        {/* The root states the thesis, not the noun.
            This heading read "Games" until 2026-08-11, which is what the tab says and what the
            table below shows — so the largest type on the site's front door named the format
            rather than the subject, and a first-time visitor read "scores site" and left. The
            claim was on the page the whole time, in the 15px description under it; it was
            simply out-ranked by the page's own hierarchy. The slate keeps its own MATCHUPS
            divider, so nothing below loses its label.

            Not "Today's Matchups" either: the season selector reaches back to 1985-86, so that
            heading was already wrong on any past date, and the UPCOMING view widened it. */}
        <PageHeader
          eyebrow="REST ADVANTAGE DASHBOARD"
          title="What the schedule does to a game"
          description="Travel, rest and schedule density, scored for every team in every game, then checked against what actually happened in every season since 1985-86."
        />

        <ThesisFigure />

      {/* View toggle — absorbed the old /upcoming route, which is now a redirect here. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Games view">
        {([
          { id: "date", label: "BY DATE" },
          { id: "upcoming", label: "UPCOMING" },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={cn(
              termBtn,
              "shrink-0 active:scale-[0.97]",
              view === id
                ? "bg-[var(--term-text)] text-[var(--term-surface)] hover:bg-[var(--term-text)]"
                : "text-[var(--term-text)]"
            )}
            style={{
              ...termBtnStyle,
              borderColor: view === id ? "var(--term-text)" : "var(--term-border)",
            }}
          >
            {label}
          </button>
        ))}
        </div>
      </div>

      {view === "upcoming" ? (
        <UpcomingContentLazy />
      ) : (
        <>
          {/* Stat summary row */}
          <StatSummaryRow
            gamesToday={slate.games.length}
            avgRestAdv={avgRestAdv}
            highConfGames={highConfGames}
          />

          {/* Filters — two labelled groups rather than three stacked rows that each
              repeated the same label treatment. Season and month answer one question
              ("which stretch of basketball"), so they share a group. */}
          <div className="flex flex-col gap-[18px]" style={{ ...termCardStyle, padding: 16 }}>
            <div>
              <GroupLabel>Scope</GroupLabel>
              {/* Align to the bottom, not the centre: the season block is label +
                  select stacked, so centring it against 32px-tall month buttons put
                  the select below their midline. Both controls are the same height,
                  so sharing a bottom edge lines their tops up too. */}
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                {/* Matches the month strip's `pb-1` scrollbar clearance. Without it that
                    padding sits inside only one of the two flex items, so aligning their
                    bottoms still left the buttons 4px above the select. */}
                <div className="pb-1">
                  <SeasonSelector
                    id="nba-season"
                    season={slate.season}
                    onSeasonChange={(season) => slate.send({ type: "SEASON_SELECTED", season })}
                  />
                </div>
                <div className="-mx-1 min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
                  <div className="flex min-w-min gap-2 px-1">
                  {slate.months.map(({ value, label, dayCount, isSelected }) => (
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
                        "shrink-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
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
                  ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <GroupLabel>Day</GroupLabel>
            {slate.calendar.kind === "loading" ? (
              <Skeleton className="h-16 w-full max-w-md bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
            ) : slate.calendar.kind === "error" ? (
              <p className="mono" style={{ fontSize: 12, color: "var(--term-red)" }} role="alert">
                {slate.calendar.message}
              </p>
            ) : slate.calendar.kind === "empty" ? (
              <p className="mono" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
                NO GAMES IN THIS MONTH.
              </p>
            ) : (
              // The old "DAYS WITH GAMES" caption is gone: the group is already labelled
              // "Day", and every chip states its own game count.
              <div className="flex flex-wrap gap-2">
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

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => slate.send({ type: "DAY_SHIFTED", delta: -1 })}
                disabled={!slate.selectedDate}
                aria-label="Previous day"
                className="bg-[var(--term-surface)] active:scale-95"
                style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
              >
                <ChevronLeft />
              </Button>
              <p
                className="mono min-w-[12rem] text-center sm:text-left"
                style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--term-text)", fontWeight: 600 }}
                data-testid="selected-date-display"
              >
                {slate.selectedLabel?.long.toUpperCase() ?? "PICK A DATE"}
              </p>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => slate.send({ type: "DAY_SHIFTED", delta: 1 })}
                disabled={!slate.selectedDate}
                aria-label="Next day"
                className="bg-[var(--term-surface)] active:scale-95"
                style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
              >
                <ChevronRight />
              </Button>
              </div>
            </div>
          </div>

          {showOffSeasonBanner && <OffSeasonBanner season={offSeasonLabel} />}

          {/* Matchups section */}
          <div className="flex flex-col gap-2">
            <SectionDivider label="MATCHUPS" count={slate.games.length} />
            <Matchups slate={slate} evidenceSource={evidenceSource} />
          </div>
        </>
      )}
    </div>
  )
}
