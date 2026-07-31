"use client"

import { useMemo, useState } from "react"
import {
  FOUL_COLUMNS,
  isNotable,
  publishable,
  signedPp,
  sortRows,
  type RefereeFoulStyle,
  type RefereeStyleRow,
} from "@/lib/referee-foul-style"
import { termCardStyle, termTdStyle, termThStyle, termThUnitStyle } from "@/lib/terminal-styles"

type SortKey = keyof RefereeStyleRow

const COLUMNS: {
  key: SortKey | null
  label: string
  unit?: string
  align?: "right"
  width: string
}[] = [
  { key: null, label: "#", align: "right", width: "44px" },
  { key: "name", label: "Official", width: "auto" },
  { key: "chiefGames", label: "As chief", unit: "games", align: "right", width: "84px" },
  { key: "games", label: "G", unit: "games", align: "right", width: "64px" },
  { key: "fouls", label: "Fouls", unit: "vs season avg", align: "right", width: "96px" },
  ...FOUL_COLUMNS.map((c) => ({
    key: c.key as SortKey,
    label: c.label,
    unit: "pct points",
    align: "right" as const,
    width: "104px",
  })),
]

/** Blue above the league mix, red below, muted when the gap is inside noise. */
function toneFor(value: number, z: number): string {
  if (!isNotable(z)) return "var(--term-text-muted)"
  return value > 0 ? "var(--term-blue)" : "var(--term-red)"
}

export function RefereeStyleContent({ data }: { data: RefereeFoulStyle }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "games", dir: -1 })
  const [chiefsOnly, setChiefsOnly] = useState(false)

  const rows = useMemo(() => {
    const base = publishable(data.officials).filter((r) => (chiefsOnly ? r.chiefGames > 0 : true))
    return sortRows(base, sort.key, sort.dir)
  }, [data.officials, sort, chiefsOnly])

  const chiefCount = useMemo(
    () => publishable(data.officials).filter((r) => r.chiefGames > 0).length,
    [data.officials]
  )

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mono flex flex-wrap items-center gap-3" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
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

      <div className="overflow-x-auto" style={{ ...termCardStyle, padding: 0 }}>
        <table className="mono w-full table-fixed border-collapse text-[12px]" style={{ minWidth: 940 }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.label} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key !== null && sort.key === col.key
                return (
                  <th
                    key={col.label}
                    scope="col"
                    aria-sort={active ? (sort.dir === -1 ? "descending" : "ascending") : undefined}
                    onClick={col.key ? () => sortBy(col.key as SortKey) : undefined}
                    style={{
                      ...termThStyle,
                      textAlign: col.align ?? "left",
                      whiteSpace: "nowrap",
                      cursor: col.key ? "pointer" : "default",
                      color: active ? "var(--term-text)" : "var(--term-text-muted)",
                    }}
                  >
                    {col.label}
                    {active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                    {col.unit && <span style={termThUnitStyle}>{col.unit}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name} data-testid="referee-style-row">
                <td style={{ ...termTdStyle, textAlign: "right", fontSize: 10, color: "var(--term-text-muted)" }}>
                  {i + 1}
                </td>
                <td className="whitespace-nowrap" style={{ ...termTdStyle, fontWeight: 600 }}>
                  {row.name}
                  {row.chiefGames > 0 && (
                    <span
                      title="Works as crew chief"
                      style={{
                        marginLeft: 6,
                        fontSize: 8,
                        fontWeight: 700,
                        color: "var(--term-blue)",
                        border: "1px solid var(--term-blue)",
                        borderRadius: "var(--term-radius-sm)",
                        padding: "0 3px",
                      }}
                    >
                      CC
                    </span>
                  )}
                </td>
                <td
                  className="tabular-nums"
                  style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}
                >
                  {row.chiefGames > 0 ? row.chiefGames : "—"}
                </td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                  {row.games}
                </td>
                <td
                  className="tabular-nums"
                  style={{ ...termTdStyle, textAlign: "right", color: toneFor(row.fouls, row.foulsZ), fontWeight: isNotable(row.foulsZ) ? 700 : 400 }}
                >
                  {signedPp(row.fouls)}
                </td>
                {FOUL_COLUMNS.map((c) => {
                  const v = row[c.key]
                  const z = row[`${c.key}Z` as keyof RefereeStyleRow] as number
                  return (
                    <td
                      key={c.key}
                      className="tabular-nums"
                      style={{
                        ...termTdStyle,
                        textAlign: "right",
                        color: toneFor(v, z),
                        fontWeight: isNotable(z) ? 700 : 400,
                      }}
                    >
                      {signedPp(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
        BOLD = BEYOND TWO STANDARD ERRORS · MUTED = INSIDE NOISE · CC = WORKS AS CREW CHIEF ·{" "}
        {chiefCount} OF {publishable(data.officials).length} DO
      </p>
    </div>
  )
}
