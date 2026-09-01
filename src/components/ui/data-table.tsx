import { Fragment } from "react"
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

export type DataColumn<Row, K extends string = string> = {
  /**
   * The header. A `ReactNode` rather than a string, so a column whose heading is more than a
   * word — a link, an abbreviation with a title — does not have to fight for it.
   */
  label: ReactNode
  /**
   * Names the field this column sorts by, which is also what makes the header a sort control:
   * focusable, `aria-sort` announced, Enter/Space as well as click.
   *
   * The module renders the control but does not own the state — `sort` and `onSortToggle` come
   * from the caller, because both sorting tables already hold that state for other reasons
   * (one feeds it to a `useMemo`, the other ships it to a worker). A module that owned it would
   * have to be fought rather than used.
   *
   * Omit for a column that cannot be sorted: rank, a bar, a derived label.
   */
  sortKey?: K
  /**
   * Column width, as a CSS length, rendered into a `<colgroup>`. Set it on every column or
   * none — a partial colgroup is worse than none, because auto layout then distributes the
   * slack across whatever is left rather than the one column that can use it.
   */
  width?: string
  /**
   * The unit, rendered as the quiet sub-label under the header.
   *
   * Separate from `label` because "every numeric column names its unit" is a house rule
   * (docs/GLOSSARY.md, and the table conventions), and a rule that depends on each call site
   * remembering to wrap a span in `termThUnitStyle` is a rule with a leak in it.
   */
  unit?: string
  /**
   * Holds a number: tabular numerals, and right alignment unless `align` says otherwise.
   * Alignment is set for the header and the cell together — one flag rather than two
   * `textAlign` overrides that can disagree, which is exactly how a header drifts off its own
   * column.
   */
  numeric?: boolean
  /**
   * Overrides where the column sits. Defaults to right for `numeric`, left otherwise, so the
   * common cases need no alignment at all. Present for the genuinely centred column — a short
   * gap figure or a badge, which reads as a marker rather than as a quantity to compare down
   * the column.
   */
  align?: "left" | "right" | "center"
  /** Renders one cell. Gets the row and its index. */
  cell: (row: Row, index: number) => ReactNode
  /** Extra classes for both the header cell and the body cells — responsive hiding, mostly. */
  className?: string
  /**
   * Per-cell style escape hatch, merged last. **Body cells only.**
   *
   * It used to reach the header too, which was wrong in every one of the twenty-odd places it
   * was used — all of them mean "how this column's numbers look", never "how its heading
   * looks". Most leaked harmlessly because `termThStyle` already sets the same colour, font and
   * weight, so the bug hid; a rank column asking for `fontSize: 10` did not, and shrank its own
   * heading out of line with the eight beside it.
   */
  style?: CSSProperties
  /** Header-cell style, for the rare column whose heading needs something its cells do not. */
  headStyle?: CSSProperties
  /**
   * Group heading. When any column sets one, the header becomes two rows: the groups span their
   * columns across the top, ungrouped columns get a `rowSpan={2}` cell, and the individual
   * labels drop to the second row.
   */
  group?: string
}

export type DataTableProps<Row, K extends string = string> = {
  columns: DataColumn<Row, K>[]
  rows: readonly Row[]
  /** The column currently sorted, and which way. Required for the sort arrows to mean anything. */
  sort?: { key: K; dir: 1 | -1 }
  /**
   * A sortable header was activated. Gets the column's `sortKey`; the caller decides whether
   * that flips the direction or moves to a new column.
   */
  onSortToggle?: (key: K) => void
  /**
   * Pins the header while the body scrolls. For the long tables — 500 players, 200 officials —
   * where a column heading that scrolls away turns the numbers below it into anonymous digits.
   */
  stickyHeader?: boolean
  /**
   * Extra `<tr>`s emitted directly after a row's own — the `/players` expansion, where opening
   * a player unfolds his seasons, a career line, and a note.
   *
   * Deliberately narrow: it can add rows but cannot touch the row it follows, so a caller
   * reaching for it still renders its main row through `columns` like everyone else. The
   * alternative was letting a caller replace row rendering wholesale, which is the shape that
   * lets one table quietly drift back out of the module.
   */
  rowExtras?: (row: Row, index: number) => ReactNode
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

/** Right for numbers, left otherwise, unless the column says different. One resolution, used
 *  by the header and the body cell alike so the two cannot disagree. */
function alignOf<Row, K extends string>(col: DataColumn<Row, K>): "left" | "right" | "center" {
  return col.align ?? (col.numeric ? "right" : "left")
}

export function DataTable<Row, K extends string = string>({
  columns,
  rows,
  rowKey,
  sort,
  onSortToggle,
  stickyHeader,
  rowExtras,
  width = "full",
  minWidth,
  rowAttrs,
  children,
  wrapperClassName,
  className,
}: DataTableProps<Row, K>) {
  const grouped = columns.some((c) => c.group)
  const sized = columns.some((c) => c.width)

  const stickyStyle: CSSProperties = stickyHeader
    ? { position: "sticky", top: 0, zIndex: 2 }
    : {}

  /**
   * One header cell, for every branch below. Sorting used to be rendered by each table by
   * hand, and both hand-written copies attached `onClick` to a bare `<th>` — no role, no
   * `tabIndex`, no key handler — so neither table could be sorted from a keyboard at all.
   * Doing it in one place fixes it in both, which is the whole argument for the module.
   */
  function Header({ col, rowSpan }: { col: DataColumn<Row, K>; rowSpan?: number }) {
    const sortable = col.sortKey !== undefined && onSortToggle !== undefined
    const active = col.sortKey !== undefined && sort?.key === col.sortKey
    const toggle = () => col.sortKey !== undefined && onSortToggle?.(col.sortKey)

    const content = (
      <>
        {col.label}
        {active ? (sort?.dir === -1 ? " ↓" : " ↑") : ""}
        {col.unit && <span style={termThUnitStyle}>{col.unit}</span>}
      </>
    )

    return (
      <th
        scope="col"
        rowSpan={rowSpan}
        className={col.className}
        aria-sort={active ? (sort?.dir === -1 ? "descending" : "ascending") : undefined}
        style={{
          ...termThStyle,
          ...stickyStyle,
          textAlign: alignOf(col),
          // A column with a pinned width is the one whose heading must not wrap — the width was
          // chosen for the numbers below it, not for the label, so wrapping is how a two-word
          // heading silently doubles the header band's height. Columns without a pinned width
          // are free to wrap, which is what the prose tables want.
          ...(col.width ? { whiteSpace: "nowrap" as const } : null),
          // A sorted column's heading comes forward; the rest stay quiet. Only applied where
          // sorting exists at all, so a plain table's headers are untouched.
          ...(onSortToggle
            ? { color: active ? "var(--term-text)" : "var(--term-text-muted)" }
            : null),
          ...col.headStyle,
        }}
      >
        {sortable ? (
          // A real <button> inside the <th>, not handlers on the <th> itself. The `th` keeps
          // its implicit `columnheader` role and carries `aria-sort`; the button is what gets
          // focus, Enter and Space. Putting `role="button"` on the `th` instead — the obvious
          // shortcut — silently replaces `columnheader`, which is both wrong for the table's
          // semantics and enough to break a `getByRole("columnheader")` query.
          <button
            type="button"
            onClick={toggle}
            style={{
              display: "block",
              width: "100%",
              // The padding stays on the `th`, and the button carries none. Moving it in here
              // would have given the button a bigger hit area, but it also makes the cell
              // itself measure `padding: 0` — which is the two-rail alignment law broken, and
              // `e2e/alignment-law.spec.ts` catches it. The cell owns the inset; the button
              // owns the interaction.
              padding: 0,
              margin: 0,
              font: "inherit",
              color: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
              textAlign: "inherit",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {content}
          </button>
        ) : (
          content
        )}
      </th>
    )
  }

  // Runs of adjacent columns sharing a group, so a group heading spans exactly its own columns.
  const groupRuns: { group?: string; span: number; col: DataColumn<Row, K> }[] = []
  for (const col of columns) {
    const last = groupRuns[groupRuns.length - 1]
    if (col.group && last?.group === col.group) last.span += 1
    else groupRuns.push({ group: col.group, span: 1, col })
  }

  return (
    // `tabIndex` is the whole fix for axe's `scrollable-region-focusable`, which fired on 35
    // nodes across 12 of the 20 routes at phone width (audit, 2026-09-01): a table that scrolls
    // sideways but takes no focus holds its off-screen columns where a keyboard alone cannot
    // reach them. It is unconditional on purpose — whether a table actually overflows is a
    // measurement no server render can make, and a scroll wrapper that is focusable when empty
    // costs one tab stop, while one that is focusable only sometimes costs a reader the columns.
    // No `role` goes with it: an unnamed `region` announces less than the table's own semantics,
    // and the app-wide `:focus-visible` outline already paints the stop.
    <div className={wrapperClassName ?? "overflow-x-auto"} tabIndex={0}>
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
        {sized && (
          <colgroup>
            {columns.map((col, i) => (
              <col key={i} style={{ width: col.width }} />
            ))}
          </colgroup>
        )}
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
                      style={{ ...termThStyle, ...stickyStyle, textAlign: "center", borderBottom: "none" }}
                    >
                      {group}
                    </th>
                  ) : (
                    <Header key={`g${i}`} col={col} rowSpan={2} />
                  )
                )}
              </tr>
              <tr>
                {columns
                  .filter((c) => c.group)
                  .map((col, i) => (
                    <Header key={i} col={col} />
                  ))}
              </tr>
            </>
          ) : (
            <tr>
              {columns.map((col, i) => (
                <Header key={i} col={col} />
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Fragment key={rowKey(row, i)}>
              <tr {...rowAttrs?.(row, i)}>
                {columns.map((col, c) => (
                  <td
                    key={c}
                    className={[col.className, col.numeric ? "tabular-nums" : null]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ ...termTdStyle, textAlign: alignOf(col), ...col.style }}
                  >
                    {col.cell(row, i)}
                  </td>
                ))}
              </tr>
              {rowExtras?.(row, i)}
            </Fragment>
          ))}
          {children}
        </tbody>
      </table>
    </div>
  )
}
