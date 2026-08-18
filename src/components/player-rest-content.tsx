"use client"

import { Fragment, useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildRows,
  careerTotals,
  franchiseOptions,
  indexPayload,
  S,
  searchKey,
  seasonLabel,
  seasonRow,
  type BrowseRow,
  type BuildOptions,
  type PlayerRestIndex,
  type PlayerRestPayload,
  type SortKey,
} from "@/lib/player-rest"
import { LEAD, MONO_FONT_STACK, SPACE_NESTED_ROW, termCardStyle, termSelectClass, termSelectStyle, termTdStyle, WIDTH } from "@/lib/terminal-styles"
import { signedNumber } from "@/lib/signed-number"
import { MessageCard } from "@/components/ui/message-card"
import { errMsg } from "@/lib/fetcher"
import { DataTable, type DataColumn } from "@/components/ui/data-table"

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

const VOLUME_OPTIONS = [
  { value: 0, label: "Everyone" },
  { value: 300, label: "300+ attempts" },
  { value: 600, label: "600+ attempts" },
  { value: 900, label: "900+ attempts" },
]

/** Widest bar. Season swings run far past a career's, so the two scale differently. */
const CAREER_CAP = 4
const SEASON_CAP = 10

/**
 * `width` drives a <colgroup>. Auto layout hands leftover table width to whichever
 * columns hold text, which put a chasm between TEAM and AGE while AGE and G sat on top
 * of each other; pinning every column and leaving PLAYER as the only elastic one sends
 * all the slack to the one column that can use it. `#` is right-aligned like the ranks
 * it labels — as a left-aligned header it floated a column-width away from its numbers.
 *
 * Everything from `Team` rightward blanks while a player is open: those numbers are repeated
 * verbatim by one of the rows below — the browsed season, or Career — so the row drops to a
 * name plate over the group.
 */
function playerColumns(cap: number, isOpen: (row: BrowseRow) => boolean): DataColumn<BrowseRow, SortKey>[] {
  /** Blanks while open. The first two columns keep theirs; the other eight are the repeat. */
  const whenClosed =
    <T,>(render: (row: BrowseRow) => T) =>
    (row: BrowseRow) =>
      isOpen(row) ? null : render(row)

  return [
    { label: "#", align: "right", width: "44px", style: DIM_TD, cell: (_row, i) => i + 1 },
    {
      label: "Player",
      sortKey: "name",
      width: "auto",
      style: { fontWeight: 500 },
      cell: (row) => row.name,
    },
    {
      label: "Team",
      width: "72px",
      style: { fontFamily: MONO_FONT_STACK, color: "var(--term-text-muted)" },
      cell: whenClosed((row) => row.context),
    },
    {
      label: "Age",
      unit: "years",
      sortKey: "age",
      numeric: true,
      width: "56px",
      style: DIM_TD,
      cell: whenClosed((row) => row.age),
    },
    {
      label: "G",
      unit: "games",
      sortKey: "games",
      numeric: true,
      width: "56px",
      style: DIM_TD,
      cell: whenClosed((row) => row.games),
    },
    {
      label: "FGA",
      unit: "attempts",
      sortKey: "fga",
      numeric: true,
      width: "76px",
      style: NUM_TD,
      cell: whenClosed((row) => row.fga.toLocaleString()),
    },
    {
      label: "eFG%",
      sortKey: "efg",
      numeric: true,
      width: "68px",
      style: NUM_TD,
      cell: whenClosed((row) => fmt(row.efg)),
    },
    {
      label: "No rest",
      unit: "eFG% · attempts",
      sortKey: "noRestEfg",
      numeric: true,
      width: "128px",
      style: { fontFamily: MONO_FONT_STACK },
      cell: whenClosed((row) => <ArmValue efg={row.noRestEfg} fga={row.noRestFga} />),
    },
    {
      label: "3+ days rest",
      unit: "eFG% · attempts",
      sortKey: "restedEfg",
      numeric: true,
      width: "128px",
      style: { fontFamily: MONO_FONT_STACK },
      cell: whenClosed((row) => <ArmValue efg={row.restedEfg} fga={row.restedFga} />),
    },
    {
      label: "Rest effect",
      unit: "3+ days − no rest",
      sortKey: "effect",
      align: "right",
      width: "176px",
      cell: whenClosed((row) => <EffectValue value={row.effect} cap={cap} />),
    },
  ]
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits)
}

function signed(v: number | null): string {
  return v === null ? "—" : signedNumber(v, 2)
}

/**
 * Number plus a bar, so magnitude reads before the digits do.
 *
 * These two render cell *content*, not a `<td>` — the main row's cells come from `DataTable`,
 * which owns the element. The expansion rows below still write their own `<td>`, because they
 * are extra rows outside the column model, and wrap these the same way.
 */
function EffectValue({ value, cap }: { value: number | null; cap: number }) {
  if (value === null) return <span style={{ color: "var(--term-text-muted)" }}>—</span>
  const width = Math.min(Math.abs(value) / cap, 1) * 46
  const tone = value < 0 ? "var(--term-red)" : "var(--term-blue)"
  return (
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
  )
}

function ArmValue({ efg, fga }: { efg: number | null; fga: number }) {
  if (efg === null || !fga) return <span style={{ color: "var(--term-text-muted)" }}>—</span>
  return (
    <>
      {fmt(efg)} <span style={{ color: "var(--term-text-muted)" }}>· {fga.toLocaleString()}</span>
    </>
  )
}

/** The `<td>` the expansion rows wrap `ArmValue` in — the column model's own styling, by hand. */
const ARM_TD: React.CSSProperties = {
  ...termTdStyle,
  textAlign: "right",
  fontFamily: MONO_FONT_STACK,
  fontVariantNumeric: "tabular-nums",
}

const FILTER_LABEL =
  "mono text-[10px] uppercase tracking-label text-[var(--term-text-muted)]"

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

  const teamOptions = useMemo(() => (index ? franchiseOptions(index.teams) : []), [index])

  // The ?player= link, read once at mount. Held separately from `query` so that
  // typing in the search box never re-opens a player behind the user's back.
  const [linkedName] = useState(() => readPlayerParam())
  const [year, setYear] = useState<number | "career" | null>(null)
  const [minFga, setMinFga] = useState(300)
  const [team, setTeam] = useState("")          // "" = all teams
  const [pos, setPos] = useState("")            // "" = all positions
  const [evidencedOnly, setEvidencedOnly] = useState(false)
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
      team: team || null,
      pos: (pos || null) as BuildOptions["pos"],
      evidencedOnly,
    })
  }, [index, activeYear, minFga, query, sort, team, pos, evidencedOnly])

  // Season swings run far past a career's, so the two bar scales differ.
  const cap = activeYear === "career" ? CAREER_CAP : SEASON_CAP
  const columns = useMemo(
    () => playerColumns(cap, (row) => openPlayer === row.player),
    [cap, openPlayer]
  )

  if (error) {
    return (
      <MessageCard
        tone="error"
        title="FAILED TO LOAD THE PLAYER DATABASE"
        body={errMsg(error)}
      />
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

  return (
    <div className="flex flex-col gap-4">
      {/* Two rows, not one wrapping row. Six controls plus the result count could not fit a
          1440px line, so the count — the one thing that answers "did my filter do anything" —
          was the piece that wrapped away from everything else. Row one is the four filters;
          row two is find-a-name plus the count it produces. Each label/select pair is its own
          flex box so a wrap can never separate a label from the control it names. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-season">Season</label>
            <select
              id="pr-season"
              className={termSelectClass}
              style={termSelectStyle}
              value={String(activeYear)}
              onChange={(e) => setYear(e.target.value === "career" ? "career" : Number(e.target.value))}
            >
              {/* "Career (all seasons)" sized this select to its widest option and pushed the
                  whole row over the line. The option list is seasons; "Career" is unambiguous. */}
              <option value="career">Career</option>
              {index.years.map((y) => (
                <option key={y} value={y}>{seasonLabel(y)}</option>
              ))}
            </select>
          </span>

          <span className="flex items-center gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-volume">Volume</label>
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
          </span>

          <span className="flex items-center gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-team">Team</label>
            <select
              id="pr-team"
              className={termSelectClass}
              style={termSelectStyle}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">All teams</option>
              {teamOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </span>

          <span className="flex items-center gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-pos">Position</label>
            <select
              id="pr-pos"
              className={termSelectClass}
              style={termSelectStyle}
              value={pos}
              onChange={(e) => setPos(e.target.value)}
            >
              <option value="">All positions</option>
              <option value="G">Guards</option>
              <option value="F">Forwards</option>
              <option value="C">Centers</option>
            </select>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player"
            aria-label="Search player"
            /* Not one of the WIDTH content columns: a search box sizes to the longest name
               someone will type, which is an intrinsic cap on a control. */
            /* 16px at phone widths is the iOS input-zoom floor, not a type-scale choice —
               see termSelectClass in terminal-styles.ts for the whole reasoning. */
            className="mono w-full max-w-[260px] bg-[var(--term-surface)] px-3 py-2 text-[16px] sm:text-data text-[var(--term-text)] placeholder:text-[var(--term-text-muted)]"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
          />

          <label className="mono flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-label text-[var(--term-text-muted)]">
            <input
              type="checkbox"
              checked={evidencedOnly}
              onChange={(e) => setEvidencedOnly(e.target.checked)}
              style={{ accentColor: "var(--term-blue)" }}
            />
            Hide noisy rows
          </label>

          <span className="mono ml-auto text-[10px] uppercase tracking-label text-[var(--term-text-muted)]">
            {rows.length.toLocaleString()}{" "}
            {activeYear === "career" ? "players" : `players in ${seasonLabel(activeYear)}`}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose, margin: 0 }}>
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

      <div style={{ ...termCardStyle, padding: 0 }}>
        {/* `table-fixed` so the browser sizes columns from the colgroup below instead of
            measuring every cell. Career mode renders ~1,300 rows / ~13,000 cells, and under auto
            layout each filter or sort change re-measured all of them. Measured in Chrome at
            1440px, career mode, 40 interleaved A/B pairs after discarded warm-up: median
            style+layout 114.6ms auto → 108.0ms fixed (~6%). Interleaving matters — a naive
            sequential A-then-B run reported 12% because the second arm inherited a warm layout
            cache. It is also the more correct layout: the colgroup declares 44px for `#`, which
            auto layout was quietly widening to 49px.

            `content-visibility: auto` on the rows was measured here and is WORSE, not better —
            13% slower via stylesheet, 44% via inline styles, i.e. the direction is unambiguous
            even though the magnitude is not. Size containment does not apply to table rows, so
            the browser still lays every row out and only pays the containment bookkeeping on
            top. Do not add it back on this table. */}
        <DataTable
          className="table-fixed text-[12px]"
          wrapperClassName="fc-rest-table overflow-auto"
          stickyHeader
          columns={columns}
          rows={rows}
          rowKey={(row) => row.player}
          sort={sort}
          onSortToggle={sortBy}
          rowAttrs={(row) => ({
            "data-player": String(row.player),
            "data-testid": "player-row",
            className: openPlayer === row.player ? "fc-open" : undefined,
            style: {
              cursor: "pointer",
              opacity: row.underEvidenced && openPlayer !== row.player ? 0.48 : 1,
            },
            onClick: () => toggle(row.player),
          })}
          rowExtras={(row) =>
            openPlayer === row.player ? (
              <PlayerExpansion row={row} index={index} browsedYear={activeYear} />
            ) : null
          }
        />
      </div>

      <p style={{ fontSize: 12, color: "var(--term-text-muted)", lineHeight: LEAD.body, maxWidth: WIDTH.prose, margin: 0 }}>
        {index.names.length.toLocaleString()} players · 1996-97 through{" "}
        {seasonLabel(index.years[0])}, regular season. 2019-20 covers only the games played before the March 2020
        suspension — its Orlando bubble games are left out, because a player&rsquo;s first game back sat about
        141 days after his last one and that is a pause, not rest. eFG% counts a three as 1.5 makes. A single
        season&rsquo;s rest split carries a standard error near 7 pp and correlates with the player&rsquo;s own next
        season at roughly zero, so a season describes what happened rather than what he is; the career line is the
        number that supports a claim.
      </p>
    </div>
  )
}

/**
 * The rows a player unfolds into: his seasons, a career line, and a note.
 *
 * These reach `DataTable` through `rowExtras`, which can add rows after a row but cannot touch
 * the row itself — so the player's own row above still renders through `columns` like every
 * other table's. They keep hand-written `<td>`s on purpose: an indented season label and a
 * `colSpan` note are not the column model, and pretending otherwise would mean bending the
 * module around one caller.
 */
function PlayerExpansion({
  row,
  index,
  browsedYear,
}: {
  row: BrowseRow
  index: PlayerRestIndex
  browsedYear: number | "career"
}) {
  const seasons = [...(index.seasonsByPlayer.get(row.player) ?? [])].reverse()
  const totals = careerTotals(index.seasonsByPlayer.get(row.player) ?? [])
  const estimate = index.career.get(row.player)

  return (
    <>
      {seasons.map((s) => {
          const sr = seasonRow(index, s)
          return (
            <Fragment key={s[S.YEAR]}>
              <tr className={`fc-sub${s[S.YEAR] === browsedYear ? " fc-here" : ""}`} data-testid="season-row">
                <td style={termTdStyle} />
                <td style={{ ...termTdStyle, paddingLeft: SPACE_NESTED_ROW, fontFamily: MONO_FONT_STACK, color: "var(--term-text-dim)" }}>
                  {seasonLabel(s[S.YEAR])}
                </td>
                <td style={{ ...termTdStyle, fontFamily: MONO_FONT_STACK, color: "var(--term-text-muted)" }}>{sr.context}</td>
                <td style={DIM_TD}>{sr.age}</td>
                <td style={DIM_TD}>{sr.games}</td>
                <td style={NUM_TD}>{sr.fga.toLocaleString()}</td>
                <td style={NUM_TD}>{fmt(sr.efg)}</td>
                <td style={ARM_TD}><ArmValue efg={sr.noRestEfg} fga={sr.noRestFga} /></td>
                <td style={ARM_TD}><ArmValue efg={sr.restedEfg} fga={sr.restedFga} /></td>
                <td style={termTdStyle}><EffectValue value={sr.effect} cap={SEASON_CAP} /></td>
              </tr>
            </Fragment>
          )
        })}

      {totals && (
        <tr className="fc-sub fc-total" data-testid="career-row">
          <td style={termTdStyle} />
          <td style={{ ...termTdStyle, paddingLeft: SPACE_NESTED_ROW, fontFamily: MONO_FONT_STACK, fontWeight: 600 }}>Career</td>
          <td style={termTdStyle} />
          <td style={{ ...NUM_TD, fontWeight: 600 }}>
            {totals.ageLo && totals.ageHi ? `${totals.ageLo}–${totals.ageHi}` : "—"}
          </td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{totals.games.toLocaleString()}</td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{totals.fga.toLocaleString()}</td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmt(totals.efg)}</td>
          <td style={ARM_TD}><ArmValue efg={totals.noRestEfg} fga={totals.noRestFga} /></td>
          <td style={ARM_TD}><ArmValue efg={totals.restedEfg} fga={totals.restedFga} /></td>
          <td style={termTdStyle}><EffectValue value={totals.effect} cap={SEASON_CAP} /></td>
        </tr>
      )}

      {estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td colSpan={9} style={{ ...termTdStyle, whiteSpace: "normal", fontSize: 12, color: "var(--term-text-muted)" }}>
            {/* Was: "…give or take X pp of standard error — Y once shrunk toward the league",
                which stacked three pieces of jargon in one line and was misread in testing as
                "one strong toward the lead". The shrunk figure stays because it is the honest
                one — a raw career gap off ~250 attempts per side carries a standard error near
                4 points, so the extremes of a raw ranking are mostly noise — but it now says
                why in words rather than naming the method. */}
            Raw career gap: {signed(estimate.delta)} percentage points, give or take{" "}
            {estimate.se.toFixed(2)}. Small shot counts make gaps look bigger than they really
            are, so {signed(estimate.shrunk)} is the fairer estimate.
          </td>
        </tr>
      )}
      {!estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td colSpan={9} style={{ ...termTdStyle, whiteSpace: "normal", fontSize: 12, color: "var(--term-text-muted)" }}>
            No career estimate — he has not taken 150 shots both on no rest and on three or more
            days rest, so only his seasons are shown.
          </td>
        </tr>
      )}
    </>
  )
}

