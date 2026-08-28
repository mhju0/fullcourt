"use client"

import { useId } from "react"

import {
  COURT_H,
  COURT_W,
  courtMarkPaths,
  MARK_COLORS,
  MARK_CUTS,
} from "@/lib/brand/court-mark-geometry"

/**
 * The nav cut of the brand mark ("Split Ink", ratified 2026-08-19): the court
 * from above, one half filled, one tonal, the indigo slash between them —
 * "every game starts uneven" as figure/ground. Keyline-material finish (P-D):
 * a concentric hairline outside the panels, top-lit fill, the slash darkening
 * down its own length. Geometry, ramp and colors all come from
 * `court-mark-geometry.ts` — never redraw them here.
 *
 * This replaced the 2026-07 "Angled Divider" (blue/red halves, amber circle)
 * on 2026-08-19; the exploration record is docs/design/explorations/.
 *
 * The viewBox pads 3 units on every side for the keyline (2-unit gap + the
 * stroke), so the rendered box is 66:38 — pass `size` as the pixel width.
 */
export function CourtMark({
  size = 24,
  className,
  title = "FullCourt",
  tone = "light",
}: {
  size?: number
  className?: string
  title?: string
  /** Which sanctioned color cut to render — SVG fills cannot follow a CSS token scope. */
  tone?: keyof typeof MARK_COLORS
}) {
  const uid = useId()
  const cut = MARK_CUTS.nav
  const c = MARK_COLORS[tone]
  const { left, slash, right } = courtMarkPaths(cut.slashW)
  const VB_W = COURT_W + 6
  const VB_H = COURT_H + 6
  return (
    <svg
      width={size}
      height={(size * VB_H) / VB_W}
      viewBox={`-3 -3 ${VB_W} ${VB_H}`}
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id={`${uid}c`}>
          <rect width={COURT_W} height={COURT_H} rx={cut.rx} />
        </clipPath>
        <linearGradient
          id={`${uid}f`}
          x1="0"
          y1="0"
          x2="0"
          y2={COURT_H}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={c.inkTop} />
          <stop offset="1" stopColor={c.inkBottom} />
        </linearGradient>
        <linearGradient
          id={`${uid}s`}
          x1={COURT_W / 2 + 6}
          y1="0"
          x2={COURT_W / 2 - 6}
          y2={COURT_H}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={c.slashTop} />
          <stop offset="1" stopColor={c.slashBottom} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <path d={left} fill={`url(#${uid}f)`} />
        <path d={slash} fill={`url(#${uid}s)`} />
        <path d={right} fill={c.ink} fillOpacity={cut.tone} />
      </g>
      <rect
        x={-2}
        y={-2}
        width={COURT_W + 4}
        height={COURT_H + 4}
        rx={cut.rx + 2}
        stroke={c.keyline}
        strokeOpacity={cut.keyline.opacity}
        strokeWidth={cut.keyline.width}
      />
    </svg>
  )
}
