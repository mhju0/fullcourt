"use client"

import { useMemo, useState } from "react"
import {
  FOUL_COLUMNS,
  isNotable,
  publishable,
  relativePct,
  sortRows,
  type RefereeFoulStyle,
  type RefereeStyleRow,
} from "@/lib/referee-foul-style"
import { SPACE, termCardStyle, TRACK, TYPE } from "@/lib/terminal-styles"
import { signedNumber } from "@/lib/signed-number"
import { DataTable, type DataColumn } from "@/components/ui/data-table"

type SortKey = keyof RefereeStyleRow

/** Blue above the league mix, red below, muted when the gap is inside noise. */
function toneFor(value: number, z: number): string {
  if (!isNotable(z)) return "var(--term-text-muted)"
  return value > 0 ? "var(--term-blue)" : "var(--term-red)"
}

/** A relative-to-league cell: emphasis carries the scan, tone carries the direction. */
function relStyle(value: number, z: number) {
  return { color: toneFor(value, z), fontWeight: isNotable(z) ? 700 : 400 }
}

function columnsFor(data: RefereeFoulStyle): DataColumn<RefereeStyleRow, SortKey>[] {
  return [
    {
      label: "#",
      align: "right",
      width: "44px",
      style: { fontSize: 10, color: "var(--term-text-muted)" },
      cell: (_row, i) => i + 1,
    },
    {
      label: "Official",
      sortKey: "name",
      width: "auto",
      style: { fontWeight: 600 },
      cell: (row) => (
        <>
          <span className="whitespace-nowrap">{row.name}</span>
          {row.chiefGames > 0 && (
            <span
              title="Works as crew chief"
              style={{
                marginLeft: SPACE.sm,
                fontSize: TYPE.micro,
                fontWeight: 700,
                color: "var(--term-blue)",
                border: "1px solid var(--term-blue)",
                borderRadius: "var(--term-radius-sm)",
                padding: "0 4px",
              }}
            >
              CC
            </span>
          )}
        </>
      ),
    },
    {
      label: "As chief",
      unit: "games",
      sortKey: "chiefGames",
      numeric: true,
      width: "84px",
      style: { color: "var(--term-text-muted)" },
      cell: (row) => (row.chiefGames > 0 ? row.chiefGames : "—"),
    },
    {
      label: "G",
      unit: "games",
      sortKey: "games",
      numeric: true,
      width: "64px",
      cell: (row) => row.games,
    },
    {
      // Beside G because it explains G: a 700-game row and a 200-game row differ in when the
      // official's tenure reaches into this data, not in how much style they have — the
      // |z| >= 2 bolding bar an identical quirk clears at n = 700 is out of reach at n = 200.
      // "In this data": the corpus opens at the dataset's first season, so most veterans'
      // spans are left-censored to it (the legend line says so).
      label: "Since",
      unit: "in this data",
      sortKey: "firstSeason",
      numeric: true,
      width: "88px",
      style: { color: "var(--term-text-muted)" },
      cell: (row) => row.firstSeason,
    },
    {
      // Relative like every column beside it. The underlying figure is a count of fouls per
      // game rather than a share, so it is scaled against the league's own fouls per game
      // instead of a share baseline.
      label: "Fouls",
      unit: "vs league avg",
      sortKey: "fouls",
      numeric: true,
      width: "96px",
      cell: (row) => (
        <span style={relStyle(row.fouls, row.foulsZ)}>
          {signedNumber(relativePct(row.fouls, data.foulsPerGame))}%
        </span>
      ),
    },
    ...FOUL_COLUMNS.map((c): DataColumn<RefereeStyleRow, SortKey> => ({
      label: c.label,
      unit: "vs league avg",
      sortKey: c.key as SortKey,
      numeric: true,
      width: "112px",
      // No rank here, in the cell or in a tooltip. Printed inline it put two competing
      // figures in every cell; hidden behind a native `title` it took a second of motionless
      // hover to appear and nothing signalled it existed, so it was a feature only its author
      // could find. Sorting a column answers the same question in one click. Emphasis alone
      // carries the scan.
      cell: (row) => {
        const v = row[c.key]
        const z = row[`${c.key}Z` as keyof RefereeStyleRow] as number
        return (
          <span style={relStyle(v, z)}>
            {signedNumber(relativePct(v, data.leagueShares[c.key]))}%
          </span>
        )
      },
    })),
  ]
}

export function RefereeStyleContent({ data }: { data: RefereeFoulStyle }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "games", dir: -1 })
  const [chiefsOnly, setChiefsOnly] = useState(false)

  const rows = useMemo(() => {
    const base = publishable(data.officials).filter((r) => (chiefsOnly ? r.chiefGames > 0 : true))
    return sortRows(base, sort.key, sort.dir)
  }, [data.officials, sort, chiefsOnly])

  const columns = useMemo(() => columnsFor(data), [data])

  const chiefCount = useMemo(
    () => publishable(data.officials).filter((r) => r.chiefGames > 0).length,
    [data.officials]
  )

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mono flex flex-wrap items-center gap-3" style={{ fontSize: 11, letterSpacing: TRACK.label }}>
        <label className="flex cursor-pointer items-center gap-2" style={{ color: "var(--term-text-muted)" }}>
          <input
            type="checkbox"
            checked={chiefsOnly}
            onChange={(e) => setChiefsOnly(e.target.checked)}
            style={{ accentColor: "var(--term-blue)" }}
          />
          CREW CHIEFS ONLY
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--term-text-muted)" }}>
          {rows.length} OF {publishable(data.officials).length} OFFICIALS
        </span>
      </div>

      <div style={{ ...termCardStyle, padding: 0 }}>
        {/* 74 officials run to ~3 viewports, so the header pins — against the table's own
            scrollport (`.fc-scrollport`), never the page scroll, which would slide it under
            the sticky chrome. Same mechanism as /shooting's 500-row table. */}
        <DataTable
          wrapperClassName="fc-scrollport overflow-auto"
          className="table-fixed text-[12px]"
          minWidth={1030}
          stickyHeader
          columns={columns}
          rows={rows}
          rowKey={(row) => row.name}
          rowAttrs={() => ({ "data-testid": "referee-style-row" })}
          sort={sort}
          onSortToggle={sortBy}
        />
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: TRACK.sub }}>
        BOLD = BEYOND TWO STANDARD ERRORS · MUTED = INSIDE NOISE · CC = WORKS AS CREW CHIEF ·{" "}
        {chiefCount} OF {publishable(data.officials).length} DO · SINCE = FIRST SEASON IN THIS
        DATA ({data.firstSeason} AT THE EARLIEST), NOT A HIRE DATE
      </p>
    </div>
  )
}
