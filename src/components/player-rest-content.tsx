"use client";

import { SeasonSelector } from "@/components/season-selector";
import { Fragment, useCallback, useMemo } from "react";
import { usePageQuery } from "@/hooks/useSeasonUrl";
import { ZeroRestWorkload } from "@/components/zero-rest-workload";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildRows,
  careerTotals,
  effectSe,
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
} from "@/lib/player-rest";
import {
  LEAD,
  MONO_FONT_STACK,
  SPACE_NESTED_ROW,
  termCardStyle,
  termSelectClass,
  termSelectStyle,
  termTdStyle,
  WIDTH,
} from "@/lib/terminal-styles";
import { competitionRanks } from "@/lib/rank";
import { RankBadge } from "@/components/ui/rank-badge";
import { signedNumber } from "@/lib/signed-number";
import { MessageCard } from "@/components/ui/message-card";
import { errMsg } from "@/lib/fetcher";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import styles from "./player-rest.module.css";

/**
 * Static asset, not an API route: this export changes once a season, so there is
 * nothing for a round trip to Postgres to discover. See scripts/export_player_rest.py.
 */
const DATA_URL = "/data/player-rest.json";

async function payloadFetcher(url: string): Promise<PlayerRestPayload> {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Could not load the player database (${res.status})`);
  return (await res.json()) as PlayerRestPayload;
}

const VOLUME_OPTIONS = [
  { value: 0, label: "Everyone" },
  { value: 300, label: "300+ attempts" },
  { value: 600, label: "600+ attempts" },
  { value: 900, label: "900+ attempts" },
];

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
function playerColumns(
  toggle: (player: number) => void,
  isOpen: (row: BrowseRow) => boolean,
  /**
   * eFG% standing within the rows as filtered right now (ADR 0010, D1) — positional, aligned
   * with the rows the table renders. In view, not league-wide: a rank that ignored the volume
   * floor and filters would crown someone the reader cannot even see.
   */
  efgRanks: (number | null)[],
): DataColumn<BrowseRow, SortKey>[] {
  /** Blanks while open. The first two columns keep theirs; the other eight are the repeat. */
  const whenClosed =
    <T,>(render: (row: BrowseRow, index: number) => T) =>
    (row: BrowseRow, index: number) =>
      isOpen(row) ? null : render(row, index);

  return [
    {
      label: "#",
      align: "right",
      width: "44px",
      style: DIM_TD,
      cell: (_row, i) => i + 1,
    },
    {
      label: "Player",
      sortKey: "name",
      width: "auto",
      style: { fontWeight: 500 },
      cell: (row) => (
        <button
          type="button"
          className={styles.player}
          aria-expanded={isOpen(row)}
          onClick={(event) => {
            event.stopPropagation();
            toggle(row.player);
          }}
        >
          <span>{row.name}</span>
          <small>{row.context}</small>
        </button>
      ),
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
      // The one ranked column here, and rank-in-view on purpose. The "#" column already ranks
      // whatever the reader sorted by; this rider keeps the page's core metric's standing
      // visible while the table is sorted by anything else. "Rest effect" is deliberately NOT
      // ranked — a difference of two ~30-attempt arms carries the error bars this page spends
      // a whole filter warning about, and a rank would crown exactly that noise.
      label: "eFG%",
      unit: "1ST = BEST IN VIEW",
      sortKey: "efg",
      numeric: true,
      width: "128px",
      style: NUM_TD,
      cell: whenClosed((row, i) => (
        <>
          {fmt(row.efg)}
          {efgRanks[i] !== null && efgRanks[i] !== undefined ? (
            <RankBadge
              rank={efgRanks[i]}
              of={efgRanks.length}
              population="players in view"
            />
          ) : null}
        </>
      )),
    },
    {
      label: "No rest",
      unit: "eFG% · attempts",
      sortKey: "noRestEfg",
      numeric: true,
      width: "128px",
      style: { fontFamily: MONO_FONT_STACK },
      cell: whenClosed((row) => (
        <ArmValue efg={row.noRestEfg} fga={row.noRestFga} />
      )),
    },
    {
      label: "3+ days",
      unit: "eFG% · attempts",
      sortKey: "restedEfg",
      numeric: true,
      width: "128px",
      style: { fontFamily: MONO_FONT_STACK },
      cell: whenClosed((row) => (
        <ArmValue efg={row.restedEfg} fga={row.restedFga} />
      )),
    },
    {
      label: (
        <>
          <span className={styles.longLabel}>Difference</span>
          <span className={styles.shortLabel}>Diff.</span>
        </>
      ),
      unit: "pp",
      sortKey: "effect",
      align: "right",
      width: "108px",
      cell: whenClosed((row) => (
        <EffectValue value={row.effect} quiet={row.underEvidenced} />
      )),
    },
  ];
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits);
}

function signed(v: number | null): string {
  return v === null ? "—" : signedNumber(v, 2);
}

function EffectValue({
  value,
  quiet = false,
}: {
  value: number | null;
  quiet?: boolean;
}) {
  if (value === null)
    return (
      <span className={styles.effect} aria-label="Difference unavailable">
        —
      </span>
    );
  const strength = Math.min(Math.abs(value) / 10, 1);
  const positive = value > 0;
  const alpha = value === 0 ? 0 : (0.05 + 0.2 * strength) * (quiet ? 0.45 : 1);
  return (
    <span
      className={styles.effect}
      aria-describedby="pr-color-note"
      style={{
        background: `rgba(${positive ? "22,101,52" : "180,35,24"},${alpha})`,
        color:
          quiet || value === 0 ? "#59616c" : positive ? "#166534" : "#991b1b",
      }}
    >
      {signedNumber(value, 1)}
      {quiet && (
        <sup aria-label="difference smaller than estimated standard error">
          †
        </sup>
      )}
    </span>
  );
}

function ArmValue({ efg, fga }: { efg: number | null; fga: number }) {
  if (efg === null || !fga)
    return <span style={{ color: "var(--term-text-muted)" }}>—</span>;
  return (
    <span className={styles.arm}>
      <span>{fmt(efg)}%</span>
      <small>
        {fga.toLocaleString()} <span className={styles.attemptLabel}>att.</span>
      </small>
    </span>
  );
}

/** The `<td>` the expansion rows wrap `ArmValue` in — the column model's own styling, by hand. */
const ARM_TD: React.CSSProperties = {
  ...termTdStyle,
  textAlign: "right",
  fontFamily: MONO_FONT_STACK,
  fontVariantNumeric: "tabular-nums",
};

const FILTER_LABEL =
  "mono text-[10px] uppercase tracking-label text-[var(--term-text-muted)]";

const NUM_TD: React.CSSProperties = {
  ...termTdStyle,
  textAlign: "right",
  fontFamily: MONO_FONT_STACK,
  fontVariantNumeric: "tabular-nums",
};
const DIM_TD: React.CSSProperties = {
  ...NUM_TD,
  color: "var(--term-text-muted)",
};

export function PlayerRestContent() {
  const { data, error, isLoading } = useSWR<PlayerRestPayload>(
    DATA_URL,
    payloadFetcher,
    {
      revalidateOnFocus: false,
    },
  );

  const index = useMemo(() => (data ? indexPayload(data) : null), [data]);

  const teamOptions = useMemo(
    () => (index ? franchiseOptions(index.teams) : []),
    [index],
  );

  const { params, update } = usePageQuery();
  const linkedName = params.get("player") ?? "";
  const rawYear = params.get("year");
  const activeYear =
    rawYear === "career"
      ? "career"
      : rawYear && index?.years.includes(Number(rawYear))
        ? Number(rawYear)
        : (index?.years[0] ?? null);
  const volume = params.has("volume") ? Number(params.get("volume")) : 300;
  const minFga = VOLUME_OPTIONS.some((option) => option.value === volume)
    ? volume
    : 300;
  const team = params.get("team") ?? "";
  const pos = params.get("position") ?? "";
  const evidencedOnly = params.get("certain") === "1";
  const query = params.get("q") ?? linkedName;
  const sortKey = params.get("sort") as SortKey | null;
  const sort = {
    key:
      sortKey &&
      [
        "name",
        "age",
        "games",
        "fga",
        "efg",
        "noRestEfg",
        "restedEfg",
        "effect",
      ].includes(sortKey)
        ? sortKey
        : ("fga" as SortKey),
    dir: params.get("dir") === "asc" ? (1 as const) : (-1 as const),
  };
  const linkedIndex =
    index && linkedName ? index.searchKeys.indexOf(searchKey(linkedName)) : -1;
  const openPlayer = linkedIndex < 0 ? null : linkedIndex;
  const setYear = (value: number | "career") => update({ year: String(value) });
  const setMinFga = (value: number) => update({ volume: String(value) });
  const setTeam = (value: string) => update({ team: value || null });
  const setPos = (value: string) => update({ position: value || null });
  const setEvidencedOnly = (value: boolean) =>
    update({ certain: value ? "1" : null });
  const setQuery = (value: string) => update({ q: value }, true);
  const toggle = useCallback(
    (player: number) => {
      update({
        player: openPlayer === player ? null : (index?.names[player] ?? null),
        q: query,
      });
    },
    [openPlayer, index, query, update],
  );
  const sortBy = (key: SortKey) =>
    update({
      sort: key,
      dir:
        sort.key === key
          ? sort.dir === -1
            ? "asc"
            : "desc"
          : key === "name"
            ? "asc"
            : "desc",
    });

  const rows = useMemo(() => {
    if (!index || activeYear === null) return [];
    return buildRows(index, {
      year: activeYear,
      minFga,
      query: searchKey(query),
      sort: sort.key,
      dir: sort.dir,
      team: team || null,
      pos: (pos || null) as BuildOptions["pos"],
      evidencedOnly,
    });
  }, [
    index,
    activeYear,
    minFga,
    query,
    sort.key,
    sort.dir,
    team,
    pos,
    evidencedOnly,
  ]);

  // Recomputed with every filter change, because the rank is a claim about the current view.
  const efgRanks = useMemo(() => competitionRanks(rows, (r) => r.efg), [rows]);
  const columns = useMemo(
    () => playerColumns(toggle, (row) => openPlayer === row.player, efgRanks),
    [toggle, openPlayer, efgRanks],
  );

  if (error && !data) {
    return (
      <MessageCard
        tone="error"
        title="FAILED TO LOAD THE PLAYER DATABASE"
        body={errMsg(error)}
      />
    );
  }
  if (isLoading || !index || activeYear === null) {
    return (
      <div style={termCardStyle}>
        <Skeleton
          className="mb-3 h-3 w-48 bg-[var(--term-surface-2)]"
          style={{ borderRadius: "var(--term-radius)" }}
        />
        <Skeleton
          className="h-96 w-full bg-[var(--term-surface-2)]"
          style={{ borderRadius: "var(--term-radius)" }}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 sm:gap-4 ${styles.page}`}>
      {error ? (
        <p role="status">
          Refresh unavailable. Showing the last loaded player export.
        </p>
      ) : null}
      {/* Two rows, not one wrapping row. Six controls plus the result count could not fit a
          1440px line, so the count — the one thing that answers "did my filter do anything" —
          was the piece that wrapped away from everything else. Row one is the four filters;
          row two is find-a-name plus the count it produces. Each label/select pair is its own
          flex box so a wrap can never separate a label from the control it names. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <SeasonSelector
            id="pr-season"
            season={String(activeYear)}
            onSeasonChange={(value) => setYear(value === "career" ? "career" : Number(value))}
            options={[{ value: "career", label: "Career" }, ...index.years.map(y => ({ value: String(y), label: seasonLabel(y) }))]}
          />

          <span className="flex items-center gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-team">
              Team
            </label>
            <select
              id="pr-team"
              className={termSelectClass}
              style={termSelectStyle}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">All teams</option>
              {teamOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </span>

          <details className="fc-disclosure">
            <summary>
              Filters ({Number(minFga > 0) + Number(Boolean(pos)) + Number(evidencedOnly)})
            </summary>
            <div className="flex flex-wrap gap-4 py-3">
              <span className="flex items-center gap-2">
                <label className={FILTER_LABEL} htmlFor="pr-volume">
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
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>{" "}
              <span className="flex items-center gap-2">
                <label className={FILTER_LABEL} htmlFor="pr-pos">
                  Position
                </label>
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
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] text-[var(--term-text-muted)]">
            <input
              type="checkbox"
              checked={evidencedOnly}
              onChange={(e) => setEvidencedOnly(e.target.checked)}
              style={{ accentColor: "var(--term-blue)" }}
            />
            Hide uncertain differences
          </label>
          </details>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
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
            style={{
              border: "1px solid var(--term-border)",
              borderRadius: "var(--term-radius)",
            }}
          />



          <span className="mono ml-auto text-[10px] uppercase tracking-label text-[var(--term-text-muted)]">
            {rows.length.toLocaleString()}{" "}
            {activeYear === "career"
              ? "players"
              : `players in ${seasonLabel(activeYear)}`}
          </span>
        </div>
      </div>

      <p className={styles.readingKey}>Shooting rate (eFG%) gives extra credit for threes. + means higher with more rest; − means lower. pp = percentage points. These comparisons do not isolate the effect of rest.</p>
      <details className="fc-disclosure">
        <summary>Rest definitions and uncertainty</summary>
        <p>No rest means played yesterday. 3+ days means at least three days since the player&apos;s last appearance, including games the player sat out. The difference is 3+ days minus no rest, in percentage points.</p>
        <div className={styles.legend} id="pr-color-note">
          <span style={{ color: "#991b1b" }}>− Lower with rest</span>
          <span style={{ color: "#166534" }}>+ Higher with rest</span>
          <span>Color scale: −10 pp to +10 pp; numbers are not capped. † Below one estimated standard error: the difference is small relative to its uncertainty. This is not a 95% significance threshold.</span>
        </div>
      </details>

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
          wrapperClassName={`fc-rest-table overflow-auto ${styles.table}`}
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
            style: { cursor: "pointer" },
            onClick: () => toggle(row.player),
          })}
          rowExtras={(row) =>
            openPlayer === row.player ? (
              <PlayerExpansion
                row={row}
                index={index}
                browsedYear={activeYear}
              />
            ) : null
          }
        />
        {rows.length === 0 && (
          <p role="status" className={styles.empty}>
            No players match these filters. Try another name, lower the attempt
            minimum, or clear the team and position filters.
          </p>
        )}
      </div>

      <details className="fc-disclosure"><summary>Coverage and how to read small samples</summary>
      <p
        style={{
          fontSize: 15,
          color: "var(--term-text-muted)",
          lineHeight: LEAD.body,
          maxWidth: WIDTH.prose,
          margin: 0,
        }}
      >
        {index.names.length.toLocaleString()} players · 1996-97 through{" "}
        {seasonLabel(index.years[0])}, regular season. 2019-20 covers only the
        games played before the March 2020 suspension. Orlando bubble games are
        excluded because the long shutdown changes the meaning of time between
        appearances. eFG% counts a three as 1.5 makes. A single season&rsquo;s
        rest split carries a standard error near 7 pp and correlates with the
        player&rsquo;s own next season at roughly zero. Career estimates pool
        more attempts and shrink uncertain gaps toward the player-pool mean, but
        still do not isolate a causal effect of rest.
      </p>
      </details>
      {activeYear !== "career" ? (
        <details className="fc-disclosure">
          <summary>Show zero-rest player workload</summary>
          <ZeroRestWorkload season={seasonLabel(activeYear)} />
        </details>
      ) : null}
    </div>
  );
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
  row: BrowseRow;
  index: PlayerRestIndex;
  browsedYear: number | "career";
}) {
  const seasons = [...(index.seasonsByPlayer.get(row.player) ?? [])].reverse();
  const totals = careerTotals(index.seasonsByPlayer.get(row.player) ?? []);
  const estimate = index.career.get(row.player);

  return (
    <>
      {seasons.map((s) => {
        const sr = seasonRow(index, s);
        return (
          <Fragment key={s[S.YEAR]}>
            <tr
              className={`fc-sub${s[S.YEAR] === browsedYear ? " fc-here" : ""}`}
              data-testid="season-row"
            >
              <td style={termTdStyle} />
              <td
                style={{
                  ...termTdStyle,
                  paddingLeft: SPACE_NESTED_ROW,
                  fontFamily: MONO_FONT_STACK,
                  color: "var(--term-text-dim)",
                }}
              >
                {seasonLabel(s[S.YEAR])}
              </td>
              <td
                style={{
                  ...termTdStyle,
                  fontFamily: MONO_FONT_STACK,
                  color: "var(--term-text-muted)",
                }}
              >
                {sr.context}
              </td>
              <td style={DIM_TD}>{sr.age}</td>
              <td style={DIM_TD}>{sr.games}</td>
              <td style={NUM_TD}>{sr.fga.toLocaleString()}</td>
              <td style={NUM_TD}>{fmt(sr.efg)}</td>
              <td style={ARM_TD}>
                <ArmValue efg={sr.noRestEfg} fga={sr.noRestFga} />
              </td>
              <td style={ARM_TD}>
                <ArmValue efg={sr.restedEfg} fga={sr.restedFga} />
              </td>
              <td style={termTdStyle}>
                <EffectValue value={sr.effect} quiet={sr.underEvidenced} />
              </td>
            </tr>
          </Fragment>
        );
      })}

      {totals && (
        <tr className="fc-sub fc-total" data-testid="career-row">
          <td style={termTdStyle} />
          <td
            style={{
              ...termTdStyle,
              paddingLeft: SPACE_NESTED_ROW,
              fontFamily: MONO_FONT_STACK,
              fontWeight: 600,
            }}
          >
            Career
          </td>
          <td style={termTdStyle} />
          <td style={{ ...NUM_TD, fontWeight: 600 }}>
            {totals.ageLo && totals.ageHi
              ? `${totals.ageLo}–${totals.ageHi}`
              : "—"}
          </td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>
            {totals.games.toLocaleString()}
          </td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>
            {totals.fga.toLocaleString()}
          </td>
          <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmt(totals.efg)}</td>
          <td style={ARM_TD}>
            <ArmValue efg={totals.noRestEfg} fga={totals.noRestFga} />
          </td>
          <td style={ARM_TD}>
            <ArmValue efg={totals.restedEfg} fga={totals.restedFga} />
          </td>
          <td style={termTdStyle}>
            <EffectValue
              value={totals.effect}
              quiet={
                totals.effect !== null &&
                Math.abs(totals.effect) <
                  (effectSe(totals.noRestFga, totals.restedFga) ?? Infinity)
              }
            />
          </td>
        </tr>
      )}

      {estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td
            colSpan={9}
            style={{
              ...termTdStyle,
              whiteSpace: "normal",
              fontSize: 12,
              color: "var(--term-text-muted)",
            }}
          >
            {/* Was: "…give or take X pp of standard error — Y once shrunk toward the league",
                which stacked three pieces of jargon in one line and was misread in testing as
                "one strong toward the lead". The shrunk figure stays because it is the honest
                one — a raw career gap off ~250 attempts per side carries a standard error near
                4 points, so the extremes of a raw ranking are mostly noise — but it now says
                why in words rather than naming the method. */}
            Raw career gap: {signed(estimate.delta)} percentage points, give or
            take {estimate.se.toFixed(2)} as one standard error. The estimate
            shrunk toward the player-pool mean is {signed(estimate.shrunk)},
            which reduces the influence of uncertain extremes.
          </td>
        </tr>
      )}
      {!estimate && (
        <tr className="fc-sub fc-groupend">
          <td style={termTdStyle} />
          <td
            colSpan={9}
            style={{
              ...termTdStyle,
              whiteSpace: "normal",
              fontSize: 12,
              color: "var(--term-text-muted)",
            }}
          >
            No career estimate: fewer than 150 shots on no rest or on three or
            more days rest, so only his seasons are shown.
          </td>
        </tr>
      )}
    </>
  );
}
