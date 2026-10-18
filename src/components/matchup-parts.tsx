"use client"

import { useState } from "react"
import Image from "next/image"
import { TRAVEL_LOOKBACK_DAYS } from "@/lib/fatigue"
import { readableTextOn } from "@/lib/nba-team-colors"
import { gapRangeByKey, isCalledSide, winPct } from "@/lib/rest-advantage-evidence"
import { formatRestAdvantageValue } from "@/lib/rest-advantage-display"
import { formatDaysOff } from "@/lib/days-off"
import { getTeamBranding, teamLogoUrl } from "@/lib/team-history"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import type { FatigueInfo, GameResponse, ThresholdBucket } from "@/types"

// ─── Rest edge size ──────────────────────────────────────────────

/**
 * Where the rested home team's record steps up. Over every called game since 1985-86 it won about
 * 60% at any gap from 0.5 to 3, which is home court and nothing more, then about 62% from 3 to 5
 * and about 65% at 5 or more (D-96, D-101). A small gap earns no mark for that reason. Both lines
 * are thresholds the backtest already counts, so the rates the board quotes are published ones.
 * Both read the gap sizes' floors, so the board and every other tab share one definition.
 */
export const MEDIUM_REST_EDGE_THRESHOLD = gapRangeByKey("medium").min
export const LARGE_REST_EDGE_THRESHOLD = gapRangeByKey("large").min

export type RestEdgeSize = "medium" | "large"

/**
 * The size of edge the board marks, or null for none. Only the called side counts
 * (`isCalledSide`): a rested visitor still loses most often at every size, so marking one would
 * put the loudest badge on the row beside a team that usually loses.
 */
export function restEdgeSize(
  restAdvantage: GameResponse["restAdvantage"],
  neutralCity: string | null
): RestEdgeSize | null {
  if (restAdvantage === null || !isCalledSide(restAdvantage.advantageTeam, neutralCity !== null)) return null
  const gap = Math.abs(restAdvantage.differential)
  if (gap >= LARGE_REST_EDGE_THRESHOLD) return "large"
  if (gap >= MEDIUM_REST_EDGE_THRESHOLD) return "medium"
  return null
}

/**
 * Each size's record, from the backtest's cumulative buckets: large is the 5+ bucket as shipped,
 * medium is the 3+ bucket less the 5+ one. Null for a size whose buckets are missing or empty.
 */
export function restEdgeRates(
  thresholds: readonly ThresholdBucket[]
): Record<RestEdgeSize, { games: number; winPct: number } | null> {
  const at = (threshold: number) => thresholds.find((t) => t.threshold === threshold)
  const medium = at(MEDIUM_REST_EDGE_THRESHOLD)
  const large = at(LARGE_REST_EDGE_THRESHOLD)
  const rate = (games: number, wins: number) => (games > 0 ? { games, winPct: winPct(wins, games) } : null)
  return {
    medium: medium && large ? rate(medium.games - large.games, medium.restedTeamWins - large.restedTeamWins) : null,
    large: large ? rate(large.games, large.restedTeamWins) : null,
  }
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

// ─── Rest edge badge ─────────────────────────────────────────────

export const REST_EDGE_LABEL: Record<RestEdgeSize, string> = {
  medium: "MEDIUM REST EDGE",
  large: "LARGE REST EDGE",
}

/** Large is filled and medium is outlined, so the bigger edge reads louder in the same accent. */
export function RestEdgeBadge({ size }: { size: RestEdgeSize }) {
  const large = size === "large"
  return (
    <span
      className="mono inline-flex items-center whitespace-nowrap"
      style={{
        fontSize: "11px",
        letterSpacing: TRACK.data,
        padding: "4px 8px",
        // Inset, so the outline adds no width and both sizes share one box.
        boxShadow: "inset 0 0 0 1px var(--term-accent)",
        borderRadius: "var(--term-radius-sm)",
        fontWeight: 700,
        background: large ? "var(--term-accent)" : "transparent",
        color: large ? "var(--term-surface)" : "var(--term-accent)",
      }}
    >
      {REST_EDGE_LABEL[size]}
    </span>
  )
}

// ─── Score display (kept for live/final game status) ─────────────

function LiveIndicator() {
  return (
    <span className="mono inline-flex items-center gap-2" style={{ fontSize: "11px", letterSpacing: TRACK.data, color: "var(--term-amber)", fontWeight: 700 }}>
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
  if (status === "postponed" || status === "cancelled") {
    return <span className="mono" style={{ fontSize: "11px", letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>{status.toUpperCase()}</span>
  }
  if (status === "live") {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "12px" }}>
        <LiveIndicator />

      </div>
    )
  }

  if (status === "final" && awayScore !== null && homeScore !== null) {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "12px" }}>
        <span style={{ color: "var(--term-text-muted)", letterSpacing: TRACK.label }}>FINAL</span>
        <span className="tabular-nums" style={{ fontSize: TYPE.stat, letterSpacing: TRACK.figure, color: "var(--term-text)", fontWeight: 800 }}>
          {awayScore} – {homeScore}
        </span>
      </div>
    )
  }

  if (status === "final") {
    return (
      <span className="mono" style={{ fontSize: "11px", letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>
        FINAL
      </span>
    )
  }

  // An unplayed game prints no status: the label said nothing the missing score did not.
  return null
}

// ─── Schedule flags ──────────────────────────────────────────────

/**
 * The schedule conditions a game carries, split by the team they describe and with no
 * AWAY/HOME prefix.
 *
 * Every one of these is read off one team's own fatigue record, so on that team's line the
 * prefix says nothing — and it was roughly half of each chip. A pooled `gameFlags()` used to
 * sit beside this and produce the prefixed single strip the retired card drew; it went with the
 * card on 2026-08-11, along with the strip itself.
 *
 * Every flag is scoped per team, home included. A listed host can carry altitude (a neutral
 * site at elevation) and time zones (a neutral site abroad), so neither is away-only. Overtime is per team rather than one game-level flag: the team that
 * played an OT game yesterday is the one paying for it.
 */
export function teamGameFlags(game: GameResponse): { away: string[]; home: string[] } {
  const away: string[] = []
  const home: string[] = []
  if (game.awayFatigue?.isBackToBack) away.push("B2B")
  if (game.awayFatigue?.is3In4) away.push("3IN4")
  if (game.awayFatigue?.is4In6) away.push("4IN6")
  if (game.awayFatigue?.altitudePenalty) away.push("ALT")
  if (game.awayFatigue?.hasTimeZoneDisplacement) away.push("TIME ZONES")
  if (game.awayFatigue?.isOvertimePenalty) away.push("OT")
  if (game.homeFatigue?.isBackToBack) home.push("B2B")
  if (game.homeFatigue?.is3In4) home.push("3IN4")
  if (game.homeFatigue?.is4In6) home.push("4IN6")
  if (game.homeFatigue?.altitudePenalty) home.push("ALT")
  if (game.homeFatigue?.hasTimeZoneDisplacement) home.push("TIME ZONES")
  if (game.homeFatigue?.isOvertimePenalty) home.push("OT")
  return { away, home }
}

/** What each flag chip means, in the words the board guide prints beside it. */
export const FLAG_MEANINGS: Readonly<Record<string, string>> = Object.freeze({
  B2B: "Played the night before",
  "3IN4": "Third game in four nights",
  "4IN6": "Fourth game in six nights",
  ALT: "Tonight's arena is at altitude",
  "TIME ZONES": "Traveled 2+ time zones from home; the model applies a time-zone adjustment",
  OT: "Last game went to overtime",
})


// ─── Expanded detail (kept, restyled) ────────────────────────────

function PenaltyMark({ active }: { active: boolean }) {
  return (
    <span
      className="mono tabular-nums"
      style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--term-red-text)" : "var(--term-pos)" }}
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
      <span style={{ color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>{k}</span>
      {/* A value never breaks across lines — "15 / 4" split after its slash reads as two
          values. The label keeps its ability to wrap as the narrow-space fallback. */}
      <span
        className="shrink-0 whitespace-nowrap tabular-nums"
        style={{ color: highlight ? "var(--term-red-text)" : "var(--term-text)", fontWeight: 600 }}
      >
        {v}
      </span>
    </div>
  )
}

/**
 * Rendered width of one flag chip at TYPE.micro mono: measured 2026-10-15 in Chrome at
 * 10.0px + 6.6px per character ("B2B" 29.8, "TIME ZONES" 76.0, "+1" 23.2), with a 4px gap.
 */
const FLAG_CHIP_BASE_W = 10
const FLAG_CHIP_CHAR_W = 6.6
const FLAG_CHIP_GAP = 4

function flagChipWidth(label: string): number {
  return FLAG_CHIP_BASE_W + FLAG_CHIP_CHAR_W * label.length
}

/**
 * The flags a line can show inline in a strip `stripWidth` wide, at most `maxInline`, keeping
 * room for the `+N` chip that counts the rest. A fixed count overflowed: two long labels plus
 * "+1" needed about 170px in a 104px strip.
 */
export function inlineFlags(
  flags: string[],
  stripWidth: number,
  maxInline: number
): { shown: string[]; hidden: number } {
  const shown: string[] = []
  let used = 0
  for (const flag of flags) {
    if (shown.length === maxInline) break
    const next = used + (shown.length > 0 ? FLAG_CHIP_GAP : 0) + flagChipWidth(flag)
    const remaining = flags.length - shown.length - 1
    const overflow = remaining > 0 ? FLAG_CHIP_GAP + flagChipWidth(`+${remaining}`) : 0
    if (next + overflow > stripWidth) break
    shown.push(flag)
    used = next
  }
  return { shown, hidden: flags.length - shown.length }
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
          letterSpacing: TRACK.label,
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
      <FatigueDetailRow k="DAYS REST" v={formatDaysOff(fatigue.daysRest)} />
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
      <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.label }}>
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
          letterSpacing: TRACK.data,
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
  const diff = formatRestAdvantageValue(restAdvantage.differential)
  return (
    <span
      className="mono inline-flex items-center"
      style={{
        fontSize: 10,
        letterSpacing: TRACK.data,
        padding: "4px 8px",
        borderRadius: "var(--term-radius-sm)",
        // Always the rested pole: the named team is the more-rested side, whichever side it is.
        // Text grade, not the pole hue: the chip grounds 10px white text, which needs 4.5:1.
        background: "var(--term-blue-text)",
        color: "var(--term-surface)",
        fontWeight: 700,
      }}
    >
      {abbr} {diff} RA
    </span>
  )
}
