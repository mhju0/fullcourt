"use client"

import { useId } from "react"

/**
 * FullCourt brand mark ("Angled Divider"): the rectangular full court from
 * above, split by a tilted center line into a blue (rested) half and a red
 * (fatigued) half — the rest-advantage differential as the shape of the court.
 * Amber center circle = the app's live/active accent.
 *
 * The divider leans top-right to bottom-left, matching the oversized court on
 * /about (`CourtSplit` in about-content.tsx). It leaned the other way until
 * 2026-07-30, so the same mark pointed two directions depending on the surface.
 * Every copy of this geometry — `src/app/icon.svg`, `docs/logo.svg`,
 * `src/app/opengraph-image.tsx` — carries the same lean; change them together.
 *
 * Fixed brand colors (not theme tokens) so the mark is stable wherever it
 * appears. 3:2 viewBox; pass `size` as the pixel width.
 */
export function CourtMark({
  size = 24,
  className,
  title = "FullCourt",
}: {
  size?: number
  className?: string
  title?: string
}) {
  const clip = useId()
  return (
    <svg
      width={size}
      height={(size * 48) / 72}
      viewBox="0 0 72 48"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id={clip}>
          <rect x="6" y="7" width="60" height="34" rx="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path d="M6 7 H39 L33 41 H6 Z" fill="rgba(37,99,235,0.55)" />
        <path d="M39 7 H66 V41 H33 Z" fill="rgba(220,38,38,0.55)" />
        <path d="M39 7 L33 41" stroke="#111318" strokeWidth="3.4" />
      </g>
      <rect x="6" y="7" width="60" height="34" rx="3" stroke="#111318" strokeWidth="4" />
      {/* The badge amber (`#F5A623`), not the app's `--term-amber` (`#C2410C`) — at this
          size the darker burnt orange read as a second red beside the fatigued half. */}
      <circle cx="36" cy="24" r="6" stroke="#F5A623" strokeWidth="3.6" />
    </svg>
  )
}
