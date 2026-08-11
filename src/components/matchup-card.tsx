"use client"

import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import { FatigueBar, type FatigueBarTone } from "@/components/fatigue-bar"
import { TRAVEL_LOOKBACK_DAYS } from "@/lib/fatigue"
import { getTeamColors, readableTextOn } from "@/lib/nba-team-colors"
import {
  buildRestAdvantageEvidence,
  formatRestAdvantageDisplay,
  type RestAdvantageEvidenceSource,
} from "@/lib/rest-advantage-display"
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence"
import { getTeamBranding, teamLogoUrl } from "@/lib/team-history"
import { TERM_ACCENT } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"
import type { FatigueInfo, GameResponse } from "@/types"

// ─── Constants ───────────────────────────────────────────────────

const HIGH_CONF_THRESHOLD = 2.0
const MED_CONF_THRESHOLD = 1.0

export type Confidence = "high" | "med" | "low" | "neutral" | "none"

/**
 * Confidence tiers sit ABOVE the canonical call threshold, never straddling it.
 * `classifyRestAdvantage` calls a game for a team at |differential| >= 0.5, so a
 * gap of e.g. 0.7 makes RestAdvPanel print "BOS 0.7"; tiering that as "neutral"
 * made the same panel name a team and declare the matchup neutral at once. Anything
 * the classifier calls is at least "low" — see the invariant test in __tests__.
 */
export function getConfidence(diff: number | null | undefined): Confidence {
  if (diff === null || diff === undefined) return "none"
  const abs = Math.abs(diff)
  if (abs >= HIGH_CONF_THRESHOLD) return "high"
  if (abs >= MED_CONF_THRESHOLD) return "med"
  if (abs >= NEUTRAL_REST_ADVANTAGE_THRESHOLD) return "low"
  return "neutral"
}

function confidenceAccent(c: Confidence): string {
  // Front Office decouples confidence from the data poles: the poles (rose/teal) say
  // WHO is rested; confidence is chrome emphasis, so HIGH takes the indigo accent and
  // everything below it stays quiet. Magnitude is carried by the badge text as before.
  if (c === "high") return TERM_ACCENT.accent
  return TERM_ACCENT.neutral
}

// ─── Team logo ───────────────────────────────────────────────────

export function TeamLogo({
  abbreviation,
  season,
  fallback,
  size = 24,
  color,
}: {
  abbreviation: string
  season?: string
  fallback?: { name: string; city: string }
  size?: number
  color?: string
}) {
  const [error, setError] = useState(false)

  const logoUrl =
    season !== undefined
      ? getTeamBranding(abbreviation, season, fallback).logoUrl
      : teamLogoUrl(abbreviation)

  if (error) {
    // Team-colored fallback chip (broadcast identity when the logo host is unreachable
    // or has no asset for this abbreviation — several defunct-team slugs 404).
    return (
      <div
        className="mono flex shrink-0 items-center justify-center text-[10px] font-bold"
        style={{
          width: size,
          height: size,
          borderRadius: "var(--term-radius-sm)",
          background: color ?? "var(--term-surface-2)",
          color: color ? readableTextOn(color) : "var(--term-text)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
        }}
      >
        {abbreviation}
      </div>
    )
  }

  return (
    <Image
      src={logoUrl}
      alt={`${abbreviation} logo`}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}

// ─── Confidence badge ────────────────────────────────────────────

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === "none") return null

  const label =
    confidence === "high"
      ? "HIGH CONF"
      : confidence === "med"
        ? "MED CONF"
        : confidence === "low"
          ? "LOW CONF"
          : "NEUTRAL"

  const baseStyle: React.CSSProperties = {
    fontSize: "11px",
    letterSpacing: "0.06em",
    padding: "4px 8px",
    borderRadius: "var(--term-radius-sm)",
    fontWeight: 700,
  }

  // The confidence ladder is loudness, not hue (Front Office): filled accent, then an
  // ink outline, then a hairline outline. The data poles never appear here — a rose
  // HIGH CONF badge beside a rose fatigue bar read as "fatigued wins", which is backwards.
  if (confidence === "high") {
    return (
      <span className="mono inline-flex items-center" style={{ ...baseStyle, background: "var(--term-accent)", color: "var(--term-surface)" }}>
        {label}
      </span>
    )
  }
  if (confidence === "med") {
    return (
      <span
        className="mono inline-flex items-center"
        style={{ ...baseStyle, background: "transparent", border: "1px solid var(--term-text-dim)", color: "var(--term-text-dim)" }}
      >
        {label}
      </span>
    )
  }
  return (
    <span
      className="mono inline-flex items-center"
      style={{ ...baseStyle, background: "transparent", border: "1px solid var(--term-neutral)", color: "var(--term-text-muted)" }}
    >
      {label}
    </span>
  )
}

// ─── Score display (kept for live/final game status) ─────────────

function LiveIndicator() {
  return (
    <span className="mono inline-flex items-center gap-2" style={{ fontSize: "11px", letterSpacing: "0.06em", color: "var(--term-amber)", fontWeight: 700 }}>
      <span
        className="animate-[pulse_1.7s_ease-in-out_infinite]"
        style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--term-amber)", boxShadow: "0 0 8px var(--term-amber)" }}
      />
      LIVE
    </span>
  )
}

export function GameStatusRow({
  status,
  homeScore,
  awayScore,
}: {
  status: string
  homeScore: number | null
  awayScore: number | null
}) {
  if (status === "live") {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "12px" }}>
        <LiveIndicator />
        {homeScore !== null && awayScore !== null && (
          <span className="tabular-nums" style={{ fontSize: "22px", letterSpacing: "-0.02em", color: "var(--term-text)", fontWeight: 800 }}>
            {awayScore} – {homeScore}
          </span>
        )}
      </div>
    )
  }

  if (status === "final" && awayScore !== null && homeScore !== null) {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "12px" }}>
        <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.08em" }}>FINAL</span>
        <span className="tabular-nums" style={{ fontSize: "22px", letterSpacing: "-0.02em", color: "var(--term-text)", fontWeight: 800 }}>
          {awayScore} – {homeScore}
        </span>
      </div>
    )
  }

  if (status === "final") {
    return (
      <span className="mono" style={{ fontSize: "11px", letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
        FINAL
      </span>
    )
  }

  return (
    <span className="mono" style={{ fontSize: "11px", letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
      UPCOMING
    </span>
  )
}

// ─── Team stat row (identity + fatigue bar + value, grouped) ─────

/** Which team's fatigue reads "higher" (more tired, red) vs "lower" (blue). */
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

/** One team on its own line: logo · tricode/city · fatigue bar · fatigue value. */
function TeamStatRow({
  abbreviation,
  name,
  city,
  season,
  fallback,
  score,
  tone,
}: {
  abbreviation: string
  name: string
  city: string
  season: string
  fallback: { name: string; city: string }
  score: number | null
  tone: FatigueBarTone
}) {
  const colors = getTeamColors(abbreviation)
  return (
    <div className="flex items-center gap-4">
      <TeamLogo abbreviation={abbreviation} season={season} fallback={fallback} size={30} color={colors.primary} />
      <div className="flex w-[140px] shrink-0 flex-col gap-1">
        <span
          className="mono truncate"
          style={{ fontSize: "16px", letterSpacing: "-0.01em", color: "var(--term-text)", fontWeight: 800, lineHeight: 1.05 }}
        >
          {name}
        </span>
        <span className="truncate" style={{ fontSize: "12px", fontWeight: 500, color: "var(--term-text-muted)", lineHeight: 1.2 }}>
          {city}
        </span>
      </div>
      {score !== null ? (
        <FatigueBar score={score} tone={tone} className="flex-1" />
      ) : (
        <div className="flex-1" style={{ height: 4, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }} />
      )}
      <span className="mono shrink-0 tabular-nums" style={{ width: 40, fontSize: "16px", color: "var(--term-text)", fontWeight: 800, textAlign: "right", lineHeight: 1 }}>
        {score !== null ? score.toFixed(1) : "—"}
      </span>
    </div>
  )
}

// ─── Rest-advantage panel (right side) ───────────────────────────

function RestAdvPanel({
  restAdvantage,
  confidence,
  homeAbbr,
  awayAbbr,
}: {
  restAdvantage: GameResponse["restAdvantage"]
  confidence: Confidence
  homeAbbr: string
  awayAbbr: string
}) {
  const display = formatRestAdvantageDisplay(restAdvantage, homeAbbr, awayAbbr)
  const advantageTeam = restAdvantage?.advantageTeam ?? "neutral"
  const isHomeAdv = advantageTeam === "home"
  const isAwayAdv = advantageTeam === "away"
  const value = Math.abs(restAdvantage?.differential ?? 0).toFixed(1)
  const fillPercent = Math.min(Math.abs(restAdvantage?.differential ?? 0) / 5, 1) * 50
  // The advantaged team IS the more-rested team, so the fill is always the rested pole;
  // which side it extends toward carries home/away. Painting the away side in the
  // fatigued hue said "rested team, fatigued color" — backwards under two-pole semantics.
  const color = advantageTeam === "neutral" ? "var(--term-text-muted)" : "var(--term-blue)"

  return (
    <div className="flex w-[180px] shrink-0 flex-col items-center gap-2 pl-4 sm:w-[200px]" style={{ borderLeft: "1px solid var(--term-border)" }}>
      <span className="mono" style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
        REST ADVANTAGE
      </span>

      <div className="mono flex items-baseline justify-center gap-2 tabular-nums" style={{ lineHeight: 1 }}>
        {display.kind === "team" ? (
          <>
            <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.02em", color }}>
              {display.teamAbbreviation}
            </span>
            <span style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--term-text)" }}>
              {display.value}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.04em", color: "var(--term-text-muted)" }}>
              EVEN
            </span>
            <span style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--term-text-muted)" }}>
              {value}
            </span>
          </>
        )}
      </div>

      <div className="flex w-full flex-col gap-1">
        <div
          className="relative w-full overflow-hidden"
          style={{ height: 14, background: "var(--term-border)", borderRadius: "var(--term-radius-sm)" }}
          aria-hidden
        >
          {advantageTeam === "neutral" ? (
            <span
              style={{
                position: "absolute",
                left: "47.5%",
                top: 0,
                bottom: 0,
                width: "5%",
                background: "var(--term-hairline)",
              }}
            />
          ) : (
            <span
              style={{
                position: "absolute",
                left: isHomeAdv ? "50%" : undefined,
                right: isAwayAdv ? "50%" : undefined,
                top: 0,
                bottom: 0,
                width: `${fillPercent}%`,
                background: color,
              }}
            />
          )}
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--term-hairline)",
            }}
          />
        </div>
        <div className="mono flex items-center justify-between" style={{ fontSize: "10px", color: "var(--term-text-muted)", fontWeight: 600 }}>
          <span>{awayAbbr}</span>
          <span>{homeAbbr}</span>
        </div>
      </div>

      <ConfidenceBadge confidence={confidence} />
    </div>
  )
}

// ─── Metadata strip ──────────────────────────────────────────────

/** The schedule-condition chips a game carries. One list, shared by the card strip and the table sub-row. */
export function gameFlags(game: GameResponse): string[] {
  const flags: string[] = []
  if (game.awayFatigue?.isBackToBack) flags.push("AWAY B2B")
  if (game.homeFatigue?.isBackToBack) flags.push("HOME B2B")
  if (game.awayFatigue?.is3In4) flags.push("AWAY 3IN4")
  if (game.homeFatigue?.is3In4) flags.push("HOME 3IN4")
  if (game.awayFatigue?.is4In6) flags.push("AWAY 4IN6")
  if (game.homeFatigue?.is4In6) flags.push("HOME 4IN6")
  if (game.awayFatigue?.altitudePenalty) flags.push("ALT")
  if (game.awayFatigue?.hasTimeZoneDisplacement) flags.push("JET LAG")
  if (game.awayFatigue?.isOvertimePenalty || game.homeFatigue?.isOvertimePenalty) flags.push("OT")
  return flags
}

function MetaStrip({ game }: { game: GameResponse }) {
  // Game date (no time field on GameResponse — show ISO date in mono).
  const items: string[] = [game.date]
  const flags = gameFlags(game)

  return (
    <div
      className="mono flex flex-wrap items-center gap-x-2 gap-y-1"
      style={{
        background: "var(--term-bg)",
        borderTop: "1px solid var(--term-border)",
        padding: "4px 16px",
        fontSize: "11px",
        color: "var(--term-text-muted)",
        letterSpacing: "0.04em",
      }}
    >
      {[...items, ...flags].map((item, i, arr) => (
        <span key={i} className="inline-flex items-center gap-2">
          <span>{item}</span>
          {i < arr.length - 1 && <span style={{ color: "var(--term-hairline)" }}>·</span>}
        </span>
      ))}
    </div>
  )
}

// ─── Expanded detail (kept, restyled) ────────────────────────────

function PenaltyMark({ active }: { active: boolean }) {
  return (
    <span
      className="mono tabular-nums"
      style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--term-red)" : "var(--term-pos)" }}
      aria-label={active ? "Yes" : "No"}
    >
      {active ? "Y" : "N"}
    </span>
  )
}

function FatigueDetailRow({
  k,
  v,
  highlight,
}: {
  k: string
  v: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className="mono flex justify-between gap-2" style={{ fontSize: 12 }}>
      <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>{k}</span>
      <span className="tabular-nums" style={{ color: highlight ? "var(--term-red)" : "var(--term-text)", fontWeight: 600 }}>
        {v}
      </span>
    </div>
  )
}

export function FatigueDetailColumn({
  label,
  fatigue,
}: {
  label: string
  fatigue: FatigueInfo | null
}) {
  if (!fatigue) {
    return (
      <div
        className="mono px-3 py-3 text-center"
        style={{ fontSize: 12, color: "var(--term-text-muted)", background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
      >
        NO FATIGUE DATA
      </div>
    )
  }

  const travelHigh = fatigue.travelDistanceMiles >= 1000

  return (
    <div
      className="flex flex-col gap-2 px-3 py-3"
      style={{ background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
    >
      <p
        className="mono pb-2"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--term-text-muted)",
          fontWeight: 700,
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        {label.toUpperCase()}
      </p>

      <FatigueDetailRow k="GAMES, LAST 30 / 7 DAYS" v={`${fatigue.gamesInLast30Days} / ${fatigue.gamesInLast7Days}`} />
      <FatigueDetailRow k="BACK-TO-BACK" v={<PenaltyMark active={fatigue.isBackToBack} />} />
      <FatigueDetailRow k="3 IN 4" v={<PenaltyMark active={fatigue.is3In4} />} />
      <FatigueDetailRow k="4 IN 6" v={<PenaltyMark active={fatigue.is4In6} />} />
      <FatigueDetailRow
        k="ROAD STREAK"
        v={fatigue.roadTripConsecutiveAway === 0 ? "—" : `×${fatigue.roadTripConsecutiveAway}`}
      />
      <FatigueDetailRow
        k={`MILES FLOWN, LAST ${TRAVEL_LOOKBACK_DAYS} DAYS`}
        v={Math.round(fatigue.travelDistanceMiles).toLocaleString()}
        highlight={travelHigh}
      />
      <FatigueDetailRow k="DAYS REST" v={fatigue.daysRest === null ? "—" : `${fatigue.daysRest}D`} />
    </div>
  )
}

// Kept for compat — some pages import RaBadge directly. Re-render as the new badge.
export function RaBadge({
  restAdvantage,
  homeAbbr,
  awayAbbr,
}: {
  restAdvantage: GameResponse["restAdvantage"]
  homeAbbr: string
  awayAbbr: string
}) {
  if (!restAdvantage) {
    return (
      <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.08em" }}>
        NO DATA
      </span>
    )
  }
  if (restAdvantage.advantageTeam === "neutral") {
    return (
      <span
        className="mono inline-flex items-center"
        style={{
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          borderRadius: "var(--term-radius-sm)",
          border: "1px solid var(--term-neutral)",
          color: "var(--term-text-muted)",
        }}
      >
        EVEN
      </span>
    )
  }
  const isHomeAdv = restAdvantage.advantageTeam === "home"
  const abbr = isHomeAdv ? homeAbbr : awayAbbr
  const diff = Math.abs(restAdvantage.differential).toFixed(1)
  return (
    <span
      className="mono inline-flex items-center"
      style={{
        fontSize: 10,
        letterSpacing: "0.06em",
        padding: "4px 8px",
        borderRadius: "var(--term-radius-sm)",
        // Always the rested pole: the named team is the more-rested side, whichever side it is.
        background: "var(--term-blue)",
        color: "var(--term-surface)",
        fontWeight: 700,
      }}
    >
      {abbr} {diff} RA
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────

interface MatchupCardProps {
  game: GameResponse
  index?: number
  isScoreFlashing?: boolean
  /**
   * Backtest slice used to give the rest-advantage number its historical hit rate and
   * sample size. Omitted (or still loading) simply hides the evidence line — the card
   * never asserts a rate it cannot also denominate.
   */
  evidenceSource?: RestAdvantageEvidenceSource | null
}

export function MatchupCard({
  game,
  index = 0,
  isScoreFlashing = false,
  evidenceSource = null,
}: MatchupCardProps) {
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

  const diff = game.restAdvantage?.differential ?? null
  const confidence = getConfidence(diff)
  const accent = confidenceAccent(confidence)
  const evidence = useMemo(
    () => buildRestAdvantageEvidence(game.restAdvantage, evidenceSource),
    [game.restAdvantage, evidenceSource]
  )

  const tones = fatigueTones(game.awayFatigue?.score ?? null, game.homeFatigue?.score ?? null)

  const toggle = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

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
      // The staggered entry and hover shadow were already here; the 2px lift is new.
      // No hover border-color: the border below is an inline style, which beats any
      // non-important class rule, so such a hover would silently do nothing.
      // `motion-reduce` cancels the transform for the same reason globals.css
      // neutralises the fadeInUp keyframe.
      className="animate-[fadeInUp_0.4s_ease-out_forwards] flex flex-col transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-20px_rgba(0,0,0,0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        animationDelay: `${index * 40}ms`,
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderLeft: `2px solid ${accent}`,
        borderRadius: "var(--term-radius)",
        overflow: "hidden",
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
          "cursor-pointer transition-colors hover:bg-[var(--term-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--term-accent)]/40",
          isScoreFlashing && "animate-[scoreFlash_0.5s_ease-out]"
        )}
        style={{ padding: 16 }}
      >
        {/* Status line (live/final/upcoming) */}
        <div className="mb-3 flex items-center justify-between">
          <GameStatusRow status={game.status} homeScore={game.homeScore} awayScore={game.awayScore} />
          <ChevronDown
            className={cn("size-4 text-[var(--term-text-muted)] transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </div>

        {/* Main row: two stacked team rows (identity + fatigue) | RA verdict */}
        <div className="flex items-stretch gap-4">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <TeamStatRow
              abbreviation={awayBrand.abbreviation}
              name={awayBrand.name}
              city={awayBrand.city ?? game.awayTeam.city}
              season={game.season}
              fallback={awayFallback}
              score={game.awayFatigue?.score ?? null}
              tone={tones.away}
            />
            <TeamStatRow
              abbreviation={homeBrand.abbreviation}
              name={homeBrand.name}
              city={homeBrand.city ?? game.homeTeam.city}
              season={game.season}
              fallback={homeFallback}
              score={game.homeFatigue?.score ?? null}
              tone={tones.home}
            />
          </div>

          <RestAdvPanel
            restAdvantage={game.restAdvantage}
            confidence={confidence}
            homeAbbr={homeBrand.abbreviation}
            awayAbbr={awayBrand.abbreviation}
          />
        </div>
      </div>

      {evidence ? (
        <p
          className="px-4 pb-2"
          style={{ fontSize: 12, lineHeight: 1.5, color: "var(--term-text-muted)" }}
        >
          {evidence.sentence}
        </p>
      ) : null}

      <MetaStrip game={game} />

      {/* Expanded detail */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div
            className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2"
            style={{ background: "var(--term-bg)", borderTop: "1px solid var(--term-border)" }}
          >
            <FatigueDetailColumn
              label={`AWAY · ${awayBrand.abbreviation}`}
              fatigue={game.awayFatigue}
            />
            <FatigueDetailColumn
              label={`HOME · ${homeBrand.abbreviation}`}
              fatigue={game.homeFatigue}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
