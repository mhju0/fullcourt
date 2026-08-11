"use client"

import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import { ChevronDown } from "lucide-react"
import { FatigueBar, type FatigueBarTone } from "@/components/fatigue-bar"
import {
  ConfidenceBadge,
  FatigueDetailColumn,
  TeamLogo,
  teamGameFlags,
  getConfidence,
} from "@/components/matchup-parts"
import { getTeamColors } from "@/lib/nba-team-colors"
import {
  buildRestAdvantageEvidence,
  formatRestAdvantageDisplay,
  type RestAdvantageEvidenceSource,
} from "@/lib/rest-advantage-display"
import { getTeamBranding } from "@/lib/team-history"
import { SPACE, SPACE_CARD } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"
import type { GameResponse } from "@/types"

/**
 * The Front Office table spine (docs/design/mocks/08-front-office.html, adopted
 * 2026-08-09): the slate as one continuous grid-table — rows, not cards — with
 * inline fatigue bars, a center-anchored REST ADVANTAGE meter, and the evidence
 * sentence as a quiet sub-row. Each game still expands in place to the same
 * two-column fatigue detail the cards used.
 *
 * A grid of divs rather than a <table> for the same reason the cards were divs:
 * every game is one interactive row-group (main row + sub-row + expansion) whose
 * pieces span and collapse, which table semantics fight. The Explore table on
 * /analysis keeps real <table> markup — its rows are plain data.
 *
 * The whole strip scrolls in its own overflow-x container below the grid's
 * min-width, which is the app-wide rule for wide data (see docs/FRONTEND.md,
 * "Small screens") — the page itself never scrolls sideways.
 */

// Column template shared by the header row and every game row, so the header can
// never drift out of line with the cells beneath it.
const GRID_COLS =
  "minmax(96px,120px) minmax(210px,1.3fr) minmax(232px,1.1fr) minmax(190px,220px) minmax(118px,132px)"
// Raised from 880 with the fatigue column, which now carries each team's schedule flags beside
// its score. Sum of the column minimums plus four 16px gaps is 900, so this clears it.
const GRID_MIN_WIDTH = 920

/**
 * Width reserved for a line's flag chips, so the strip is identical on every line and the
 * fatigue numbers stay in one column however many flags a team carries.
 *
 * Sized for the widest thing it can hold: two four-character chips plus a `+N` overflow chip
 * and their gaps (~98px). A single "JET LAG" is wider than one 4-char chip but never shares
 * the strip — it sorts fifth, so it only ever appears alone or beside "ALT".
 */
const FLAG_STRIP_W = 104

// ─── Status cell ─────────────────────────────────────────────────

function StatusCell({
  status,
  date,
  homeScore,
  awayScore,
}: {
  status: string
  date: string
  homeScore: number | null
  awayScore: number | null
}) {
  const hasScore = homeScore !== null && awayScore !== null

  return (
    <div className="mono flex flex-col justify-center gap-1">
      {status === "live" ? (
        <span
          className="inline-flex items-center gap-2"
          style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-accent)", fontWeight: 700 }}
        >
          <span
            className="animate-[pulse_1.7s_ease-in-out_infinite]"
            style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--term-accent)" }}
          />
          LIVE
        </span>
      ) : (
        <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
          {status === "final" ? "FINAL" : "UPCOMING"}
        </span>
      )}
      {hasScore ? (
        <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--term-text)", lineHeight: 1 }}>
          {awayScore} – {homeScore}
        </span>
      ) : (
        <span className="tabular-nums" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {date}
        </span>
      )}
    </div>
  )
}

// ─── Matchup + fatigue cells (two aligned 26px lines each) ───────

const TEAM_LINE_H = 26

function TeamLine({
  abbreviation,
  name,
  city,
  season,
  fallback,
  isHome,
}: {
  abbreviation: string
  name: string
  city: string
  season: string
  fallback: { name: string; city: string }
  isHome: boolean
}) {
  const colors = getTeamColors(abbreviation)
  return (
    <div className="flex min-w-0 items-center gap-2" style={{ height: TEAM_LINE_H }}>
      <TeamLogo abbreviation={abbreviation} season={season} fallback={fallback} size={20} color={colors.primary} />
      <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: "var(--term-text)" }}>
        {name}
      </span>
      <span className="hidden truncate lg:inline" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
        {city}
      </span>
      {isHome && (
        <span
          className="mono shrink-0"
          style={{
            fontSize: 9,
            letterSpacing: "0.06em",
            fontWeight: 600,
            color: "var(--term-text-muted)",
            border: "1px solid var(--term-border)",
            borderRadius: "var(--term-radius-sm)",
            padding: "0 4px",
            lineHeight: "14px",
          }}
        >
          HOME
        </span>
      )}
    </div>
  )
}

/**
 * How many flags a line shows before collapsing the rest into a count. Measured over 79 games
 * across ten dates: 84% of team-lines carry two or fewer, but a visiting team can stack five
 * (B2B + 3IN4 + 4IN6 + ALT + JET LAG). Rendering all of them would either blow the column or
 * wrap the row to a second line, and a row whose height depends on its flag count is the
 * problem this replaced.
 */
const MAX_INLINE_FLAGS = 2

/** The schedule flag chip — the fatigue score's reason, sitting next to the score. */
function FlagChip({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className="mono shrink-0"
      style={{
        fontSize: 9,
        letterSpacing: "0.06em",
        fontWeight: 600,
        color: "var(--term-text-muted)",
        border: `1px solid var(--term-${muted ? "surface-2" : "border"})`,
        borderRadius: "var(--term-radius-sm)",
        padding: "0 4px",
        lineHeight: "14px",
      }}
    >
      {label}
    </span>
  )
}

function FatigueLine({
  score,
  tone,
  flags,
}: {
  score: number | null
  tone: FatigueBarTone
  flags: string[]
}) {
  const shown = flags.slice(0, MAX_INLINE_FLAGS)
  const hidden = flags.length - shown.length

  return (
    <div className="flex items-center gap-2" style={{ height: TEAM_LINE_H }}>
      {score !== null ? (
        <FatigueBar score={score} tone={tone} className="min-w-[36px] flex-1" />
      ) : (
        <div className="min-w-[36px] flex-1" style={{ height: 4, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }} />
      )}
      <span className="mono shrink-0 tabular-nums" style={{ width: 30, fontSize: 13, fontWeight: 700, color: "var(--term-text)", textAlign: "right" }}>
        {score !== null ? score.toFixed(1) : "—"}
      </span>
      {/* Fixed-width so the two lines' chips align with each other and with the rows above and
          below, whether a team carries two flags, one, or none. Chips start from the strip's
          left edge rather than filling from its right: a list that grows rightward keeps its
          first item on one rail, so a team with one flag lines up with the first flag of the
          team above it instead of with that team's second. */}
      <span className="flex shrink-0 items-center justify-start gap-1" style={{ width: FLAG_STRIP_W }}>
        {shown.map((flag) => (
          <FlagChip key={flag} label={flag} />
        ))}
        {hidden > 0 && <FlagChip label={`+${hidden}`} muted />}
      </span>
    </div>
  )
}

/** Which team's fatigue reads "higher" (more tired, rose) vs "lower" (teal). */
function fatigueTones(
  awayScore: number | null,
  homeScore: number | null
): { away: FatigueBarTone; home: FatigueBarTone } {
  if (awayScore !== null && homeScore !== null) {
    if (awayScore > homeScore) return { away: "higher", home: "lower" }
    if (homeScore > awayScore) return { away: "lower", home: "higher" }
  }
  return { away: "neutral", home: "neutral" }
}

// ─── Rest-advantage cell ─────────────────────────────────────────

function RestAdvCell({
  restAdvantage,
  homeAbbr,
  awayAbbr,
}: {
  restAdvantage: GameResponse["restAdvantage"]
  homeAbbr: string
  awayAbbr: string
}) {
  const display = formatRestAdvantageDisplay(restAdvantage, homeAbbr, awayAbbr)
  const advantageTeam = restAdvantage?.advantageTeam ?? "neutral"
  const isHomeAdv = advantageTeam === "home"
  const isAwayAdv = advantageTeam === "away"
  const value = Math.abs(restAdvantage?.differential ?? 0).toFixed(1)
  const fillPercent = Math.min(Math.abs(restAdvantage?.differential ?? 0) / 5, 1) * 50

  return (
    <div className="flex flex-col justify-center gap-2">
      <div className="mono flex items-baseline gap-2 tabular-nums" style={{ lineHeight: 1 }}>
        {display.kind === "team" ? (
          <>
            {/* The named team is the more-rested side, so it wears the rested pole. */}
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", color: "var(--term-blue)" }}>
              {display.teamAbbreviation}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--term-text)" }}>
              {display.value}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--term-text-muted)" }}>
              EVEN
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--term-text-muted)" }}>
              {value}
            </span>
          </>
        )}
      </div>

      {/* Center-anchored differential meter: teal fill toward the rested side, ±5 scale. */}
      <div className="flex w-full items-center gap-2">
        <span className="mono shrink-0" style={{ fontSize: 9, color: "var(--term-text-muted)", fontWeight: 600 }}>
          A
        </span>
        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{ height: 8, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-sm)" }}
          aria-hidden
        >
          {advantageTeam === "neutral" ? (
            <span style={{ position: "absolute", left: "47.5%", top: 0, bottom: 0, width: "5%", background: "var(--term-hairline)" }} />
          ) : (
            <span
              style={{
                position: "absolute",
                left: isHomeAdv ? "50%" : undefined,
                right: isAwayAdv ? "50%" : undefined,
                top: 0,
                bottom: 0,
                width: `${fillPercent}%`,
                background: "var(--term-blue)",
              }}
            />
          )}
          <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--term-hairline)" }} />
        </div>
        <span className="mono shrink-0" style={{ fontSize: 9, color: "var(--term-text-muted)", fontWeight: 600 }}>
          H
        </span>
      </div>
    </div>
  )
}

// ─── One game: main row + evidence sub-row + expansion ───────────

function GameRow({
  game,
  index,
  isScoreFlashing,
  evidenceSource,
}: {
  game: GameResponse
  index: number
  isScoreFlashing: boolean
  evidenceSource: RestAdvantageEvidenceSource | null
}) {
  const [expanded, setExpanded] = useState(false)

  const homeFallback = useMemo(
    () => ({ name: game.homeTeam.name, city: game.homeTeam.city }),
    [game.homeTeam.name, game.homeTeam.city]
  )
  const awayFallback = useMemo(
    () => ({ name: game.awayTeam.name, city: game.awayTeam.city }),
    [game.awayTeam.name, game.awayTeam.city]
  )
  const homeBrand = getTeamBranding(game.homeTeam.abbreviation, game.season, homeFallback)
  const awayBrand = getTeamBranding(game.awayTeam.abbreviation, game.season, awayFallback)

  const confidence = getConfidence(game.restAdvantage?.differential ?? null)
  const evidence = useMemo(
    () => buildRestAdvantageEvidence(game.restAdvantage, evidenceSource),
    [game.restAdvantage, evidenceSource]
  )
  const flags = teamGameFlags(game)
  const tones = fatigueTones(game.awayFatigue?.score ?? null, game.homeFatigue?.score ?? null)
  const isLive = game.status === "live"

  const toggle = useCallback(() => setExpanded((e) => !e), [])
  const onKeyDown = useCallback(
    (ev: KeyboardEvent<HTMLDivElement>) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault()
        toggle()
      }
    },
    [toggle]
  )

  return (
    <div
      className="animate-[fadeInUp_0.4s_ease-out_forwards]"
      style={{
        animationDelay: `${index * 30}ms`,
        borderTop: index === 0 ? undefined : "1px solid var(--term-border)",
        // One accent at a time (Front Office): only HIGH CONF earns the indigo edge,
        // and a live game gets a whisper of the same tint so the eye finds it.
        borderLeft: confidence === "high" ? "3px solid var(--term-accent)" : "3px solid transparent",
        background: isLive
          ? "color-mix(in srgb, var(--term-accent) 3%, var(--term-surface))"
          : undefined,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse game details" : "Expand game details"}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cn(
          "grid cursor-pointer items-center gap-x-4 transition-colors hover:bg-[var(--term-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]/40",
          isScoreFlashing && "animate-[scoreFlash_0.5s_ease-out]"
        )}
        style={{ gridTemplateColumns: GRID_COLS, padding: "12px 16px" }}
      >
        <StatusCell status={game.status} date={game.date} homeScore={game.homeScore} awayScore={game.awayScore} />

        <div className="flex min-w-0 flex-col gap-1">
          <TeamLine
            abbreviation={awayBrand.abbreviation}
            name={awayBrand.name}
            city={awayBrand.city ?? game.awayTeam.city}
            season={game.season}
            fallback={awayFallback}
            isHome={false}
          />
          <TeamLine
            abbreviation={homeBrand.abbreviation}
            name={homeBrand.name}
            city={homeBrand.city ?? game.homeTeam.city}
            season={game.season}
            fallback={homeFallback}
            isHome
          />
        </div>

        <div className="flex flex-col gap-1">
          <FatigueLine score={game.awayFatigue?.score ?? null} tone={tones.away} flags={flags.away} />
          <FatigueLine score={game.homeFatigue?.score ?? null} tone={tones.home} flags={flags.home} />
        </div>

        <RestAdvCell
          restAdvantage={game.restAdvantage}
          homeAbbr={homeBrand.abbreviation}
          awayAbbr={awayBrand.abbreviation}
        />

        <div className="flex items-center justify-end gap-2">
          <ConfidenceBadge confidence={confidence} />
          <ChevronDown
            className={cn("size-4 shrink-0 text-[var(--term-text-muted)] transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </div>
      </div>

      {/* Expanded detail — the evidence sentence, then the two-column fatigue breakdown.
          The sentence was an always-on tinted sub-row until 2026-08-11, and it moved in here for
          two reasons. The visible one: it renders only above the 0.5 call threshold, so a slate
          gets a grey band under some rows and not others, and the ragged stripe read as damage
          rather than as a signal. The load-bearing one: the sentence is not about the game. It
          names the historical CLASS the matchup falls into, so a slate holds at most a couple of
          distinct strings — on the 15-game date this was re-cut against, four rows carried a band
          and three of them were byte-identical. Repeating a class-level fact once per row asserts
          it is per-game, which is the one thing it is not.
          It leads the expansion rather than trailing it because the click it answers came from the
          REST ADVANTAGE cell: "is 1.1 a lot?" is the first question, the fatigue components are
          the second. Nothing replaces it on the collapsed row — the RA figure and the confidence
          badge already carry that far, and the home page's thesis band states the headline rate
          against its baseline before the slate begins. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div
            style={{
              background: "var(--term-bg)",
              borderTop: "1px solid var(--term-border)",
              // The row's own 16px rail, not the 12px this block used to inset by: the detail
              // cards now start on the same vertical line as the status cell above them.
              padding: `${SPACE.md}px ${SPACE_CARD}px`,
            }}
          >
            {evidence && (
              <p
                className="m-0"
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: "var(--term-text-muted)",
                  paddingBottom: SPACE.md,
                  marginBottom: SPACE.md,
                  borderBottom: "1px solid var(--term-border)",
                }}
              >
                {evidence.sentence}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FatigueDetailColumn label={`AWAY · ${awayBrand.abbreviation}`} fatigue={game.awayFatigue} />
              <FatigueDetailColumn label={`HOME · ${homeBrand.abbreviation}`} fatigue={game.homeFatigue} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── The table ───────────────────────────────────────────────────

export interface MatchupTableProps {
  games: readonly (GameResponse & { isScoreFlashing?: boolean })[]
  evidenceSource?: RestAdvantageEvidenceSource | null
}

export function MatchupTable({ games, evidenceSource = null }: MatchupTableProps) {
  return (
    <div
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderRadius: "var(--term-radius)",
        overflow: "hidden",
      }}
    >
      <div className="overflow-x-auto">
        <div style={{ minWidth: GRID_MIN_WIDTH }}>
          {/* Column header — same template as the rows, so it cannot drift. */}
          <div
            className="mono grid items-center gap-x-4"
            style={{
              gridTemplateColumns: GRID_COLS,
              padding: "8px 16px",
              background: "var(--term-surface-2)",
              borderBottom: "1px solid var(--term-border)",
              fontSize: 10,
              letterSpacing: "0.08em",
              fontWeight: 700,
              color: "var(--term-text-muted)",
            }}
          >
            <span>GAME</span>
            <span>MATCHUP · AWAY / HOME</span>
            <span>FATIGUE · 0–10</span>
            <span>REST ADVANTAGE</span>
            <span className="text-right">CONF</span>
          </div>

          {games.map((game, i) => (
            <GameRow
              key={game.id}
              game={game}
              index={i}
              isScoreFlashing={game.isScoreFlashing ?? false}
              evidenceSource={evidenceSource ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
