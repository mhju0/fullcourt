"use client"

import { useId } from "react"

/**
 * FullCourt brand mark ("Angled Divider"): the rectangular full court from
 * above, split by a tilted center line into a blue (rested) half and a red
 * (fatigued) half — the rest-advantage differential as the shape of the court.
 * Amber center circle = the app's live/active accent.
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
        <path d="M6 7 H33 L39 41 H6 Z" fill="rgba(59,130,246,0.5)" />
        <path d="M33 7 H66 V41 H39 Z" fill="rgba(229,72,77,0.5)" />
        <path d="M33 7 L39 41" stroke="#F2F4F7" strokeWidth="3.4" />
      </g>
      <rect x="6" y="7" width="60" height="34" rx="3" stroke="#F2F4F7" strokeWidth="4" />
      <circle cx="36" cy="24" r="6" stroke="#F5A623" strokeWidth="3.6" />
    </svg>
  )
}
