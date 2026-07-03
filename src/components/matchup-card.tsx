"use client"

import { useCallback, useMemo, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import { FatigueBar, type FatigueBarTone } from "@/components/fatigue-bar"
import { TRAVEL_LOOKBACK_DAYS } from "@/lib/fatigue"
import { NBA_TEAM_IDS } from "@/lib/nba-team-ids"
import { formatRestAdvantageDisplay } from "@/lib/rest-advantage-display"
import { getTeamBranding } from "@/lib/team-history"
import { cn } from "@/lib/utils"
import type { FatigueInfo, GameResponse } from "@/types"

// ─── Constants ───────────────────────────────────────────────────

const HIGH_CONF_THRESHOLD = 2.0
const MED_CONF_THRESHOLD = 1.0

type Confidence = "high" | "med" | "neutral" | "none"

function getConfidence(diff: number | null | undefined): Confidence {
  if (diff === null || diff === undefined) return "none"
  const abs = Math.abs(diff)
  if (abs >= HIGH_CONF_THRESHOLD) return "high"
  if (abs >= MED_CONF_THRESHOLD) return "med"
  return "neutral"
}

function confidenceAccent(c: Confidence): string {
  if (c === "high") return "var(--term-red)"
  if (c === "med") return "var(--term-blue)"
  if (c === "neutral") return "var(--term-hardwood)"
  return "#888888"
}

// ─── Team logo ───────────────────────────────────────────────────

function TeamLogo({
  abbreviation,
  season,
  fallback,
  size = 24,
}: {
  abbreviation: string
  season?: string
  fallback?: { name: string; city: string }
  size?: number
}) {
  const [error, setError] = useState(false)

  const logoUrl =
    season !== undefined
      ? getTeamBranding(abbreviation, season, fallback).logoUrl
      : (() => {
          const nbaId = NBA_TEAM_IDS[abbreviation]
          return nbaId
            ? `https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`
            : null
        })()

  if (!logoUrl || error) {
    return (
      <div
        className="mono flex shrink-0 items-center justify-center bg-[var(--term-surface-2)] text-[9px] font-bold text-slate-500"
        style={{ width: size, height: size, borderRadius: "var(--term-radius-sm)" }}
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

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === "none") return null

  const label = confidence === "high" ? "HIGH CONF" : confidence === "med" ? "MED CONF" : "NEUTRAL"

  const baseStyle: React.CSSProperties = {
    fontSize: "10px",
    letterSpacing: "0.06em",
    padding: "2px 8px",
    borderRadius: "var(--term-radius-sm)",
    fontWeight: 700,
  }

  if (confidence === "high") {
    return (
      <span className="mono inline-flex items-center" style={{ ...baseStyle, background: "var(--term-red)", color: "var(--term-surface)" }}>
        {label}
      </span>
    )
  }
  if (confidence === "med") {
    return (
      <span className="mono inline-flex items-center" style={{ ...baseStyle, background: "var(--term-blue)", color: "var(--term-surface)" }}>
        {label}
      </span>
    )
  }
  return (
    <span
      className="mono inline-flex items-center"
      style={{ ...baseStyle, background: "transparent", border: "1px solid #888", color: "var(--term-text-muted)" }}
    >
      {label}
    </span>
  )
}

// ─── Score display (kept for live/final game status) ─────────────

function LiveIndicator() {
  return (
    <span className="mono inline-flex items-center gap-1.5" style={{ fontSize: "10px", letterSpacing: "0.06em", color: "var(--term-red)", fontWeight: 700 }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--term-red)" }} />
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
      <div className="mono flex items-center gap-3" style={{ fontSize: "11px" }}>
        <LiveIndicator />
        {homeScore !== null && awayScore !== null && (
          <span className="tabular-nums" style={{ color: "var(--term-text)", fontWeight: 700 }}>
            {awayScore} – {homeScore}
          </span>
        )}
      </div>
    )
  }

  if (status === "final" && awayScore !== null && homeScore !== null) {
    return (
      <div className="mono flex items-center gap-3" style={{ fontSize: "11px" }}>
        <span style={{ color: "var(--term-text-muted)", letterSpacing: "0.08em" }}>FINAL</span>
        <span className="tabular-nums" style={{ color: "var(--term-text)", fontWeight: 700 }}>
          {awayScore} – {homeScore}
        </span>
      </div>
    )
  }

  if (status === "final") {
    return (
      <span className="mono" style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
        FINAL
      </span>
    )
  }

  return (
    <span className="mono" style={{ fontSize: "10px", letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
      UPCOMING
    </span>
  )
}

// ─── Team block ──────────────────────────────────────────────────

function TeamBlock({
  abbreviation,
  city,
  season,
  fallback,
  align = "left",
}: {
  abbreviation: string
  city: string
  season: string
  fallback: { name: string; city: string }
  align?: "left" | "right"
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <TeamLogo abbreviation={abbreviation} season={season} fallback={fallback} size={24} />
      <div className="flex min-w-0 flex-col">
        <span className="mono" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
          {abbreviation}
        </span>
        <span
          className="truncate"
          style={{ fontSize: "12px", fontWeight: 500, color: "var(--term-text)", lineHeight: 1.2 }}
        >
          {city}
        </span>
      </div>
    </div>
  )
}

// ─── Center fatigue bars ─────────────────────────────────────────

function FatigueBarRow({
  abbr,
  score,
  tone,
}: {
  abbr: string
  score: number | null
  tone: FatigueBarTone
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono shrink-0 tabular-nums" style={{ width: 28, fontSize: "10px", color: "var(--term-text-muted)", fontWeight: 600 }}>
        {abbr}
      </span>
      {score !== null ? (
        <FatigueBar score={score} tone={tone} className="flex-1" />
      ) : (
        <div className="flex-1" style={{ height: 4, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }} />
      )}
      <span className="mono shrink-0 tabular-nums" style={{ width: 28, fontSize: "10px", color: "var(--term-text)", fontWeight: 600, textAlign: "right" }}>
        {score !== null ? score.toFixed(1) : "—"}
      </span>
    </div>
  )
}

function FatigueBarsBlock({
  awayAbbr,
  homeAbbr,
  awayScore,
  homeScore,
}: {
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
}) {
  let awayTone: FatigueBarTone = "neutral"
  let homeTone: FatigueBarTone = "neutral"
  if (awayScore !== null && homeScore !== null) {
    if (awayScore > homeScore) {
      awayTone = "higher"
      homeTone = "lower"
    } else if (homeScore > awayScore) {
      homeTone = "higher"
      awayTone = "lower"
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FatigueBarRow abbr={awayAbbr} score={awayScore} tone={awayTone} />
      <FatigueBarRow abbr={homeAbbr} score={homeScore} tone={homeTone} />
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
  const color = isHomeAdv ? "var(--term-blue)" : isAwayAdv ? "var(--term-red)" : "var(--term-text-muted)"

  return (
    <div className="flex w-[180px] shrink-0 flex-col items-center gap-2 pl-4 sm:w-[200px]" style={{ borderLeft: "1px solid var(--term-border)" }}>
      <span className="mono" style={{ fontSize: "9px", letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
        REST ADVANTAGE
      </span>

      <div className="mono flex items-baseline justify-center gap-1 tabular-nums" style={{ lineHeight: 1 }}>
        {display.kind === "team" ? (
          <>
            <span style={{ fontSize: "20px", fontWeight: 700, color }}>
              {display.teamAbbreviation}
            </span>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--term-text)" }}>
              {display.value}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--term-text-muted)" }}>
              EVEN
            </span>
            <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--term-text-muted)" }}>
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
        <div className="mono flex items-center justify-between" style={{ fontSize: "9px", color: "var(--term-text-muted)", fontWeight: 600 }}>
          <span>{awayAbbr}</span>
          <span>{homeAbbr}</span>
        </div>
      </div>

      <ConfidenceBadge confidence={confidence} />
    </div>
  )
}

// ─── Metadata strip ──────────────────────────────────────────────

function MetaStrip({ game }: { game: GameResponse }) {
  const items: string[] = []

  // Game date (no time field on GameResponse — show ISO date in mono).
  items.push(game.date)

  const flags: string[] = []
  if (game.awayFatigue?.isBackToBack) flags.push("AWAY B2B")
  if (game.homeFatigue?.isBackToBack) flags.push("HOME B2B")
  if (game.awayFatigue?.is3In4) flags.push("AWAY 3IN4")
  if (game.homeFatigue?.is3In4) flags.push("HOME 3IN4")
  if (game.awayFatigue?.is4In6) flags.push("AWAY 4IN6")
  if (game.homeFatigue?.is4In6) flags.push("HOME 4IN6")
  if (game.awayFatigue?.altitudePenalty) flags.push("ALT")
  if (game.awayFatigue?.hasCoastToCoastRoadSwing) flags.push("COAST")
  if (game.awayFatigue?.isOvertimePenalty || game.homeFatigue?.isOvertimePenalty) flags.push("OT")

  return (
    <div
      className="mono flex flex-wrap items-center gap-x-2 gap-y-1"
      style={{
        background: "var(--term-bg)",
        borderTop: "1px solid var(--term-border)",
        padding: "4px 14px",
        fontSize: "10px",
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
      style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--term-red)" : "#17A34A" }}
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
    <div className="mono flex justify-between gap-2" style={{ fontSize: 11 }}>
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
        style={{ fontSize: 11, color: "var(--term-text-muted)", background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
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
        className="mono pb-1.5"
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--term-text-muted)",
          fontWeight: 700,
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        {label.toUpperCase()}
      </p>

      <FatigueDetailRow k="GP (30D / 7D)" v={`${fatigue.gamesInLast30Days} / ${fatigue.gamesInLast7Days}`} />
      <FatigueDetailRow k="BACK-TO-BACK" v={<PenaltyMark active={fatigue.isBackToBack} />} />
      <FatigueDetailRow k="3 IN 4" v={<PenaltyMark active={fatigue.is3In4} />} />
      <FatigueDetailRow k="4 IN 6" v={<PenaltyMark active={fatigue.is4In6} />} />
      <FatigueDetailRow
        k="ROAD STREAK"
        v={fatigue.roadTripConsecutiveAway === 0 ? "—" : `×${fatigue.roadTripConsecutiveAway}`}
      />
      <FatigueDetailRow
        k={`TRAVEL ${TRAVEL_LOOKBACK_DAYS}D (MI)`}
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
      <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.08em" }}>
        NO DATA
      </span>
    )
  }
  if (restAdvantage.advantageTeam === "neutral") {
    return (
      <span
        className="mono inline-flex items-center"
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          padding: "2px 7px",
          borderRadius: "var(--term-radius-sm)",
          border: "1px solid #888",
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
        fontSize: 9,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: "var(--term-radius-sm)",
        background: isHomeAdv ? "var(--term-blue)" : "var(--term-red)",
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
}

export function MatchupCard({ game, index = 0, isScoreFlashing = false }: MatchupCardProps) {
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
      className="animate-[fadeInUp_0.4s_ease-out_forwards] flex flex-col"
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
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#17408B]/40",
          isScoreFlashing && "animate-[scoreFlash_0.5s_ease-out]"
        )}
        style={{ padding: "10px 14px" }}
      >
        {/* Status line (live/final/upcoming) */}
        <div className="mb-2 flex items-center justify-between">
          <GameStatusRow status={game.status} homeScore={game.homeScore} awayScore={game.awayScore} />
          <ChevronDown
            className={cn("size-4 text-[var(--term-text-muted)] transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </div>

        {/* Main row: away | bars | home | RA */}
        <div className="flex items-center gap-4">
          <div className="w-[110px] shrink-0">
            <TeamBlock
              abbreviation={awayBrand.abbreviation}
              city={awayBrand.city ?? game.awayTeam.city}
              season={game.season}
              fallback={awayFallback}
              align="left"
            />
          </div>

          <div className="min-w-0 flex-1">
            <FatigueBarsBlock
              awayAbbr={awayBrand.abbreviation}
              homeAbbr={homeBrand.abbreviation}
              awayScore={game.awayFatigue?.score ?? null}
              homeScore={game.homeFatigue?.score ?? null}
            />
          </div>

          <div className="w-[110px] shrink-0">
            <TeamBlock
              abbreviation={homeBrand.abbreviation}
              city={homeBrand.city ?? game.homeTeam.city}
              season={game.season}
              fallback={homeFallback}
              align="right"
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
