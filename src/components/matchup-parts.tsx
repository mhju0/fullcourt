"use client"

import { useState } from "react"
import Image from "next/image"
import { TRAVEL_LOOKBACK_DAYS } from "@/lib/fatigue"
import { readableTextOn } from "@/lib/nba-team-colors"
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence"
import { getTeamBranding, teamLogoUrl } from "@/lib/team-history"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import type { FatigueInfo, GameResponse } from "@/types"

// ─── Constants ───────────────────────────────────────────────────

const HIGH_CONF_THRESHOLD = 2.0
const MED_CONF_THRESHOLD = 1.0

export type Confidence = "high" | "med" | "low" | "neutral" | "none"

/**
 * Confidence tiers sit ABOVE the canonical call threshold, never straddling it.
 * `classifyRestAdvantage` calls a game for a team at |differential| >= 0.5, so a
 * gap of e.g. 0.7 makes the rest-advantage cell print "BOS 0.7"; tiering that as
 * "neutral" made one row name a team and call the matchup neutral at once. Anything
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
    letterSpacing: TRACK.data,
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
  if (status === "live") {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "12px" }}>
        <LiveIndicator />
        {homeScore !== null && awayScore !== null && (
          <span className="tabular-nums" style={{ fontSize: TYPE.stat, letterSpacing: TRACK.figure, color: "var(--term-text)", fontWeight: 800 }}>
            {awayScore} – {homeScore}
          </span>
        )}
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

  return (
    <span className="mono" style={{ fontSize: "11px", letterSpacing: TRACK.label, color: "var(--term-text-muted)" }}>
      UPCOMING
    </span>
  )
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
 * Altitude and jet lag are away-only by construction: they are what the *visiting* team carries
 * into the building. Overtime is scoped per team rather than pooled as one game-level flag — a
 * team that played an OT game yesterday is the one paying for it, and pooling could not say so.
 */
export function teamGameFlags(game: GameResponse): { away: string[]; home: string[] } {
  const away: string[] = []
  const home: string[] = []
  if (game.awayFatigue?.isBackToBack) away.push("B2B")
  if (game.awayFatigue?.is3In4) away.push("3IN4")
  if (game.awayFatigue?.is4In6) away.push("4IN6")
  if (game.awayFatigue?.altitudePenalty) away.push("ALT")
  if (game.awayFatigue?.hasTimeZoneDisplacement) away.push("JET LAG")
  if (game.awayFatigue?.isOvertimePenalty) away.push("OT")
  if (game.homeFatigue?.isBackToBack) home.push("B2B")
  if (game.homeFatigue?.is3In4) home.push("3IN4")
  if (game.homeFatigue?.is4In6) home.push("4IN6")
  if (game.homeFatigue?.isOvertimePenalty) home.push("OT")
  return { away, home }
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
      <span style={{ color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>{k}</span>
      {/* A value never breaks across lines — "15 / 4" split after its slash reads as two
          values. The label keeps its ability to wrap as the narrow-space fallback. */}
      <span
        className="shrink-0 whitespace-nowrap tabular-nums"
        style={{ color: highlight ? "var(--term-red)" : "var(--term-text)", fontWeight: 600 }}
      >
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
  const diff = Math.abs(restAdvantage.differential).toFixed(1)
  return (
    <span
      className="mono inline-flex items-center"
      style={{
        fontSize: 10,
        letterSpacing: TRACK.data,
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
