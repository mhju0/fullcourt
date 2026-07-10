import type { CSSProperties } from "react"

/**
 * Shared "Bloomberg Terminal meets NBA stats" style tokens. Keep every page
 * pulling from here instead of re-declaring the same card/select/table shapes
 * locally — see docs/FRONTEND.md for the underlying --term-* CSS variables.
 *
 * Type scale (apply new sizes from this list, not ad hoc fontSize values):
 *   9px  micro label (uppercase, tracked)   — table headers, badges, meta strips
 *   10px small label (uppercase, tracked)   — stat card labels, section eyebrows
 *   11px body / data                        — table cells, inline data
 *   12-14px emphasized inline                — team abbreviations, card titles
 *   20-24px stat value                       — StatCard-style numbers
 *   32px hero stat value                     — headline metrics (accuracy %, etc.)
 */

export const termCardStyle: CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: 16,
}

/** Recessed panel (breakdown sections inside a card, e.g. fatigue detail insets). */
export const termInsetStyle: CSSProperties = {
  background: "var(--term-bg)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
}

export const termSelectClass =
  "mono inline-flex items-center gap-2 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] text-slate-700 transition-colors hover:bg-[var(--term-surface-2)] cursor-pointer appearance-none pr-8"

export const termSelectStyle: CSSProperties = {
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  backgroundImage:
    "url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8478%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.5rem center",
  backgroundSize: "0.75rem",
}

export const termThStyle: CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 10,
  letterSpacing: "0.08em",
  color: "var(--term-text-muted)",
  fontWeight: 700,
  padding: "8px 10px",
  background: "var(--term-surface-2)",
  borderBottom: "1px solid var(--term-border)",
  textTransform: "uppercase",
}

export const termTdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--term-border)",
  fontSize: 11,
}

/**
 * Canonical accent-color slots. Each domain (confidence, correctness, etc.)
 * keeps its own status → tone mapping, but every mapping resolves through
 * this one object so the palette lives in exactly one place.
 */
export const TERM_ACCENT = {
  red: "var(--term-red)",
  blue: "var(--term-blue)",
  tan: "var(--term-hardwood)",
  neutral: "var(--term-neutral)",
} as const

export type TermAccentTone = keyof typeof TERM_ACCENT
