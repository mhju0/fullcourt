"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ChevronDown } from "lucide-react"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/fetcher"
import { currentDisplaySeason } from "@/lib/nba-season"
import { termCardStyle } from "@/lib/terminal-styles"
import type { ShotQualityCell, ShotQualityResponse } from "@/types"

// ─── Court geometry ────────────────────────────────────────────────
// The API grid is UNFOLDED, origin = the rim, in 1-ft cells:
//   cellX = floor(LOC_X/10), cellY = floor(LOC_Y/10)   [scripts/aggregate_shot_grid.py]
//   cell center (feet, from rim) = (cellX + 0.5, cellY + 0.5)   [scripts/sq5_write_surface.py]
// The rim sits RIM_Y ft up the court from the baseline, so a cell's court coords are:
//   x_ft (from center, left = −)  = cellX + 0.5
//   court_y (from baseline)       = RIM_Y + cellY + 0.5
// Verified against the season's real zone labels before shipping — every landmark
// (Restricted Area ≤4ft, Corner 3 |x|≈22, Above-the-Break arc ≥23.75, Paint ±8) lands
// where it physically belongs (see the SQ-7 coordinate gate).

const PX = 12 // internal px per foot (viewBox units; the SVG scales to its container)
const COURT_W = 50 // full half-court width, ft (x: −25..+25)
const HALF_LEN = 47 // baseline → half-court line, ft
const PAD = 1 // ft of margin so boundary strokes aren't clipped
const RIM_Y = 5.25 // rim center, ft from baseline

const VB_W = (COURT_W + 2 * PAD) * PX
const VB_H = (HALF_LEN + 2 * PAD) * PX

/** x_ft (center origin, left negative) → viewBox x. */
const sx = (xFt: number): number => (xFt + COURT_W / 2 + PAD) * PX
/** court_y (baseline origin) → viewBox y (baseline at the bottom, half-court at the top). */
const sy = (courtY: number): number => (HALF_LEN + PAD - courtY) * PX

const MARKER_MAX_FT = 1.18
const MARKER_MIN_FT = 0.3

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const clamp01 = (v: number): number => clamp(v, 0, 1)

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  const i = clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1)
  return sorted[i]
}

// ─── Color ramps ───────────────────────────────────────────────────

type RGB = [number, number, number]
function hexToRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r} ${g} ${bl})`
}

const TAN: RGB = hexToRgb("#C4853C") // low expected eFG%
const BLUE: RGB = hexToRgb("#17408B") // high expected eFG% (and "gbm lower" in diff view)
const RED: RGB = hexToRgb("#C9082A") // "gbm higher" in diff view
const NEUTRAL: RGB = hexToRgb("#EFEAE0") // diff ≈ 0

/** Sequential expected-eFG% ramp: low → tan, high → blue. `t` already normalized to [0,1]. */
const seqColor = (t: number): string => mix(TAN, BLUE, clamp01(t))
/** Divergent GBM−baseline ramp: negative → blue, ~0 → neutral, positive → red. `t` in [-1,1]. */
const divColor = (t: number): string =>
  t >= 0 ? mix(NEUTRAL, RED, clamp01(t)) : mix(NEUTRAL, BLUE, clamp01(-t))

// ─── Encoding toggle ───────────────────────────────────────────────

type ColorMode = "value" | "diff"

function EncodingToggle({
  mode,
  onModeChange,
}: {
  mode: ColorMode
  onModeChange: (m: ColorMode) => void
}) {
  const options: { key: ColorMode; label: string }[] = [
    { key: "value", label: "EXPECTED eFG%" },
    { key: "diff", label: "GBM − BASELINE" },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600 }}>
        COLOR ENCODING
      </span>
      <div className="inline-flex" role="group" aria-label="Color encoding">
        {options.map((o, i) => {
          const active = mode === o.key
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onModeChange(o.key)}
              className="mono px-3 py-1.5 transition-colors"
              style={{
                fontSize: 11,
                letterSpacing: "0.05em",
                background: active ? "var(--term-blue)" : "var(--term-surface)",
                color: active ? "var(--term-surface)" : "var(--term-text-dim)",
                border: "1px solid var(--term-border)",
                borderLeft: i === 0 ? "1px solid var(--term-border)" : "none",
                borderTopLeftRadius: i === 0 ? 4 : 0,
                borderBottomLeftRadius: i === 0 ? 4 : 0,
                borderTopRightRadius: i === options.length - 1 ? 4 : 0,
                borderBottomRightRadius: i === options.length - 1 ? 4 : 0,
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Legends ───────────────────────────────────────────────────────

function LegendBar({ gradient, left, mid, right }: { gradient: string; left: string; mid?: string; right: string }) {
  return (
    <div className="flex flex-col gap-1" style={{ maxWidth: 320 }}>
      <div style={{ height: 10, borderRadius: "var(--term-radius-sm)", border: "1px solid var(--term-border)", background: gradient }} />
      <div className="mono flex justify-between" style={{ fontSize: 9, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        <span>{left}</span>
        {mid ? <span>{mid}</span> : null}
        <span>{right}</span>
      </div>
    </div>
  )
}

// ─── Court chrome (lines) ──────────────────────────────────────────

const LINE = "#C0BAAE"
const BOUNDARY = "#A8A296"
const RIM_RED = "var(--term-red)"

/** Samples an arc of `radius` (ft) about court-center (cxFt, cyFt), α ∈ [−aMax, aMax] deg. */
function arcPath(radiusFt: number, cxFt: number, cyFt: number, aMaxDeg: number): string {
  const steps = 48
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((-aMaxDeg + (2 * aMaxDeg * i) / steps) * Math.PI) / 180
    const x = cxFt + radiusFt * Math.sin(a)
    const y = cyFt + radiusFt * Math.cos(a)
    pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
  }
  return `M${pts.join(" L")}`
}

function CourtLines() {
  // 3-pt geometry: corners are straight lines at x = ±22 up to where they meet the
  // 23.75-ft arc centered on the rim; aMax = asin(22 / 23.75).
  const arc3Max = (Math.asin(22 / 23.75) * 180) / Math.PI
  const yArc = RIM_Y + Math.sqrt(23.75 * 23.75 - 22 * 22) // court_y where the corner line meets the arc
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* court boundary (baseline, sidelines, half-court line) */}
      <rect
        x={sx(-25)}
        y={sy(HALF_LEN)}
        width={sx(25) - sx(-25)}
        height={sy(0) - sy(HALF_LEN)}
        stroke={BOUNDARY}
        strokeWidth={1.6}
      />
      {/* paint / lane: 16 ft wide, baseline → free-throw line (19 ft) */}
      <rect
        x={sx(-8)}
        y={sy(19)}
        width={sx(8) - sx(-8)}
        height={sy(0) - sy(19)}
        stroke={LINE}
        strokeWidth={1.3}
      />
      {/* free-throw circle */}
      <circle cx={sx(0)} cy={sy(19)} r={6 * PX} stroke={LINE} strokeWidth={1.3} />
      {/* backboard (4 ft from baseline) + rim */}
      <line x1={sx(-3)} y1={sy(4)} x2={sx(3)} y2={sy(4)} stroke={BOUNDARY} strokeWidth={1.6} />
      <circle cx={sx(0)} cy={sy(RIM_Y)} r={0.75 * PX} stroke={RIM_RED} strokeWidth={1.8} />
      {/* restricted-area arc (4 ft) */}
      <path d={arcPath(4, 0, RIM_Y, 90)} stroke={LINE} strokeWidth={1.1} />
      {/* three-point line: two corner segments + the arc */}
      <line x1={sx(-22)} y1={sy(0)} x2={sx(-22)} y2={sy(yArc)} stroke={LINE} strokeWidth={1.4} />
      <line x1={sx(22)} y1={sy(0)} x2={sx(22)} y2={sy(yArc)} stroke={LINE} strokeWidth={1.4} />
      <path d={arcPath(23.75, 0, RIM_Y, arc3Max)} stroke={LINE} strokeWidth={1.4} />
      {/* center circle (lower half at the half-court line) */}
      <path d={arcPath(6, 0, HALF_LEN, 90)} stroke={LINE} strokeWidth={1.3} />
    </g>
  )
}

// ─── Shot court ────────────────────────────────────────────────────

type Marker = { c: ShotQualityCell; cx: number; cy: number; side: number }

function ShotCourt({
  cells,
  scaleFga,
  getValue,
  getColor,
  formatValue,
  title,
  subtitle,
}: {
  cells: ShotQualityCell[]
  scaleFga: number
  getValue: (c: ShotQualityCell) => number | null
  getColor: (v: number) => string
  formatValue: (v: number) => string
  title: string
  subtitle: string
}) {
  // Geometry only (independent of the color mode) so it memoizes across toggles.
  const markers = useMemo<Marker[]>(() => {
    const arr = cells.map((c) => {
      const xFt = c.cellX + 0.5
      const courtY = RIM_Y + c.cellY + 0.5
      const sideFt = clamp(Math.sqrt(c.fga / scaleFga) * MARKER_MAX_FT, MARKER_MIN_FT, MARKER_MAX_FT)
      return { c, cx: sx(xFt), cy: sy(courtY), side: sideFt * PX }
    })
    // Draw larger markers first so small ones stay visible on top.
    arr.sort((a, b) => b.side - a.side)
    return arr
  }, [cells, scaleFga])

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-col gap-0.5">
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "var(--term-text)" }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: 9, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
          {subtitle}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        role="img"
        aria-label={`${title}: half-court expected-shot-value map, ${cells.length} cells`}
        style={{ display: "block", background: "#FCFBF9", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
      >
        <g>
          {markers.map((m) => {
            const v = getValue(m.c)
            if (v === null) return null
            return (
              <rect
                key={`${m.c.cellX}:${m.c.cellY}`}
                x={m.cx - m.side / 2}
                y={m.cy - m.side / 2}
                width={m.side}
                height={m.side}
                rx={1}
                fill={getColor(v)}
                opacity={0.92}
              >
                <title>{`${m.c.zoneBasic ?? "—"} · ${m.c.fga.toLocaleString()} FGA · ${formatValue(v)}`}</title>
              </rect>
            )
          })}
        </g>
        <CourtLines />
      </svg>
    </figure>
  )
}

// ─── Methodology note ──────────────────────────────────────────────

function MethodologyNote() {
  return (
    <details className="mono group" style={{ ...termCardStyle, padding: 0 }}>
      <summary
        className="flex cursor-pointer items-center justify-between px-4 py-3 outline-none"
        style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text)", fontWeight: 700 }}
      >
        METHODOLOGY
        <ChevronDown className="size-4 text-[var(--term-text-muted)] transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div
        className="flex flex-col gap-2 px-4 pb-4"
        style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.03em", lineHeight: 1.55 }}
      >
        <p>
          <span style={{ color: "var(--term-text)", fontWeight: 700 }}>BASELINE</span> = LEAGUE-AVERAGE MAKE
          RATE PER SHOT ZONE (THE FLOOR — A STEP FUNCTION). <span style={{ color: "var(--term-text)", fontWeight: 700 }}>GBM</span>{" "}
          = A LOCATION-BASED GRADIENT-BOOSTING MODEL THAT RESOLVES VALUE AS A SMOOTH SURFACE FINER THAN THE ~6 NATIVE ZONES.
        </p>
        <p>
          THE GBM BEAT THE ZONE BASELINE ON WALK-FORWARD LOG-LOSS / BRIER, BUT THE MARGIN IS SMALL
          (~1%). THIS IS A CONSISTENT <span style={{ color: "var(--term-text)", fontWeight: 700 }}>CALIBRATION</span> IMPROVEMENT,
          NOT A LARGE ACCURACY JUMP — A SINGLE SHOT IS NEAR A COIN FLIP WITHIN ANY ZONE.
        </p>
        <p>
          EXPECTED eFG% IS WHAT AN AVERAGE SHOOTER CONVERTS FROM EACH SPOT. THE GAP BETWEEN A TEAM&apos;S
          ACTUAL AND EXPECTED eFG% READS AS{" "}
          <span style={{ color: "var(--term-text)", fontWeight: 700 }}>SHOTS-ABOVE-EXPECTED</span> (SHOT-MAKING RELATIVE TO SHOT SELECTION).
        </p>
        <p>
          THE SURFACE COMES FROM A MODEL TRAINED ON PRIOR SEASONS (EXPANDING WINDOW). BECAUSE SHOT
          EFFICIENCY DRIFTS OVER TIME, THE MOST RECENT SEASON&apos;S EXPECTED VALUES CAN RUN SLIGHTLY LOW.
          NO DEFENDER DISTANCE OR SHOT CLOCK IS USED (ABSENT FROM PUBLIC NBA DATA).
        </p>
      </div>
    </details>
  )
}

// ─── States ────────────────────────────────────────────────────────

function CourtSkeleton() {
  return (
    <div style={termCardStyle}>
      <Skeleton className="mb-3 h-3 w-40 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)", aspectRatio: `${VB_W} / ${VB_H}` }} />
        <Skeleton className="w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)", aspectRatio: `${VB_W} / ${VB_H}` }} />
      </div>
    </div>
  )
}

function MessageCard({ tone, title, body }: { tone: "muted" | "error"; title: string; body?: string }) {
  const accent = tone === "error" ? "var(--term-red)" : "var(--term-text-muted)"
  return (
    <div className="mono px-6 py-12 text-center" style={{ ...termCardStyle, borderLeft: `2px solid ${accent}` }}>
      <p style={{ fontSize: 11, letterSpacing: "0.08em", color: accent, fontWeight: 700 }}>{title}</p>
      {body ? (
        <p className="mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)" }}>
          {body}
        </p>
      ) : null}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────

export function ShotQualityContent() {
  const [season, setSeason] = useState<string>(currentDisplaySeason())
  const [mode, setMode] = useState<ColorMode>("value")

  const { data, error: swrError, isLoading } = useSWR<ShotQualityResponse>(
    `/api/shot-quality?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load shot data") : null

  const cells = useMemo(() => data?.cells ?? [], [data])

  // Color-scale domains, derived per season from the cells actually returned.
  const stats = useMemo(() => {
    const seqVals: number[] = []
    const fgas: number[] = []
    for (const c of cells) {
      if (c.baseline) seqVals.push(c.baseline.expectedEfg)
      if (c.gbm) seqVals.push(c.gbm.expectedEfg)
      fgas.push(c.fga)
    }
    const fgaSorted = [...fgas].sort((a, b) => a - b)
    const scaleFga = Math.max(1, percentile(fgaSorted, 0.95))
    // The divergent scale is set by WELL-SAMPLED cells only, so the sparse tail of
    // tiny-attempt cells (whose zone baseline is noisy) can't flatten it.
    const sampleThresh = Math.max(20, percentile(fgaSorted, 0.4))
    const wsAbsDiff: number[] = []
    for (const c of cells) {
      if (c.gbm && c.baseline && c.fga >= sampleThresh) {
        wsAbsDiff.push(Math.abs(c.gbm.expectedEfg - c.baseline.expectedEfg))
      }
    }
    const seqSorted = [...seqVals].sort((a, b) => a - b)
    const seqLo = percentile(seqSorted, 0.05)
    const seqHi = Math.max(percentile(seqSorted, 0.95), seqLo + 1e-3)
    const divD = clamp(percentile([...wsAbsDiff].sort((a, b) => a - b), 0.9), 0.03, 0.15)
    return { scaleFga, seqLo, seqHi, divD }
  }, [cells])

  const fmtEfg = (v: number): string => `${(v * 100).toFixed(1)}% eFG`
  const fmtDiff = (v: number): string => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)} pp`

  const seqValue = (which: "baseline" | "gbm") => (c: ShotQualityCell): number | null =>
    c[which]?.expectedEfg ?? null
  const seqColorFor = (v: number): string => seqColor((v - stats.seqLo) / (stats.seqHi - stats.seqLo))
  const diffValue = (c: ShotQualityCell): number | null =>
    c.gbm && c.baseline ? c.gbm.expectedEfg - c.baseline.expectedEfg : null
  const diffColorFor = (v: number): string => divColor(v / stats.divD)

  const controls = (
    <div className="flex flex-wrap items-end gap-4">
      <SeasonSelector id="shot-quality-season" season={season} onSeasonChange={setSeason} />
      <EncodingToggle mode={mode} onModeChange={setMode} />
    </div>
  )

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-4">
        {controls}
        <CourtSkeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        {controls}
        <MessageCard tone="error" title="FAILED TO LOAD SHOT DATA" body={error ?? "UNKNOWN ERROR"} />
      </div>
    )
  }

  const isEmpty = cells.length === 0

  return (
    <div className="flex flex-col gap-4">
      {controls}

      {isEmpty ? (
        <MessageCard
          tone="muted"
          title="NO SHOT DATA FOR THIS SEASON"
          body="SHOT-LOCATION COORDINATES ONLY REACH BACK TO 1996-97."
        />
      ) : (
        <>
          <div style={termCardStyle}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
                {season} · {data.meta.cellCount.toLocaleString()} CELLS · {data.meta.totalFga.toLocaleString()} FGA
              </span>
              {mode === "value" ? (
                <LegendBar
                  gradient={`linear-gradient(90deg, ${seqColor(0)}, ${seqColor(1)})`}
                  left={`${(stats.seqLo * 100).toFixed(0)}%`}
                  right={`${(stats.seqHi * 100).toFixed(0)}% eFG`}
                />
              ) : (
                <LegendBar
                  gradient={`linear-gradient(90deg, ${divColor(-1)}, ${divColor(0)}, ${divColor(1)})`}
                  left={`−${(stats.divD * 100).toFixed(1)} (GBM LOWER)`}
                  mid="0"
                  right={`+${(stats.divD * 100).toFixed(1)} pp (HIGHER)`}
                />
              )}
            </div>

            {mode === "value" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ShotCourt
                  cells={cells}
                  scaleFga={stats.scaleFga}
                  getValue={seqValue("baseline")}
                  getColor={seqColorFor}
                  formatValue={fmtEfg}
                  title="BASELINE"
                  subtitle="ZONE-AVERAGE (STEP SURFACE)"
                />
                <ShotCourt
                  cells={cells}
                  scaleFga={stats.scaleFga}
                  getValue={seqValue("gbm")}
                  getColor={seqColorFor}
                  formatValue={fmtEfg}
                  title="GBM"
                  subtitle="LOCATION MODEL (SMOOTH SURFACE)"
                />
              </div>
            ) : (
              <div className="mx-auto w-full md:max-w-md">
                <ShotCourt
                  cells={cells}
                  scaleFga={stats.scaleFga}
                  getValue={diffValue}
                  getColor={diffColorFor}
                  formatValue={fmtDiff}
                  title="GBM − BASELINE"
                  subtitle="Δ EXPECTED eFG% — WHERE THE SMOOTH SURFACE DISAGREES WITH THE ZONE STEPS"
                />
              </div>
            )}

            <p className="mono mt-3" style={{ fontSize: 9, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.5 }}>
              MARKER SIZE = SHOT ATTEMPTS (FGA) FROM THAT CELL. HOVER A CELL FOR ITS ZONE, VOLUME, AND VALUE.
            </p>
          </div>

          <MethodologyNote />
        </>
      )}
    </div>
  )
}
