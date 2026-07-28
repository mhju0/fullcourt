"use client"

import { Fragment, useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildRows,
  careerTotals,
  indexPayload,
  S,
  searchKey,
  seasonLabel,
  seasonRow,
  type BrowseRow,
  type PlayerRestIndex,
  type PlayerRestPayload,
  type SortKey,
} from "@/lib/player-rest"
import {
  MONO_FONT_STACK,
  termCardStyle,
  termSelectClass,
  termSelectStyle,
  termTdStyle,
  termThStyle,
} from "@/lib/terminal-styles"

/**
 * Static asset, not an API route: this export changes once a season, so there is
 * nothing for a round trip to Postgres to discover. See scripts/export_player_rest.py.
 */
const DATA_URL = "/data/player-rest.json"

/** Client-only by construction: this component is loaded with `ssr: false`. */
function readPlayerParam(): string {
  if (typeof window === "undefined") return ""
  return new URLSearchParams(window.location.search).get("player") ?? ""
}

async function payloadFetcher(url: string): Promise<PlayerRestPayload> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the player database (${res.status})`)
  return (await res.json()) as PlayerRestPayload
}

/** The 2019-20 season is absent league-wide; without a marker a career just looks broken. */
const BUBBLE_BEFORE = 2020
const BUBBLE_AFTER = 2018

const VOLUME_OPTIONS = [
  { value: 0, label: "Everyone" },
  { value: 300, label: "300+ attempts" },
  { value: 600, label: "600+ attempts" },
  { value: 900, label: "900+ attempts" },
]

/** Widest bar. Season swings run far past a career's, so the two scale differently. */
const CAREER_CAP = 4
const SEASON_CAP = 10

const COLUMNS: { key: SortKey | null; label: string; unit?: string; align?: "right" }[] = [
  { key: null, label: "#" },
  { key: "name", label: "Player" },
  { key: null, label: "Team" },
  { key: "age", label: "Age", align: "right" },
  { key: "games", label: "G", align: "right" },
  { key: "fga", label: "FGA", align: "right" },
  { key: "efg", label: "eFG%", align: "right" },
  { key: "noRestEfg", label: "No rest", unit: "eFG% · attempts", align: "right" },
  { key: "restedEfg", label: "3+ days rest", unit: "eFG% · attempts", align: "right" },
  { key: "effect", label: "Rest effect", unit: "3+ days − no rest", align: "right" },
]

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits)
}

function signed(v: number | null): string {
  if (v === null) return "—"
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`
}

/** Number plus a bar, so magnitude reads before the digits do. */
function EffectCell({ value, cap }: { value: number | null; cap: number }) {
  if (value === null) {
    return <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>—</td>
  }
  const width = Math.min(Math.abs(value) / cap, 1) * 46
  const tone = value < 0 ? "var(--term-red)" : "var(--term-blue)"
  return (
    <td style={termTdStyle}>
      <span className="flex items-center justify-end gap-2">
        <span
          style={{ fontFamily: MONO_FONT_STACK, fontVariantNumeric: "tabular-nums", color: tone, minWidth: 52, textAlign: "right" }}
        >
          {signed(value)}
        </span>
        <span
          aria-hidden
          className="relative block flex-none"
          style={{ width: 92, height: 8, background: "var(--term-surface-2)", borderRadius: "var(--term-radius-bar)" }}
        >
          <span
            className="absolute top-0 block"
            style={{
              height: 8,
              width,
              background: tone,
              borderRadius: "var(--term-radius-bar)",
              ...(value < 0 ? { right: "50%" } : { left: "50%" }),
            }}
          />
        </span>
      </span>
    </td>
  )
}

function ArmCell({ efg, fga }: { efg: number | null; fga: number }) {
  if (efg === null || !fga) {
    return <td style={{ ...termTdStyle, textAlign: "right", color: "var(--term-text-muted)" }}>—</td>
  }
  return (
    <td style={{ ...termTdStyle, textAlign: "right", fontFamily: MONO_FONT_STACK, fontVariantNumeric: "tabular-nums" }}>
      {fmt(efg)}{" "}
      <span style={{ color: "var(--term-text-muted)" }}>· {fga.toLocaleString()}</span>
    </td>
  )
}

const NUM_TD: React.CSSProperties = {
  ...termTdStyle,
  textAlign: "right",
  fontFamily: MONO_FONT_STACK,
  fontVariantNumeric: "tabular-nums",
}
const DIM_TD: React.CSSProperties = { ...NUM_TD, color: "var(--term-text-muted)" }

export function PlayerRestContent() {
  const { data, error, isLoading } = useSWR<PlayerRestPayload>(DATA_URL, payloadFetcher, {
    revalidateOnFocus: false,
  })

  const index = useMemo(() => (data ? indexPayload(data) : null), [data])

  // The ?player= link, read once at mount. Held separately from `query` so that
  // typing in the search box never re-opens a player behind the user's back.
  const [linkedName] = useState(() => readPlayerParam())
  const [year, setYear] = useState<number | "career" | null>(null)
  const [minFga, setMinFga] = useState(300)
  const [query, setQuery] = useState(linkedName)
  // Key and direction are one piece of state, not two. Held apart, flipping a
  // direction meant calling setDir from inside setSort's updater — and React may
  // invoke an updater twice, which toggled the direction back to where it started.
  const [sort, setSort] = useState<{ key: SortKey; dir: -1 | 1 }>({ key: "fga", dir: -1 })
  // `undefined` means untouched, so a deep link can supply the default without an
  // effect, while an explicit close (`null`) still sticks.
  const [open, setOpen] = useState<number | null | undefined>(undefined)

  // Both of these are derived during render rather than written by an effect: an
  // effect that only computes a default causes a second render for no reason, and
  // it is the state itself that is derivable, not a side effect.
  const activeYear = year ?? index?.years[0] ?? null
  const linkedPlayer = useMemo(() => {
    if (!index || !linkedName) return null
    const key = searchKey(linkedName)
    const found = index.searchKeys.indexOf(key)
    return found >= 0 ? found : null
  }, [index, linkedName])
  const openPlayer = open === undefined ? linkedPlayer : open

  /** Keep the URL pointing at whoever is open, so the view can be linked and shared.
      The history write stays OUT of the updater: updaters must be pure. */
  const toggle = useCallback(
    (player: number) => {
      const next = openPlayer === player ? null : player
      setOpen(next)
      const url = new URL(window.location.href)
      if (next === null) url.searchParams.delete("player")
      else url.searchParams.set("player", index?.names[next] ?? "")
      window.history.replaceState(null, "", url)
    },
    [openPlayer, index]
  )

  const sortBy = useCallback((key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: key === "name" ? 1 : -1 }
    )
  }, [])

  const rows = useMemo(() => {
    if (!index || activeYear === null) return []
    return buildRows(index, {
      year: activeYear,
      minFga,
      query: searchKey(query),
      sort: sort.key,
      dir: sort.dir,
    })
  }, [index, activeYear, minFga, query, sort])

  if (error) {
    return (
      <div style={termCardStyle} role="alert">
        <p style={{ fontSize: 13, color: "var(--term-red)" }}>{error.message}</p>
      </div>
    )
  }
  if (isLoading || !index || activeYear === null) {
    return (
      <div style={termCardStyle}>
        <Skeleton className="mb-3 h-3 w-48 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-96 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
    )
  }

  const cap = activeYear === "career" ? CAREER_CAP : SEASON_CAP

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]" htmlFor="pr-season">
          Season
        </label>
        <select
          id="pr-season"
          className={termSelectClass}
          style={termSelectStyle}
          value={String(activeYear)}
          onChange={(e) => setYear(e.target.value === "career" ? "career" : Number(e.target.value))}
        >
          <option value="career">Career (all seasons)</option>
          {index.years.map((y) => (
            <option key={y} value={y}>{seasonLabel(y)}</option>
          ))}
        </select>

        <label className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]" htmlFor="pr-volume">
          Volume
        </label>
        <select
          id="pr-volume"
          className={termSelectClass}
          style={termSelectStyle}
          value={minFga}
          onChange={(e) => setMinFga(Number(e.target.value))}
        >
          {VOLUME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player"
          aria-label="Search player"
          className="mono min-w-[190px] bg-[var(--term-surface)] px-3 py-1.5 text-[12px] text-[var(--term-text)] placeholder:text-[var(--term-text-muted)]"
          style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
        />

        <span className="mono ml-auto text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]">
          {rows.length.toLocaleString()}{" "}
          {activeYear === "career" ? "players" : `players in ${seasonLabel(activeYear)}`}
        </span>
      </div>

      <p style={{ fontSize: 12, color: "var(--term-text-muted)", lineHeight: 1.6, maxWidth: "92ch", margin: 0 }}>
        <strong style={{ color: "var(--term-text-dim)" }}>No rest</strong> — he played yesterday.{" "}
        <strong style={{ color: "var(--term-text-dim)" }}>3+ days rest</strong>{" "}
        {/* Explicit: a literal space before the dash here is swallowed when the text
            node wraps to the next source line, which closed the gap after the label. */}
        — at least three days since his last game. Both are counted from the games he actually played, not his
        team&rsquo;s schedule, so a night off for load management is never credited to him.{" "}
        <strong style={{ color: "var(--term-text-dim)" }}>Rest effect</strong> is the right column minus the left:{" "}
        <strong style={{ color: "var(--term-text-dim)" }}>positive</strong> means he shoots better with more rest,{" "}
        <strong style={{ color: "var(--term-text-dim)" }}>negative</strong> that he shoots better on short rest.
      </p>

      <div
        className="fc-rest-table overflow-auto"
        style={{ ...termCardStyle, padding: 0, maxHeight: "74vh" }}
      >
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key !== null && sort.key === col.key
                return (
                  <th
                    key={col.label}
                    scope="col"
                    aria-sort={active ? (sort.dir === -1 ? "descending" : "ascending") : undefined}
                    style={{
                      ...termThStyle,
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      textAlign: col.align ?? "left",
                      whiteSpace: "nowrap",
                      cursor: col.key ? "pointer" : "default",
                      color: active ? "var(--term-text)" : "var(--term-text-muted)",
                    }}
                    onClick={col.key ? () => sortBy(col.key as SortKey) : undefined}
                  >
                    {col.label}
                    {active ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                    {col.unit && (
                      <span
                        className="block"
                        style={{ fontWeight: 400, fontSize: 9.5, letterSpacing: "0.04em", textTransform: "none", opacity: 0.72 }}
                      >
                        {col.unit}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <PlayerRows
                key={row.player}
                row={row}
                rank={i + 1}
                cap={cap}
                index={index}
                expanded={openPlayer === row.player}
                browsedYear={activeYear}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "var(--term-text-muted)", lineHeight: 1.6, maxWidth: "76ch", margin: 0 }}>
        {index.names.length.toLocaleString()} players · 1996-97 through{" "}
        {seasonLabel(index.years[0])}, regular season, 2019-20 excluded. eFG% counts a three as 1.5 makes. A single
        season&rsquo;s rest split carries a standard error near 7 pp and correlates with the player&rsquo;s own next
        season at roughly zero, so a season describes what happened rather than what he is; the career line is the
        number that supports a claim.
      </p>
    </div>
  )
}

/** A player's row plus, when open, his seasons as rows of this same table. */
function PlayerRows({
  row,
  rank,
  cap,
  index,
  expanded,
  browsedYear,
  onToggle,
}: {
  row: BrowseRow
  rank: number
  cap: number
  index: PlayerRestIndex
  expanded: boolean
  browsedYear: number | "career"
  onToggle: (player: number) => void
}) {
  const seasons = expanded ? [...(index.seasonsByPlayer.get(row.player) ?? [])].reverse() : []
  const totals = expanded ? careerTotals(index.seasonsByPlayer.get(row.player) ?? []) : null
  const estimate = index.career.get(row.player)

  return (
    <>
      <tr
        data-player={row.player}
        data-testid="player-row"
        className={expanded ? "fc-open" : undefined}
        style={{ cursor: "pointer", opacity: row.underEvidenced && !expanded ? 0.48 : 1 }}
        onClick={() => onToggle(row.player)}
      >
        <td style={DIM_TD}>{rank}</td>
        <td style={{ ...termTdStyle, fontWeight: 500 }}>{row.name}</td>
        {/* Open, this row's numbers are repeated verbatim by one of the rows below it — the
            browsed season, or Career — so it drops to a name plate over the group. */}
        {expanded ? (
          Array.from({ length: 8 }, (_, i) => <td key={i} style={termTdStyle} />)
        ) : (
          <>
            <td style={{ ...termTdStyle, fontFamily: MONO_FONT_STACK, color: "var(--term-text-muted)" }}>{row.context}</td>
            <td style={DIM_TD}>{row.age}</td>
            <td style={DIM_TD}>{row.games}</td>
            <td style={NUM_TD}>{row.fga.toLocaleString()}</td>
            <td style={NUM_TD}>{fmt(row.efg)}</td>
            <ArmCell efg={row.noRestEfg} fga={row.noRestFga} />
            <ArmCell efg={row.restedEfg} fga={row.restedFga} />
            <EffectCell value={row.effect} cap={cap} />
          </>
        )}
      </tr>

      {expanded &&
        seasons.map((s, i) => {
          const sr = seasonRow(index, s)
          const bubble = i > 0 && seasons[i - 1][S.YEAR] === BUBBLE_BEFORE && s[S.YEAR] === BUBBLE_AFTER
          return (
            <Fragment key={s[S.YEAR]}>
              {bubble && (
                <tr className="fc-sub">
                  <td colSpan={10} style={{ ...termTdStyle, fontFamily: MONO_FONT_STACK, fontSize: 10.5, color: "var(--term-text-muted)" }}>
                    2019-20 — Orlando bubble, excluded league-wide: no normal travel, so no rest to measure
                  </td>
                </tr>
              )}
              <tr className={`fc-sub${s[S.YEAR] === browsedYear ? " fc-here" : ""}`} data-testid="season-row">
                <td style={termTdStyle} />
                <td style={{ ...termTdStyle, paddingLeft: 26, fontFamily: MONO_FONT_STACK, color: "var(--term-text-dim)" }}>
                  {seasonLabel(s[S.YEAR])}
                </td>
                <td style={{ ...termTdStyle, fontFamily: MONO_FONT_STACK, color: "var(--term-text-muted)" }}>{sr.context}</td>
                <td style={DIM_TD}>{sr.age}</td>
                <td style={DIM_TD}>{sr.games}</td>
                <td style={NUM_TD}>{sr.fga.toLocaleString()}</td>
                <td style={NUM_TD}>{fmt(sr.efg)}</td>
                <ArmCell efg={sr.noRestEfg} fga={sr.noRestFga} />
                <ArmCell efg={sr.restedEfg} fga={sr.restedFga} />
                <EffectCell value={sr.effect} cap={SEASON_CAP} />
              </tr>
            </Fragment>
          )
        })}

      {expanded && totals && (
        <tr className="fc-sub fc-total" data-testid="career-row">
          <td style={termTdStyle} />
          <td style={{ ...termTdStyle, paddingLeft: 26, fontFamily: MONO_FONT_STACK, fontWeight: 600 }}>Career</td>
          <td style={termTdStyle} />
          <td style={{ ...NUM_TD, fontWeight: 600 }}>
            {totals.ageLo && totals.ageHi ? `${totals.ageLo}–${totals.ageHi}` : "—"}
          </td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{totals.games.toLocaleString()}</td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{totals.fga.toLocaleString()}</td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmt(totals.efg)}</td>
          <ArmCell efg={totals.noRestEfg} fga={totals.noRestFga} />
          <ArmCell efg={totals.restedEfg} fga={totals.restedFga} />
          <EffectCell value={totals.effect} cap={SEASON_CAP} />
        </tr>
      )}

      {expanded && estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td colSpan={9} style={{ ...termTdStyle, whiteSpace: "normal", fontSize: 12, color: "var(--term-text-muted)" }}>
            His career figure is {signed(estimate.delta)} pp, give or take {estimate.se.toFixed(2)} pp of standard
            error — {signed(estimate.shrunk)} once shrunk toward the league.
          </td>
        </tr>
      )}
      {expanded && !estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td colSpan={9} style={{ ...termTdStyle, whiteSpace: "normal", fontSize: 12, color: "var(--term-text-muted)" }}>
            No career estimate: he has not cleared 150 attempts in both situations, so only his seasons are shown.
          </td>
        </tr>
      )}
    </>
  )
}

