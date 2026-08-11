import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import {
  termTdStyle,
  termThStyle,
  termThUnitStyle,
  TERM_NUMERIC_TABLE_MAX_WIDTH,
} from "@/lib/terminal-styles"

/**
 * The one way to draw a table.
 *
 * Before this existed there was no table module — there was a *convention*, spread across the
 * `.fc-table` rule in globals.css, three exported style objects and a width constant, and a
 * caller had to independently know twelve separate facts to render one table correctly. None
 * was enforced anywhere, and by 2026-08-11 five of the seven that were measurable had drifted
 * across the 21 call sites: four omitted `mono`, two set `border-collapse` as a class while
 * nineteen set it inline, `fontSize: 12` appeared on ten of twenty-one, and — the one that
 * shipped as a bug — four combined `w-full` with the numeric cap, which silently means "always
 * exactly 760px" and ran a three-column table's middle column to 390px to hold `+21`.
 *
 * Everything that used to be a fact a caller had to remember is now inside here: the class
 * name, the collapse mode, the padding rule, the header band, the top and bottom rules, unit
 * sub-labels, numeric alignment, tabular numerals, the scroll wrapper, and the cap.
 *
 * WHAT A CALLER STILL DECIDES is deliberately only what varies: the columns, the rows, and how
 * wide the table is allowed to be. Cell *content* stays fully free — every column brings its own
 * `cell` renderer, because the cells here carry team logos, coloured signed numbers, mini-bars,
 * badges and links, not plain values.
 */

export type DataColumn<Row> = {
  /**
   * The header. A `ReactNode` rather than a string so a sortable column can bring its own
   * button and arrow — the module does not own sorting, and a column that wants it does not
   * have to fight for it.
   */
  label: ReactNode
  /**
   * The unit, rendered as the quiet sub-label under the header.
   *
   * Separate from `label` because "every numeric column names its unit" is a house rule
   * (docs/GLOSSARY.md, and the table conventions), and a rule that depends on each call site
   * remembering to wrap a span in `termThUnitStyle` is a rule with a leak in it.
   */
  unit?: string
  /**
   * Holds a number. Right-aligns the header and the cell together — one flag rather than two
   * `textAlign` overrides that can disagree, which is exactly how a header drifts off its own
   * column.
   */
  numeric?: boolean
  /** Renders one cell. Gets the row and its index. */
  cell: (row: Row, index: number) => ReactNode
  /** Extra classes for both the header cell and the body cells — responsive hiding, mostly. */
  className?: string
  /** Per-column style escape hatch, merged last. Use sparingly; prefer `numeric`. */
  style?: CSSProperties
  /**
   * Group heading. When any column sets one, the header becomes two rows: the groups span their
   * columns across the top, ungrouped columns get a `rowSpan={2}` cell, and the individual
   * labels drop to the second row.
   */
  group?: string
}

export type DataTableProps<Row> = {
  columns: DataColumn<Row>[]
  rows: readonly Row[]
  /** Stable key per row. Required — an index key reorders wrongly the moment a table sorts. */
  rowKey: (row: Row, index: number) => string | number
  /**
   * How wide the table may get. **One field, not two combinable ones** — this is the bug that
   * shipped. `w-full` beside a max-width means "always exactly the max", so a three-column table
   * took a width built for eight.
   *
   * - `"full"` — fills its container. For wide tables and prose tables whose note columns use
   *   the room.
   * - `"numeric"` — sizes to its own content and never exceeds `TERM_NUMERIC_TABLE_MAX_WIDTH`.
   *   A ceiling, not a target. For mostly-numbers tables, where stretching strands a team
   *   abbreviation at one edge and its figures at the other.
   */
  width?: "full" | "numeric"
  /**
   * Horizontal-scroll floor. Below this the wrapper scrolls rather than crushing the columns —
   * the app-wide rule for wide data (docs/FRONTEND.md, "Small screens"): the page itself never
   * scrolls sideways. Not a target; a table narrower than this is left alone.
   */
  minWidth?: number
  /**
   * Attributes for a body row — striping, thin-sample opacity, click handlers, test ids.
   * `data-*` is spelled out because `HTMLAttributes` does not carry it at the type level, and
   * several of these rows are addressed by `data-testid` from e2e.
   */
  rowAttrs?: (
    row: Row,
    index: number
  ) => HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string | undefined>
  /** Rendered inside the table after the body rows — the `/shooting` expansion, mainly. */
  children?: ReactNode
  /** Classes for the scroll wrapper. */
  wrapperClassName?: string
  /** Extra classes on the `<table>` itself, for the rare case that needs one (`table-fixed`). */
  className?: string
}

function headerStyle<Row>(col: DataColumn<Row>): CSSProperties {
  return {
    ...termThStyle,
    ...(col.numeric ? { textAlign: "right" as const } : null),
    ...col.style,
  }
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  width = "full",
  minWidth,
  rowAttrs,
  children,
  wrapperClassName,
  className,
}: DataTableProps<Row>) {
  const grouped = columns.some((c) => c.group)

  // Runs of adjacent columns sharing a group, so a group heading spans exactly its own columns.
  const groupRuns: { group?: string; span: number; col: DataColumn<Row> }[] = []
  for (const col of columns) {
    const last = groupRuns[groupRuns.length - 1]
    if (col.group && last?.group === col.group) last.span += 1
    else groupRuns.push({ group: col.group, span: 1, col })
  }

  return (
    <div className={wrapperClassName ?? "overflow-x-auto"}>
      <table
        // `fc-table` is applied here and nowhere else. It used to be the caller's job, and
        // omitting it dropped every cell's padding — a contract enforced by a sentence in
        // docs/FRONTEND.md asking people to remember.
        className={["fc-table", "mono", width === "full" ? "w-full" : null, className]
          .filter(Boolean)
          .join(" ")}
        style={{
          borderCollapse: "collapse",
          ...(minWidth ? { minWidth } : null),
          // Never alongside `w-full`: the two together are the combination that turned a cap
          // into a fixed width. `width` is one field precisely so they cannot both be set.
          ...(width === "numeric" ? { maxWidth: TERM_NUMERIC_TABLE_MAX_WIDTH } : null),
        }}
      >
        <thead>
          {grouped ? (
            <>
              <tr>
                {groupRuns.map(({ group, span, col }, i) =>
                  group ? (
                    <th
                      key={`g${i}`}
                      colSpan={span}
                      className={col.className}
                      style={{ ...termThStyle, textAlign: "center", borderBottom: "none" }}
                    >
                      {group}
                    </th>
                  ) : (
                    <th key={`g${i}`} rowSpan={2} className={col.className} style={headerStyle(col)}>
                      {col.label}
                      {col.unit && <span style={termThUnitStyle}>{col.unit}</span>}
                    </th>
                  )
                )}
              </tr>
              <tr>
                {columns
                  .filter((c) => c.group)
                  .map((col, i) => (
                    <th key={i} className={col.className} style={headerStyle(col)}>
                      {col.label}
                      {col.unit && <span style={termThUnitStyle}>{col.unit}</span>}
                    </th>
                  ))}
              </tr>
            </>
          ) : (
            <tr>
              {columns.map((col, i) => (
                <th key={i} className={col.className} style={headerStyle(col)}>
                  {col.label}
                  {col.unit && <span style={termThUnitStyle}>{col.unit}</span>}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} {...rowAttrs?.(row, i)}>
              {columns.map((col, c) => (
                <td
                  key={c}
                  className={[col.className, col.numeric ? "tabular-nums" : null]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    ...termTdStyle,
                    ...(col.numeric ? { textAlign: "right" as const } : null),
                    ...col.style,
                  }}
                >
                  {col.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
          {children}
        </tbody>
      </table>
    </div>
  )
}
