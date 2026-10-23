"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { SeasonDataGuide } from "@/components/season-data-guide"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import { defaultNbaSeason, NBA_SEASONS } from "@/lib/nba-season"
import { LEAD, termCardStyle, termInsetStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import type { ShotQualityCell, ShotQualityResponse } from "@/types"
import { signedNumber } from "@/lib/signed-number"
import { MessageCard } from "@/components/ui/message-card"
import { CopyFindingButton } from "@/components/copy-finding-button"
import { usePageQuery } from "@/hooks/useSeasonUrl"

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

// Front Office ramps, validated against the white court surface:
// - Expected eFG% is a magnitude, so its ramp is sequential — ONE hue, light → dark
//   teal. The old tan→blue ramp put two competing hues on a single scale. The light
//   end is held at ≥2:1 against the court (a paler low end vanishes into it); the
//   high end is the theme's deep teal.
// - The GBM−baseline diff is a polarity, so it diverges through a neutral near-white
//   midpoint (kept, so "no difference" cells recede into the court): rose for GBM
//   higher, teal for location model lower — the app's two data-pole hues.
const TEAL_LOW: RGB = hexToRgb("#79BDD1") // sequential low end (pale teal)
const TEAL_HIGH: RGB = hexToRgb("#065F74") // sequential high end (deep teal)
const ROSE: RGB = hexToRgb("#E11D48") // "gbm higher" in diff view (= --term-red)
const TEAL: RGB = hexToRgb("#0891B2") // "gbm lower" in diff view (= --term-blue)
const NEUTRAL: RGB = hexToRgb("#E5E7EB") // diff ≈ 0

/** Sequential expected-eFG% ramp: pale → deep teal. `t` already normalized to [0,1]. */
const seqColor = (t: number): string => mix(TEAL_LOW, TEAL_HIGH, clamp01(t))
/** Divergent GBM−baseline ramp: negative → teal, ~0 → neutral, positive → rose. `t` in [-1,1]. */
const divColor = (t: number): string =>
  t >= 0 ? mix(NEUTRAL, ROSE, clamp01(t)) : mix(NEUTRAL, TEAL, clamp01(-t))

// ─── Encoding toggle ───────────────────────────────────────────────

type ColorMode = "actual" | "value" | "diff"

function EncodingToggle({
  mode,
  onModeChange,
  modelsAvailable,
}: {
  mode: ColorMode
  onModeChange: (m: ColorMode) => void
  modelsAvailable: boolean
}) {
  const options: { key: ColorMode; label: string }[] = [
    { key: "actual", label: "SHOT ATTEMPTS" },
    { key: "value", label: "EXPECTED eFG%" },
    { key: "diff", label: "MODEL DIFFERENCE" },
  ]
  return (
    <div className="flex flex-col gap-2">
      <span className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 600 }}>
        MAP VIEW
      </span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Map view">
        {options.map((o) => {
          const active = mode === o.key
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              disabled={o.key !== "actual" && !modelsAvailable}
              onClick={() => onModeChange(o.key)}
              className={`fc-control-button mono px-3 py-2 ${active ? "" : "hover:bg-[var(--term-surface-2)]"}`}
              style={{
                fontSize: 12,
                letterSpacing: TRACK.data,
                // Solid ink when active: a view toggle is chrome, and teal now belongs
                // to the court marks alone.
                background: active ? "var(--term-text)" : undefined,
                color: active ? "var(--term-surface)" : "var(--term-text-dim)",
                border: "1px solid var(--term-border)",
                borderRadius: 4,
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

// ─── "How to read this" strip (legend + plain-language key) ────────

function BigLegend({
  caption,
  gradient,
  left,
  mid,
  right,
}: {
  caption: string
  gradient: string
  left: string
  mid?: string
  right: string
}) {
  // max-w-[420px] is not one of the WIDTH content columns: a legend sizes to the colour ramp
  // it labels, so that is an intrinsic cap on a control rather than a measure for reading.
  return (
    <div className="flex w-full max-w-[420px] shrink-0 flex-col gap-2 sm:w-[340px]">
      <span className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700 }}>
        {caption}
      </span>
      <div style={{ height: 16, borderRadius: "var(--term-radius-sm)", border: "1px solid var(--term-border)", background: gradient }} />
      <div className="mono flex justify-between tabular-nums" style={{ fontSize: 12, color: "var(--term-text-dim)", letterSpacing: TRACK.sub, fontWeight: 600 }}>
        <span>{left}</span>
        {mid ? <span>{mid}</span> : null}
        <span>{right}</span>
      </div>
    </div>
  )
}

/**
 * Mode-aware first-glance guide: an enlarged color legend plus a 3-line
 * plain-sentence key. Deliberately sentence case (not the mono-caps chrome)
 * so it reads as human help, not more terminal furniture.
 */
function HowToRead({
  mode,
  seqLo,
  seqHi,
  divD,
}: {
  mode: ColorMode
  seqLo: number
  seqHi: number
  divD: number
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:gap-6" style={termInsetStyle}>
      {mode === "value" ? (
        <>
          <BigLegend
            caption="EXPECTED eFG%"
            gradient={`linear-gradient(90deg, ${seqColor(0)}, ${seqColor(1)})`}
            left={`${(seqLo * 100).toFixed(0)}% · low value`}
            right={`${(seqHi * 100).toFixed(0)}% · high value`}
          />
          <div className="flex min-w-0 flex-col gap-1" style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-dim)" }}>
            <p>
              Each square is a spot on the floor; bigger squares mean more shots attempted there.
            </p>
            <p>
              Color is what an average shooter earns from that spot:{" "}
              {/* The pale low end fails text contrast on white, so only the deep end is
                  inked — the legend gradient above carries the low half of the scale. */}
              <span style={{ color: "#065F74", fontWeight: 600 }}>deep teal is high-value</span> (rim, corner threes), pale teal is low-value (long mid-range).
            </p>
            <p style={{ color: "var(--term-text-muted)" }}>
              Both models use the same locations. Switch models to compare the selected spot. The zone model assigns averages;
              the location model uses coordinates to estimate differences within zones.
            </p>
          </div>
        </>
      ) : (
        <>
          <BigLegend
            caption="MODEL DIFFERENCE"
            gradient={`linear-gradient(90deg, ${divColor(-1)}, ${divColor(0)}, ${divColor(1)})`}
            left={`−${(divD * 100).toFixed(1)} pp · location model lower`}
            mid="0"
            right={`+${(divD * 100).toFixed(1)} pp · location model higher`}
          />
          <div className="flex min-w-0 flex-col gap-1" style={{ fontSize: TYPE.body, lineHeight: LEAD.body, color: "var(--term-text-dim)" }}>
            <p>One court: where the two models disagree about a spot&apos;s value.</p>
            <p>
              <span style={{ color: "var(--term-red-text)", fontWeight: 600 }}>Rose: location model rates it higher</span> than the zone
              average, <span style={{ color: "var(--term-blue-text)", fontWeight: 600 }}>teal: lower</span>; pale squares mean
              the models agree.
            </p>
            <p style={{ color: "var(--term-text-muted)" }}>
              Differences near zone borders show where location estimates depart from zone
              averages. A difference alone does not establish which estimate is better.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Court chrome (lines) ──────────────────────────────────────────

const LINE = "#464E59"
const BOUNDARY = "#5A6470"
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
  compareModels = false,
}: {
  cells: ShotQualityCell[]
  scaleFga: number
  getValue: (c: ShotQualityCell) => number | null
  getColor: (v: number) => string
  formatValue: (v: number) => string
  title: string
  subtitle: string
  compareModels?: boolean
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

  const [selectedIndex, setSelectedIndex] = useState(0)
  const locations = useMemo(() => markers.filter((m) => compareModels ? m.c.baseline !== null || m.c.gbm !== null : getValue(m.c) !== null)
    .sort((a, b) => a.c.cellY - b.c.cellY || a.c.cellX - b.c.cellX), [markers, getValue, compareModels])
  const activeIndex = Math.min(selectedIndex, Math.max(0, locations.length - 1))
  const selected = locations[activeIndex]
  const selectedValue = selected ? getValue(selected.c) : null
  const description = selected
    ? `${selected.c.zoneBasic ?? "Unclassified zone"} · ${selected.c.fga.toLocaleString()} attempts · ${selectedValue === null ? "No value for this model" : formatValue(selectedValue)} · ${selected.c.cellX + 0.5} ft across, ${selected.c.cellY + 0.5} ft upcourt from the rim`
    : "No measured locations for this view."
  const comparisonDescription = selected && compareModels
    ? `Zone average: ${selected.c.baseline ? formatValue(selected.c.baseline.expectedEfg) : "Unavailable"}; Location model: ${selected.c.gbm ? formatValue(selected.c.gbm.expectedEfg) : "Unavailable"}. ${description}`
    : description

  return (
    <figure className="flex flex-col gap-2">
      {compareModels && selected ? <div className="mb-2 border border-[var(--term-border)] p-4" role="status" aria-live="polite">
        <p className="text-[15px] font-semibold">{selected.c.zoneBasic ?? "Unclassified zone"}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><p className="text-[15px] text-[var(--term-text-muted)]">Zone average</p><p className="mono mt-1 text-2xl font-semibold">{selected.c.baseline ? formatValue(selected.c.baseline.expectedEfg) : "Unavailable"}</p></div>
          <div><p className="text-[15px] text-[var(--term-text-muted)]">Location model</p><p className="mono mt-1 text-2xl font-semibold">{selected.c.gbm ? formatValue(selected.c.gbm.expectedEfg) : "Unavailable"}</p></div>
        </div>
        <p className="mt-3 text-[15px] text-[var(--term-text-muted)]">{selected.c.fga.toLocaleString()} attempts at this location · {selected.c.cellX + 0.5} ft across, {selected.c.cellY + 0.5} ft upcourt from the rim</p>
      </div> : null}
      <figcaption className="flex flex-col gap-1">
        <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: TRACK.data, color: "var(--term-text)" }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
          {subtitle}
        </span>
      </figcaption>
      <svg
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = (event.clientX - bounds.left) * VB_W / bounds.width
          const y = (event.clientY - bounds.top) * VB_H / bounds.height
          let nearest = 0
          let distance = Infinity
          locations.forEach((m, i) => {
            const d = (m.cx - x) ** 2 + (m.cy - y) ** 2
            if (d < distance) { distance = d; nearest = i }
          })
          setSelectedIndex(nearest)
        }}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        role="img"
        aria-label={`${title}: half-court expected-shot-value map, ${cells.length} cells`}
        style={{ display: "block", background: "var(--term-surface)", border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
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
        {selected && <circle cx={selected.cx} cy={selected.cy} r={9} fill="none" stroke="var(--term-text)" strokeWidth={3} pointerEvents="none" />}
      </svg>
      <label className="flex flex-col gap-2" style={{ fontSize: TYPE.body }}>
        Inspect a location · {title}
        <input
          type="range"
          min={0}
          max={Math.max(0, locations.length - 1)}
          step={1}
          value={activeIndex}
          disabled={!locations.length}
          aria-label={`Inspect location on ${title} court`}
          aria-valuetext={comparisonDescription}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
          style={{ width: "100%", minHeight: 44, accentColor: "var(--term-accent)" }}
        />
      </label>
      {!compareModels ? <p role="status" style={{ margin: 0, fontSize: TYPE.body, minHeight: "3em" }}>{description}</p> : null}
    </figure>
  )
}

function ShotModelComparison({ cells, scaleFga, getColor, formatValue }: {
  cells: ShotQualityCell[]
  scaleFga: number
  getColor: (value: number) => string
  formatValue: (value: number) => string
}) {
  const { params, update } = usePageQuery()
  const model = params.get("model") === "gbm-v1" ? "gbm" : "baseline"
  const setModel = (value: "baseline" | "gbm") => update({ model: value === "gbm" ? "gbm-v1" : null })
  return <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Shot value model">
      <button type="button" className="fc-control-button min-h-11 border border-[var(--term-border)] px-3 py-2 text-[15px] aria-pressed:border-[var(--term-accent)] aria-pressed:bg-[var(--term-surface-2)]" aria-pressed={model === "baseline"} onClick={() => setModel("baseline")}>Zone average</button>
      <button type="button" className="fc-control-button min-h-11 border border-[var(--term-border)] px-3 py-2 text-[15px] aria-pressed:border-[var(--term-accent)] aria-pressed:bg-[var(--term-surface-2)]" aria-pressed={model === "gbm"} onClick={() => setModel("gbm")}>Location model</button>
    </div>
    <ShotCourt cells={cells} scaleFga={scaleFga} getValue={(cell) => cell[model]?.expectedEfg ?? null} getColor={getColor} formatValue={formatValue} title={model === "baseline" ? "Zone average" : "Location model"} subtitle={model === "baseline" ? "ZONE-AVERAGE (STEP SURFACE)" : "LOCATION MODEL (COURT COORDINATES)"} compareModels />
  </div>
}

// ─── States ────────────────────────────────────────────────────────

function CourtSkeleton() {
  return (
    <div style={termCardStyle}>
      <Skeleton className="mb-3 h-3 w-40 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      <div className="mx-auto w-full max-w-lg">
        <Skeleton className="w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)", aspectRatio: `${VB_W} / ${VB_H}` }} />
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────

export function ShotQualityContent() {
  const { params, update } = usePageQuery()
  const requestedSeason = params.get("season")
  const validRequestedSeason = requestedSeason && NBA_SEASONS.includes(requestedSeason)
    ? requestedSeason
    : null
  const requestedMode = params.get("mode")

  const { data: publication, error: swrError, isLoading } = useSWR<ShotQualityResponse>(
    validRequestedSeason ? `/api/shot-quality?season=${validRequestedSeason}` : "/api/shot-quality",
    apiFetcher,
    { revalidateOnFocus: false }
  )
  const currentSeason = defaultNbaSeason()
  const data = publication
  const error = swrError ? errMsg(swrError) : null
  const season = validRequestedSeason ?? data?.season ?? currentSeason
  const dataMatchesSelection = Boolean(data && data.season === season)
  const hasModelValues = Boolean(data?.cells.some(c => c.baseline || c.gbm))
  const mode: ColorMode = requestedMode === "diff" ? "diff" : requestedMode === "actual" ? "actual" : requestedMode === "value" || hasModelValues ? "value" : "actual"
  const compareModels = mode === "value" && params.get("compare") === "1"
  const setSeason = (value: string) => update({ season: value })
  const setMode = (value: ColorMode) => update({
    mode: value,
    compare: value === "diff" ? null : compareModels ? "1" : null,
  })
  const fallbackNotes = [
    requestedSeason && !validRequestedSeason && data
      ? `${requestedSeason} is unavailable on this page. Showing ${data.season}.`
      : null,
    requestedMode && requestedMode !== "value" && requestedMode !== "diff" && requestedMode !== "actual"
      ? `${requestedMode} is not a supported map view. Showing expected eFG%.`
      : null,
  ].filter(Boolean)

  const cells = useMemo(() => data?.cells ?? [], [data])
  const modelCoverage = data?.meta.publication?.models
  const completeModels = Boolean(cells.length && cells.every(c => c.baseline && c.gbm))
  const publicationMeta = data?.meta.publication


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
  const fmtDiff = (v: number): string => `${signedNumber(v * 100, 1)}\u00a0pp`

  const seqColorFor = (v: number): string => seqColor((v - stats.seqLo) / (stats.seqHi - stats.seqLo))
  const diffValue = (c: ShotQualityCell): number | null =>
    c.gbm && c.baseline ? c.gbm.expectedEfg - c.baseline.expectedEfg : null
  const diffColorFor = (v: number): string => divColor(v / stats.divD)

  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-4">
      <SeasonSelector id="shot-quality-season" season={season} onSeasonChange={setSeason} />
      <EncodingToggle mode={mode} onModeChange={setMode} modelsAvailable={hasModelValues} />
      </div>
      {dataMatchesSelection ? (
        <CopyFindingButton
          key={`${season}-${mode}-${compareModels}`}
          text={`${season} Expected Shot Value · ${mode === "actual" ? "observed shot attempts by location" : mode === "diff" ? "location model minus zone average, in percentage points" : "expected effective field-goal percentage"}. Model estimates describe shot locations, not guaranteed outcomes.`}
          query={{ season, mode, compare: compareModels ? "1" : null, model: params.get("model") }}
        />
      ) : null}
    </div>
  )

  if (error) {
    return (
      <div className="flex flex-col gap-12">
        {controls}
        <MessageCard tone="error" title="FAILED TO LOAD SHOT DATA" body={error} />
      </div>
    )
  }

  if ((isLoading && !data) || !data || !dataMatchesSelection) {
    return (
      <div className="flex flex-col gap-12">
        {controls}
        <CourtSkeleton />
      </div>
    )
  }

  const isEmpty = cells.length === 0

  return (
    <div className="flex flex-col gap-12">
      {controls}
      {fallbackNotes.map((note) => <p key={note} role="status" className="mono text-xs text-[var(--term-text-muted)]">{note}</p>)}
      {publicationMeta?.checkedAt || publicationMeta?.updateStatus === "failed" ? <p role="status" className="text-body text-[var(--term-text-muted)] [overflow-wrap:anywhere]">{publicationMeta.checkedAt ? <>Last update check {publicationMeta.checkedAt}. </> : null}{publicationMeta.updateStatus === "failed" ? "The latest update failed; the previous publication is retained." : publicationMeta.updateStatus === "unavailable" ? "The source has no new publication." : "Published snapshot available."}</p> : null}

      {!isEmpty && !validRequestedSeason && season < currentSeason ? <p role="status" className="text-body text-[var(--term-text-muted)]">
        Showing {season}, the latest published shot grid. {currentSeason} shot data is not available yet.
      </p> : null}

      {isEmpty && season >= currentSeason ? <SeasonDataGuide season={season}
        body="Shot-location data for this season has not been published. Observed attempts will appear as soon as a validated shot grid is available."
        previousHref={`/shot-quality?season=${data.latestPublishedSeason}`}
        previousLabel={`View published results · ${data.latestPublishedSeason}`} /> : isEmpty ? (
        <div className="flex flex-col gap-3">
          <MessageCard
            tone="muted"
            title="NO SHOT DATA FOR THIS SEASON"
            body={season < "1996-97"
              ? "Shot-location coordinates begin in 1996-97."
              : season > data.latestPublishedSeason
                ? `The ${season} expected shot value surface has not been published yet.`
                : `No expected shot value surface is published for ${season}.`}
          />
          <button
            type="button"
            onClick={() => setSeason(data.latestPublishedSeason)}
            className="mono min-h-11 self-start text-xs font-bold text-[var(--term-accent)] underline underline-offset-4"
          >
            View latest results · {data.latestPublishedSeason}
          </button>
        </div>
      ) : (
        // `data-shot-anchor`: where the README shot of this page ends (scripts/screenshots.mjs).
        <div style={termCardStyle} data-shot-anchor="two-court">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700 }}>
              {season} · {data.meta.cellCount.toLocaleString()} CELLS · {data.meta.totalFga.toLocaleString()} FGA
            </span>
          </div>

          <div className="mb-4 flex flex-col gap-2 text-body text-[var(--term-text-muted)] [overflow-wrap:anywhere]" role="status">
            <p>Observed attempts in {cells.length.toLocaleString()} measured locations. Early-season totals describe the shots collected so far.</p>
            {publicationMeta?.source === "nba-stats-snapshot" ? <>
              <p>NBA Stats ShotChartDetail · {publicationMeta.gameCount?.toLocaleString()} games · {publicationMeta.firstGameDate} to {publicationMeta.lastGameDate} (Eastern game dates).</p>
              <p>Snapshot generated {publicationMeta.generatedAt}. {publicationMeta.droppedShotCount?.toLocaleString()} attempts outside the map or without coordinates are excluded.</p>
              <p>Coverage is the games returned by the source; completeness against the NBA schedule has not been established.</p>
            </> : <p>Historical database grid. Source collection date and game coverage are unavailable.</p>}
            {hasModelValues ? <p>Model coverage: zone average {modelCoverage?.["baseline-zone-v1"].coveredCells ?? cells.filter(c => c.baseline).length}/{cells.length} cells; location model {modelCoverage?.["gbm-v1"].coveredCells ?? cells.filter(c => c.gbm).length}/{cells.length} cells. {completeModels ? "Both surfaces cover every location." : "Incomplete surfaces retain unavailable locations."} Model training period is unavailable for these published surfaces.</p> : <p>Model estimates are awaiting publication. The map shows observed shot attempts.</p>}
          </div>
          {mode === "actual" ? <p className="mb-4 text-body text-[var(--term-text-muted)]">Larger, darker squares mark more shot attempts. Counts describe observed volume at each location.</p> : hasModelValues ? <HowToRead mode={mode} seqLo={stats.seqLo} seqHi={stats.seqHi} divD={stats.divD} /> : null}

          {mode === "actual" || !hasModelValues ? (
            <div className="mx-auto w-full max-w-lg"><ShotCourt cells={cells} scaleFga={stats.scaleFga} getValue={c => c.fga} getColor={v => seqColor(v / stats.scaleFga)} formatValue={v => `${v.toLocaleString()} attempts`} title="Actual shot attempts" subtitle="OBSERVED VOLUME · REGULAR SEASON" /></div>
          ) : mode === "value" ? (
            <ShotModelComparison cells={cells} scaleFga={stats.scaleFga} getColor={seqColorFor} formatValue={fmtEfg} />
          ) : !completeModels ? <MessageCard tone="muted" title="MODEL COMPARISON INCOMPLETE" body="A model difference requires both estimates at every location. Inspect the available values in Expected eFG%." /> : (
            <div className="mx-auto w-full md:max-w-md">
              <ShotCourt
                cells={cells}
                scaleFga={stats.scaleFga}
                getValue={diffValue}
                getColor={diffColorFor}
                formatValue={fmtDiff}
                title="MODEL DIFFERENCE"
                subtitle="Δ EXPECTED eFG% · LOCATION MODEL MINUS ZONE AVERAGE"
              />
            </div>
          )}

          <p className="mt-3" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", lineHeight: LEAD.body }}>
            Marker size shows shot attempts. Tap the court to inspect the nearest measured location, or use the location slider and arrow keys. Locations run left to right from the baseline upcourt.
          </p>
        </div>
      )}
    </div>
  )
}
