"use client";

import { defaultNbaSeason, parseSeasonStartYear } from "@/lib/nba-season";
import { latestUsableResultSeason } from "@/lib/result-season";
import { SeasonDataGuide } from "@/components/season-data-guide";
import { SeasonReadinessNotice } from "@/components/season-readiness-notice";
import { useSeasonReadiness } from "@/hooks/useSeasonReadiness";
import { SeasonSelector } from "@/components/season-selector";
import { Fragment, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usePageQuery } from "@/hooks/useSeasonUrl";
import { ZeroRestWorkload } from "@/components/zero-rest-workload";
import useSWR from "swr";
import { KeepTogether } from "@/components/ui/keep-together";
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
import { signedNumber } from "@/lib/signed-number";
import { MessageCard } from "@/components/ui/message-card";
import { errMsg } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
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

function playerColumns(
  toggle: (player: number) => void,
  isOpen: (row: BrowseRow) => boolean,
): DataColumn<BrowseRow, SortKey>[] {
  return [
    {
      label: "Player",
      sortKey: "name",
      width: "37%",
      style: { fontWeight: 500 },
      cell: (row) => (
        <button
          type="button"
          className={styles.player}
          aria-expanded={isOpen(row)}
          aria-label={`${isOpen(row) ? "Collapse" : "Expand"} ${row.name} shooting details`}
          onClick={(event) => {
            event.stopPropagation();
            toggle(row.player);
          }}
        >
          <span className="inline-flex items-start gap-1">
            {isOpen(row) ? (
              <ChevronDown aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
            )}
            <span>{row.name}</span>
          </span>
          <small>{row.context}</small>
        </button>
      ),
    },
    {
      label: "No rest",
      unit: "eFG% · att.",
      sortKey: "noRestEfg",
      numeric: true,
      width: "21%",
      cell: (row) => <ArmValue efg={row.noRestEfg} fga={row.noRestFga} />,
    },
    {
      label: "2–29 off",
      unit: "eFG% · att.",
      sortKey: "restedEfg",
      numeric: true,
      width: "24%",
      cell: (row) => <ArmValue efg={row.restedEfg} fga={row.restedFga} />,
    },
    {
      label: "Gap",
      unit: "pp",
      sortKey: "effect",
      numeric: true,
      width: "18%",
      cell: (row) => <EffectValue value={row.effect} quiet={row.underEvidenced} />,
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
  const alpha = quiet || value === 0 ? 0 : 0.05 + 0.2 * strength;
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
  "mono text-[11px] font-semibold uppercase tracking-label text-[var(--term-text-muted)]";

export function PlayerRestContent() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<PlayerRestPayload>(
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
  const currentSeason = defaultNbaSeason();
  const currentYear = parseSeasonStartYear(currentSeason);
  const hasCurrentPublication = index?.years.includes(currentYear) ?? false;
  const readiness = useSeasonReadiness(currentSeason, hasCurrentPublication);
  const previousYear = index?.years.find((year) => year < currentYear) ?? null;
  const availableYears = useMemo(
    () => [currentYear, ...(index?.years ?? []).filter((year) => year !== currentYear)],
    [currentYear, index],
  );
  const defaultSeason = latestUsableResultSeason(
    (index?.years ?? []).map(seasonLabel), currentSeason, readiness.ready,
  );
  const activeYear =
    rawYear === "career"
      ? "career"
      : rawYear && availableYears.includes(Number(rawYear))
        ? Number(rawYear)
        : defaultSeason ? parseSeasonStartYear(defaultSeason) : currentYear;
  const heldPublication = hasCurrentPublication && !readiness.ready;
  const heldCurrent = activeYear === currentYear && (!hasCurrentPublication || !readiness.ready);
  const heldCareer = activeYear === "career" && heldPublication;
  const volume = params.has("volume") ? Number(params.get("volume")) : 300;
  const minFga = VOLUME_OPTIONS.some((option) => option.value === volume)
    ? volume
    : 300;
  const team = params.get("team") ?? "";
  const pos = params.get("position") ?? "";
  const evidencedOnly = params.get("certain") === "1";
  const query = String(params.get("q") ?? linkedName);
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
    if (!index || heldCurrent || heldCareer) return [];
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
    heldCurrent,
    heldCareer,
  ]);

  const columns = useMemo(
    () => playerColumns(toggle, (row) => openPlayer === row.player),
    [toggle, openPlayer],
  );

  const seasonSelector = <SeasonSelector
    id="pr-season"
    season={String(activeYear)}
    onSeasonChange={(value) => setYear(value === "career" ? "career" : Number(value))}
    options={[{ value: "career", label: "Career" }, ...availableYears.map(year => ({ value: String(year), label: seasonLabel(year) }))]}
  />;
  const previousHref = previousYear !== null ? `/shooting?year=${previousYear}` : undefined;
  const previousLabel = previousYear !== null ? `View published results · ${seasonLabel(previousYear)}` : undefined;

  if (error && !data) {
    return <div className="flex flex-col gap-4">
      {seasonSelector}
      <MessageCard tone="error" title="FAILED TO LOAD THE PLAYER DATABASE" body={errMsg(error)}
        action={<button type="button" className="fc-text-link min-h-11" disabled={isValidating}
          onClick={() => { void mutate().catch(() => undefined); }}>
          {isValidating ? "Retrying…" : "Retry player data"}
        </button>} />
    </div>;
  }
  if (index && (heldCurrent || heldCareer)) return (
    <div className="flex flex-col gap-4">
      {seasonSelector}
      {error ? <p role="status">Refresh unavailable. Showing the last loaded player export.</p> : null}
      {hasCurrentPublication && (readiness.error || !readiness.data) ? (
        <SeasonReadinessNotice readiness={readiness} season={currentSeason}
          body="Player shooting results are not available yet."
          previousHref={previousHref} previousLabel={previousLabel} />
      ) : (
        <SeasonDataGuide title="Awaiting results" season={currentSeason}
          body={heldCareer
            ? "Career results include the current season and will appear after those results are available. Earlier seasons remain available."
            : `Player shooting results for ${currentSeason} are not available yet.`}
          previousHref={previousHref} previousLabel={previousLabel} />
      )}
    </div>
  );

  if (isLoading || !index) {
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
      <div className="flex flex-col gap-3">
        <div className="grid items-end gap-3 sm:grid-cols-[160px_minmax(0,260px)]">
          {seasonSelector}
          <label className="flex min-w-0 flex-col gap-2">
            <span className={FILTER_LABEL}>Find a player</span>
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
            className="fc-control mono w-full placeholder:text-[var(--term-text-muted)]"
            style={{
              border: "1px solid var(--term-control-border)",
              borderRadius: "var(--term-radius)",
            }}
          />
          </label>
        </div>
          <details className="fc-disclosure">
            <summary>
              Advanced filters ({Number(Boolean(team)) + Number(minFga > 0) + Number(Boolean(pos)) + Number(evidencedOnly)})
            </summary>
            <div className="flex flex-wrap gap-4 py-3">
          <span className="flex min-w-0 flex-col gap-2">
            <label className={FILTER_LABEL} htmlFor="pr-team">
              Team
            </label>
            <select
              id="pr-team"
              className={cn(termSelectClass, "min-h-11 w-full sm:w-auto")}
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
              <span className="flex flex-col gap-2">
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
              <span className="flex flex-col gap-2">
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
          <button type="button" className="fc-text-link min-h-11 text-left underline" onClick={() => update({ team: null, volume: null, position: null, certain: null })}>
            Reset advanced filters
          </button>
          </details>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {!rawYear && defaultSeason && defaultSeason < currentSeason ? (
            <p role="status" className="text-[12px] text-[var(--term-text-muted)]">{currentSeason} awaiting results</p>
          ) : null}
          <span className="mono ml-auto text-[10px] uppercase tracking-label text-[var(--term-text-muted)]">
            {rows.length.toLocaleString()}{" "}
            {activeYear === "career"
              ? rows.length === 1 ? "player" : "players"
              : `${rows.length === 1 ? "player" : "players"} in ${seasonLabel(activeYear)}`}
          </span>
        </div>
      </div>

      <p className={styles.readingKey}><KeepTogether>eFG% gives threes extra weight. Gap = 2–29 days off minus no rest (pp). Attempts appear below rates.</KeepTogether></p>

      <div style={{ ...termCardStyle, padding: 0 }}>
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
                heldFromYear={heldPublication ? currentYear : undefined}
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

      <details className="fc-disclosure">
        <summary>Rest definitions and uncertainty</summary>
        <p>No rest means played yesterday. 2–29 days off means two to 29 full days between the player&apos;s appearances, including games the player sat out; season openers and returns from longer absences are left out. The difference is 2–29 days off minus no rest, in percentage points.</p>
        <div className={styles.legend} id="pr-color-note">
          <span style={{ color: "#991b1b" }}>− Lower with rest</span>
          <span style={{ color: "#166534" }}>+ Higher with rest</span>
          <span>Color scale: −10 pp to +10 pp; numbers are not capped. † Below one estimated standard error: the difference is small relative to its uncertainty. This is not a 95% significance threshold.</span>
        </div>
      </details>


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
  heldFromYear,
}: {
  row: BrowseRow;
  index: PlayerRestIndex;
  browsedYear: number | "career";
  heldFromYear?: number;
}) {
  const allSeasons = index.seasonsByPlayer.get(row.player) ?? [];
  const seasons = [...allSeasons].filter((season) => heldFromYear === undefined || season[S.YEAR] < heldFromYear).reverse();
  const totals = heldFromYear === undefined ? careerTotals(allSeasons) : null;
  const estimate = heldFromYear === undefined ? index.career.get(row.player) : undefined;

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
              <td
                style={{
                  ...termTdStyle,
                  paddingLeft: SPACE_NESTED_ROW,
                  fontFamily: MONO_FONT_STACK,
                  color: "var(--term-text-dim)",
                }}
              >
                {seasonLabel(s[S.YEAR])}
                <small className={styles.seasonContext}>{sr.context}</small>
              </td>
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
          <td
            colSpan={4}
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
            Raw career gap: {signed(totals?.exactNumerators ? totals.effect : estimate.delta)} percentage points, give or
            take {estimate.se.toFixed(2)} as one standard error. The estimate
            shrunk toward the player-pool mean is {signed(estimate.shrunk)},
            which reduces the influence of uncertain extremes.
          </td>
        </tr>
      )}
      {heldFromYear !== undefined ? (
        <tr className="fc-sub fc-groupend" data-testid="career-data-held">
          <td colSpan={4} style={{ ...termTdStyle, whiteSpace: "normal", fontSize: 15, color: "var(--term-text-muted)" }}>
            Career totals and estimates are unavailable while current-season data awaits release. Earlier season results remain available.
          </td>
        </tr>
      ) : !estimate && (
        <tr className="fc-sub fc-groupend">
          <td
            colSpan={4}
            style={{
              ...termTdStyle,
              whiteSpace: "normal",
              fontSize: 12,
              color: "var(--term-text-muted)",
            }}
          >
            No career estimate: fewer than 150 shots on no rest or on two to
            29 days off, so only his seasons are shown.
          </td>
        </tr>
      )}
    </>
  );
}
