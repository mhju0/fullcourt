import type { CSSProperties } from "react"

/**
 * Shared "Bloomberg Terminal meets NBA stats" style tokens. Keep every page
 * pulling from here instead of re-declaring the same card/select/table shapes
 * locally — see docs/FRONTEND.md for the underlying --term-* CSS variables.
 *
 * Type scale (apply new sizes from this list, not ad hoc fontSize values):
 *   10px micro label (uppercase, tracked)   — table headers, badges, meta strips
 *   11px small label (uppercase, tracked)   — stat card labels, section eyebrows
 *   12px body / data                        — table cells, inline data
 *   13-16px emphasized inline                — team abbreviations, card titles
 *   20-24px stat value                       — StatCard-style numbers
 *   32px hero stat value                     — headline metrics (accuracy %, etc.)
 */

/**
 * The spacing scale. Every gap, pad and margin in the app is one of these seven numbers.
 *
 * Before this existed the app used twelve gap steps and about twenty distinct inline padding
 * values (`"12px 14px"`, `"10px 13px"`, `"9px 12px"`, `"7px 14px 7px 17px"`), and the result was
 * that no two cards inset their contents to the same place — `/` alone put card text on three
 * different rails 2px apart, which reads as a rendering fault rather than as a distinction.
 *
 * 4px base because an 11px mono label sitting on its 32px number needs a step finer than 8.
 *
 * EXEMPT: geometry inside a data mark — the gaps between bar segments, shot-grid cells, the 4px
 * fatigue bar's own height. Those numbers are *drawing*, sized against the data and the pixel
 * grid, not layout sized against the page. `gap-[2px]` between two bar segments is correct and
 * must not be snapped to 4.
 */
export const SPACE = {
  /** Label to its own value; icon to its own text. */
  xs: 4,
  /** Inside a single control; between tightly-bound siblings. */
  sm: 8,
  /** Between columns of a table; between items in a row of chips. */
  md: 12,
  /** The card inset — see {@link SPACE_CARD}. Also the default gap between related blocks. */
  lg: 16,
  /** Between distinct blocks inside one card. */
  xl: 24,
  /** Between sections inside one chapter. */
  xxl: 32,
  /** Between chapters (`gap-12`). Fixed by docs/FRONTEND.md and deliberately unchanged. */
  chapter: 48,
} as const

/**
 * The inner rail. Every box in the app insets its contents by exactly this much, so a card
 * title, the first column of a table inside it, and a nested band all begin on one line.
 *
 * The app has exactly TWO horizontal rails: the page gutter (outer, set by the layout container)
 * and this one. A third is permitted in exactly one place — see {@link SPACE_NESTED_ROW}.
 */
export const SPACE_CARD = SPACE.lg

/**
 * The one sanctioned third rail: a row that is hierarchically *inside* another row, i.e. the
 * expanded seasons under a player on `/shooting`. Those need a visible indent because the
 * nesting is the information; every other nested surface is a full-bleed band instead.
 *
 * 28 = the card inset plus one step, so it is still on the scale. It replaces a hand-set 26.
 */
export const SPACE_NESTED_ROW = SPACE_CARD + SPACE.md

/**
 * The widths a *content column* may take. Anything wider than its neighbours by an unexplained
 * amount reads as a broken right edge, so new content picks one of these rather than inventing
 * a measure. Before this the app carried eight prose measures — 42rem, 44rem, 46rem, 48rem,
 * 76ch, 92ch — which is why no two pages' paragraphs ended in the same place.
 *
 * These govern content columns only. An interactive control with an intrinsic size — a season
 * select, a modal, a hover tooltip — is not a content column and keeps its own cap. Neither is
 * a data mark: the shot court sizes to its own geometry.
 */
export const WIDTH = {
  /** Full container width; the layout's `max-w-7xl` supplies it. */
  full: null,
  /**
   * Wide content: a page-level column of mixed prose, tiles and charts that wants more than a
   * table but should not run the full 1280. Already the de facto width of `/availability`,
   * `/playoffs` and the playoff rest sections before it had a name.
   */
  wide: 1040,
  /** Numeric tables. Re-exported below as {@link TERM_NUMERIC_TABLE_MAX_WIDTH}. */
  numeric: 760,
  /** Prose measure. `PageHeader` descriptions, intro paragraphs, reference-page copy. */
  prose: "42rem",
} as const

export const termCardStyle: CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: SPACE_CARD,
}

/**
 * The quiet empty state: a dashed outline where content would be, with no surface behind it.
 *
 * Deliberately not `MessageCard`. These sit in place of a chart, a table body or a bar list —
 * two of the three are already inside a card — so a second filled card would read as a second
 * panel rather than as an absence. Size and centring stay at the call site, since each one fills
 * a differently shaped hole.
 */
export const termDashedEmptyStyle: CSSProperties = {
  border: "1px dashed var(--term-border)",
  borderRadius: "var(--term-radius)",
  fontSize: 12,
  color: "var(--term-text-muted)",
}

/**
 * Recessed panel (breakdown sections inside a card, e.g. fatigue detail insets).
 *
 * A BAND, not a box. It used to be a bordered, rounded rectangle, which meant its contents
 * padded inside a card that had already padded — putting nested text on a third rail 32px in,
 * and stacking a box inside a box inside a card. Rules top and bottom mark "this is subordinate"
 * just as clearly and cost no horizontal inset: a band bleeds to the card's inner rail, so its
 * text stays on the same line as the card title above it.
 *
 * Pad this vertically at the call site. Never horizontally — that is the whole point.
 */
export const termInsetStyle: CSSProperties = {
  background: "var(--term-bg)",
  borderTop: "1px solid var(--term-border)",
  borderBottom: "1px solid var(--term-border)",
}

/**
 * `text-[16px] sm:text-[12px]` is the iOS input-zoom floor, not a type-scale entry. Mobile
 * Safari zooms the whole page when a focused control's font is under 16px, and the zoom does
 * not undo itself on blur — measured worst on /analysis and /shooting (docs/ROADMAP.md,
 * 2026-08-04). Every major sports property "fixes" this by disabling pinch-zoom instead
 * (`user-scalable=no` — ESPN, NBA.com, Naver Sports, KBL, verified against their shipped
 * heads 2026-08-15), which trades an accessibility right for a styling preference. Raising
 * the control to the threshold at phone widths removes the trigger and keeps the zoom.
 * The floor must stay in the CLASS layer: an inline fontSize cannot be made responsive.
 */
export const termSelectClass =
  "mono inline-flex items-center gap-2 bg-[var(--term-surface)] px-3 py-1.5 text-[16px] sm:text-[12px] uppercase tracking-[0.05em] text-[var(--term-text-dim)] transition-colors hover:bg-[var(--term-surface-2)] cursor-pointer appearance-none pr-8"

export const termSelectStyle: CSSProperties = {
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  backgroundImage:
    "url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A929C%27%20stroke-width=%272%27%3E%3Cpath%20d=%27M6%209l6%206%206-6%27/%3E%3C/svg%3E')",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.5rem center",
  backgroundSize: "0.75rem",
}

/** The data face, matching the `.mono` class in globals.css. */
export const MONO_FONT_STACK =
  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

/**
 * Cell padding is NOT set here. It lives in the `.fc-table` rule in globals.css, because the
 * first and last cells need a wider inset than the interior ones — they have to land on the
 * card's inner rail so the leftmost column lines up under the card title, while interior
 * columns stay at a tighter step so a six-column table does not gain 48px of dead air.
 * An inline `padding` here would beat that rule and there is no selector for "first child"
 * in a style object.
 *
 * Consequence: a `<table>` using these styles MUST carry `className="fc-table"`. Omitting it
 * drops all cell padding, which is immediately and loudly visible rather than subtly wrong.
 *
 * **You almost certainly want `DataTable` (`src/components/ui/data-table.tsx`) instead.** Since
 * 2026-08-11 it is the only thing that reads these two, and it applies the class name itself —
 * which is the point, because "remember to add a class" was a rule enforced by a sentence in a
 * docblock, and it was already broken in four places when the module was written. These stay
 * exported for the module and for a genuinely one-off `<td>` that sits outside a column model
 * (the `colSpan` note rows on `/shooting` and `/behind-the-data`).
 */
export const termThStyle: CSSProperties = {
  // `th` defaults to centered while `td` defaults to left, so a header sharing this style
  // with an unstyled cell drifts out of line with the column beneath it. Left is the match.
  textAlign: "left",
  fontFamily: MONO_FONT_STACK,
  fontSize: 11,
  letterSpacing: "0.08em",
  color: "var(--term-text-muted)",
  fontWeight: 700,
  background: "var(--term-surface-2)",
  borderBottom: "1px solid var(--term-border)",
  textTransform: "uppercase",
}

export const termTdStyle: CSSProperties = {
  borderBottom: "1px solid var(--term-border)",
  fontSize: 12,
}

/**
 * The widest a table of mostly-numbers is allowed to get. Stretched to a full 1440px
 * container, five numeric columns leave a team abbreviation at the far left and its figures
 * stranded a third of the screen away, which reads as an alignment fault rather than as a
 * table. Prose tables (the reference pages) are deliberately NOT capped — their note columns
 * use the width.
 *
 * A CEILING, NOT A TARGET. The four tables that use it dropped `w-full` on 2026-08-11, because
 * `width: 100%` plus this cap means "always exactly 760" and a table with few columns does not
 * need 760. The season report's three-column WHAT THE SCHEDULE WAS WORTH was the proof: its
 * middle column ran 390px wide to hold `+21`, so the eye crossed 528px of nothing to get from
 * `UTA` to its own number. Sized to content it lands near its `minWidth` floor instead and
 * reads as one scan. Do not put `w-full` back on a table that also sets this.
 */
export const TERM_NUMERIC_TABLE_MAX_WIDTH = WIDTH.numeric;

/**
 * The unit line under a column header — "GAMES", "MILES", "PCT POINTS". Every column of
 * numbers states what it counts, so no figure on this site is a bare quantity the reader
 * has to infer a scale for. Sits inside the `th`, below the label, deliberately quiet.
 *
 * Columns whose label already names the unit (`MILES FLOWN`, `WIN%`, `GAMES`) do not take
 * one — repeating it reads as noise rather than as a clarification.
 */
export const termThUnitStyle: CSSProperties = {
  display: "block",
  fontWeight: 400,
  fontSize: 9.5,
  letterSpacing: "0.04em",
  textTransform: "none",
  opacity: 0.72,
}

/**
 * Canonical accent-color slots. Each domain (confidence, correctness, etc.)
 * keeps its own status → tone mapping, but every mapping resolves through
 * this one object so the palette lives in exactly one place.
 */
export const TERM_ACCENT = {
  red: "var(--term-red)",
  blue: "var(--term-blue)",
  neutral: "var(--term-neutral)",
  /** The Front Office indigo — chrome emphasis (confidence, active states), never a data pole. */
  accent: "var(--term-accent)",
} as const
