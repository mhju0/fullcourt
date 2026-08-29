"use client"

import { useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EdgesAhead } from "@/components/edges-ahead"
import { MatchupTable, type SlateDensity } from "@/components/matchup-table"
import { PageHeader } from "@/components/page-header"
import { SeasonSelector } from "@/components/season-selector"
import { useBacktest } from "@/hooks/useBacktest"
import { useGameSlate, type GameSlate } from "@/hooks/useGameSlate"
import { useSlateDensity } from "@/hooks/useSlateDensity"
import { browsableSeasons, currentDisplaySeason, isNbaOffSeason } from "@/lib/nba-season"
import { MessageCard } from "@/components/ui/message-card"
import { MethodLink } from "@/components/method-link"
import { StatTile } from "@/components/ui/stat-tile"
import { LEAD, SPACE, SPACE_CARD, termCardStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────

const HIGH_CONF_THRESHOLD = 2.0

// Terminal-style flat button: white bg, 1px border, mono uppercase, 4px corners.
const termBtn =
  "mono inline-flex items-center gap-2 bg-[var(--term-surface)] px-3 py-2 text-data uppercase tracking-data text-[var(--term-text-dim)] transition-[background-color,border-color,transform] hover:bg-[var(--term-surface-2)]"
const termBtnStyle: React.CSSProperties = { border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }

/* The site's headline figure used to sit here, between the header and the day's controls. It
   moved out on 2026-08-12 with the front door: `/` now carries the argument, and its evidence
   section states the same finding as a lift against the baseline rather than as a raw rate,
   which is the more honest form. Repeating it here would put a forty-one-season result among
   controls that describe one day's slate. */

// ─── Stat summary row ────────────────────────────────────────────

/* Three tiles, all of them about the slate on screen. The fourth used to carry the
   all-seasons backtest rate, which described none of these games: the historical claim
   belongs in each matchup row, where it is stated for that game's own rest gap, and
   on /analysis, which exists to prove it. */
function StatSummaryRow({
  gamesToday,
  avgRestAdv,
  highConfGames,
}: {
  gamesToday: number
  avgRestAdv: string
  highConfGames: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {/* Not "TODAY": this is the count for the selected date, and the page deliberately
          auto-selects the most recent date with games whenever today has none. */}
      <StatTile label="GAMES ON THIS DATE" value={String(gamesToday)} accent="var(--term-neutral)" />
      <StatTile label="AVG REST ADV" value={avgRestAdv} accent="var(--term-neutral)" />
      {/* Accent, not a data pole: HIGH CONF is confidence chrome, same as the badge. */}
      <StatTile label="HIGH CONF GAMES" value={highConfGames} accent="var(--term-accent)" />
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
        letterSpacing: TRACK.label,
        fontWeight: 600,
        color: "var(--term-text-muted)",
        paddingBottom: SPACE.sm,
        marginBottom: SPACE.lg,
        borderBottom: "1px solid var(--term-surface-2)",
      }}
    >
      {children}
    </div>
  )
}

// ─── Section divider ─────────────────────────────────────────────

function SectionDivider({
  label,
  count,
  action,
}: {
  label: string
  count: number
  action?: React.ReactNode
}) {
  return (
    <div className="mono flex items-center gap-3 py-2" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      {action}
      <span style={{ fontWeight: 600 }}>
        {count} {count === 1 ? "GAME" : "GAMES"}
      </span>
    </div>
  )
}

/**
 * The density dial (C5, 2026-08-28): SKIM is the schedule-site glance and the default;
 * DEEP DIVE adds days rest, the fatigue bars and CONF. It sits on the MATCHUPS divider —
 * a control about the table, on the table's own rail.
 */
function DensityDial({
  density,
  onChange,
}: {
  density: SlateDensity
  onChange: (d: SlateDensity) => void
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Slate density">
      {([
        { id: "skim", label: "SKIM" },
        { id: "deep", label: "DEEP DIVE" },
      ] as const).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={density === id}
          className={cn(
            "mono shrink-0 px-2 py-1 transition-[background-color,border-color,transform] active:scale-[0.97]",
            density === id
              ? "bg-[var(--term-text)] text-[var(--term-surface)]"
              : "bg-[var(--term-surface)] text-[var(--term-text)] hover:bg-[var(--term-surface-2)]"
          )}
          style={{
            fontSize: 10,
            letterSpacing: TRACK.label,
            fontWeight: 700,
            border: `1px solid ${density === id ? "var(--term-text)" : "var(--term-border)"}`,
            borderRadius: "var(--term-radius-sm)",
          }}
        >
          {label}
        </button>
      ))}
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
      <span style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-text)", fontWeight: 600 }}>
        {season} SEASON COMPLETE — SHOWING FINAL SLATE
      </span>
      <a
        href="/season"
        className="transition-colors hover:underline"
        style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-accent)", fontWeight: 700 }}
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

// ─── Page ────────────────────────────────────────────────────────


/**
 * The exhaustive switch. Every status must render something, which is what makes
 * the old `errorGames ?? errorDates` fallback unnecessary — and, more to the
 * point, impossible to forget. Adding an eighth status breaks the build here.
 */
function Matchups({
  slate,
  evidenceSource,
  density,
}: {
  slate: GameSlate
  evidenceSource: React.ComponentProps<typeof MatchupTable>["evidenceSource"]
  density: SlateDensity
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
      return <MatchupTable games={slate.games} evidenceSource={evidenceSource} density={density} />

    default: {
      const exhaustive: never = slate.status
      return exhaustive
    }
  }
}

export default function HomePage() {
  const showOffSeasonBanner = isNbaOffSeason()
  const offSeasonLabel = currentDisplaySeason()

  /* The BY DATE / UPCOMING view toggle died here on 2026-08-29 (redesign stage ②,
     ADR 0010). The honest inventory that killed it: the date chips already reach every
     future date, the upcoming table's edge and historical columns said nothing the RA
     cell and the expansion's evidence sentence do not, and its one real capability —
     cutting across dates by rest advantage — is the EDGES AHEAD strip below. One board,
     one card. The /upcoming redirect still lands here, now on the only view there is. */

  // Season/month/day browsing, the two fetches and the Realtime overlay all live in
  // the hook; its decisions live in a pure reducer that is unit-tested without a DOM.
  const slate = useGameSlate()

  // SKIM or DEEP DIVE — remembered per viewer, addressable via ?view=.
  const [density, setDensity] = useSlateDensity()

  // The backtest, read only to denominate the matchup rows' evidence sentences.
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
    let measured = 0
    for (const g of slate.games) {
      if (g.restAdvantage === null) continue
      measured += 1
      const diff = Math.abs(g.restAdvantage.differential)
      if (diff > 0) {
        sum += diff
        counted += 1
      }
      if (diff >= HIGH_CONF_THRESHOLD) highConf += 1
    }
    // An em dash, not "0.0" and not "0". A slate whose games carry no fatigue pair — every date
    // of a released-but-unplayed season — has no average to report, and printing zero states a
    // measurement that was never taken. `counted === 0` with `measured > 0` is different and
    // still prints 0.0: that is a real slate on which every game came out exactly even.
    return {
      avgRestAdv: measured === 0 ? "—" : counted === 0 ? "0.0" : (sum / counted).toFixed(1),
      highConfGames: measured === 0 ? "—" : String(highConf),
    }
  }, [slate.games])

  return (
    // gap-12 sets the distance between chapters — heading, controls, results — while
    // elements that belong together carry their own tighter spacing. The previous uniform
    // gap-6 gave a heading the same separation as two halves of one control panel.
    <div className="flex flex-col gap-12">
      {/* Heading + view toggle: one chapter, so they sit close together. */}
      <div className="flex flex-col gap-6">
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
          description="What the schedule does to a game. Travel, rest and density, scored for both teams in every matchup and checked against what actually happened since 1985-86."
        />
        <MethodLink surfaceHref="/games" />
      </div>
      {/* Stat summary row */}
      <StatSummaryRow
        gamesToday={slate.games.length}
        avgRestAdv={avgRestAdv}
        highConfGames={highConfGames}
      />

      {/* The cross-date edge question, three rows tall — what survived the UPCOMING
          view's retirement. A click drives the same reducer the date chips do. */}
      <EdgesAhead
        onJump={(season, date) => {
          slate.send({ type: "SEASON_SELECTED", season })
          slate.send({ type: "DATE_SELECTED", date })
        }}
      />

      {/* Filters — two labelled groups rather than three stacked rows that each
          repeated the same label treatment. Season and month answer one question
          ("which stretch of basketball"), so they share a group. */}
      <div className="flex flex-col gap-4" style={{ ...termCardStyle, padding: SPACE_CARD }}>
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
              {/* The browsable list, so a released-but-unplayed schedule is selectable
                  here and not only on Schedule Disparity. `defaultNbaSeason()` already
                  opens the board on it; without this the dropdown could not name it. */}
              <SeasonSelector
                id="nba-season"
                season={slate.season}
                onSeasonChange={(season) => slate.send({ type: "SEASON_SELECTED", season })}
                seasons={browsableSeasons()}
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
          <p className="mono" style={{ fontSize: 12, color: "var(--term-red-text)" }} role="alert">
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
            style={{ fontSize: 12, letterSpacing: TRACK.sub, color: "var(--term-text)", fontWeight: 600 }}
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

      {/* Only over the season it describes. The board now opens on the upcoming season
          once its schedule is released, and this banner sat above that slate announcing
          that a *different* season was complete and that these were its final results. */}
      {showOffSeasonBanner && slate.season === offSeasonLabel && (
        <OffSeasonBanner season={offSeasonLabel} />
      )}

      {/* Matchups section */}
      <div className="flex flex-col gap-2">
        <SectionDivider
          label="MATCHUPS"
          count={slate.games.length}
          action={<DensityDial density={density} onChange={setDensity} />}
        />
        <Matchups slate={slate} evidenceSource={evidenceSource} density={density} />
      </div>
    </div>
  )
}
