"use client";

import { defaultNbaSeason, parseSeasonStartYear } from "@/lib/nba-season";
import { latestUsableResultSeason } from "@/lib/result-season";
import { SeasonDataGuide } from "@/components/season-data-guide";
import { SeasonSelector } from "@/components/season-selector";
import { Fragment, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePageQuery } from "@/hooks/useSeasonUrl";
import useSWR from "swr";
import { KeepTogether } from "@/components/ui/keep-together";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildRows,
  careerTotals,
  defaultPlayerVolume,
  franchiseOptions,
  gapShade,
  GAP_BANDS,
  MIN_COLOUR_SHOTS,
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
 * A validated daily snapshot. See scripts/export_player_rest.py.
 */
const DATA_URL = "/api/player-rest";

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
  const columns: DataColumn<BrowseRow, SortKey>[] = [
    {
      label: "Player",
      sortKey: "name",
      width: "var(--shooting-player-width)",
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
          <small>{row.games} games · {row.fga.toLocaleString()} att. · {fmt(row.efg)}% eFG</small>
        </button>
      ),
    },
    {
      label: "With rest",
      unit: "eFG pts",
      sortKey: "effect",
      numeric: true,
      width: "var(--shooting-effect-width)",
      style: { padding: 0 },
      cell: (row) => <EffectValue row={row} />,
    },
    {
      label: "eFG%",
      group: "No rest",
      sortKey: "noRestEfg",
      numeric: true,
      width: "var(--shooting-arm-width)",
      className: styles.boundary,
      cell: (row) => <RateValue efg={row.noRestEfg} />,
    },
    {
      label: "Shots",
      group: "No rest",
      sortKey: "noRestFga",
      numeric: true,
      width: "var(--shooting-arm-width)",
      cell: (row) => <ShotCount value={row.noRestFga} />,
    },
    {
      label: "eFG%",
      group: "2+ days rest",
      sortKey: "restedEfg",
      numeric: true,
      width: "var(--shooting-arm-width)",
      className: styles.boundary,
      cell: (row) => <RateValue efg={row.restedEfg} />,
    },
    {
      label: "Shots",
      group: "2+ days rest",
      sortKey: "restedFga",
      numeric: true,
      width: "var(--shooting-arm-width)",
      cell: (row) => <ShotCount value={row.restedFga} />,
    },
  ];
  return columns.map(column => ({
    ...column,
    headStyle: { fontSize: 12, letterSpacing: "normal", textTransform: "none" },
  }));
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits);
}

function signed(v: number | null): string {
  return v === null ? "—" : signedNumber(v, 2);
}

/**
 * The rested-minus-no-rest difference on its shade (D-141): fixed bands, the same stripes on
 * every cell so only the colour varies, and the number on a white plate so it reads on the
 * darkest steps. Grey until both rest groups have the shot floor.
 */
function EffectValue({ row }: { row: Pick<BrowseRow, "effect" | "noRestFga" | "restedFga"> }) {
  const shade = gapShade(row.effect, row.noRestFga, row.restedFga);
  if (row.effect === null || shade === null)
    return (
      <span className={styles.effect} aria-label="Difference unavailable">
        —
      </span>
    );
  const side = shade > 0 ? "better" : "worse";
  return (
    <span
      className={`${styles.effect} ${styles.shaded}`}
      data-shade={shade}
      style={{ backgroundColor: shadeFill(shade) }}
    >
      <span
        className={styles.plate}
        style={{ color: shade === 0 ? "var(--term-text-muted)" : `var(--term-${side}-ink)` }}
      >
        {signedNumber(row.effect, 1)}
      </span>
    </span>
  );
}

function ShotCount({ value }: { value: number }) {
  return <span className={value < MIN_COLOUR_SHOTS ? styles.lowShots : undefined}>{value.toLocaleString()}</span>;
}

/** "2026-10-22" → "Oct 22". */
function throughLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? dateKey
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The 13 legend swatches, worst to best: −6 … −1, 0, +1 … +6. */
const LEGEND_STEPS = Array.from({ length: GAP_BANDS.length * 2 + 1 }, (_, i) => i - GAP_BANDS.length);

function shadeFill(shade: number): string {
  return shade === 0 ? "var(--term-diff-neutral)"
    : `var(--term-${shade > 0 ? "better" : "worse"}-${Math.abs(shade)})`;
}

/** Each band edge sits on the swatch boundary nearer the centre. */
function ShadeLegend() {
  const left = (boundary: number) => `${(boundary / LEGEND_STEPS.length) * 100}%`;
  return (
    <div className={styles.scale} aria-hidden="true">
      <div className={styles.scaleBar}>
        {LEGEND_STEPS.map((shade) => (
          <span key={shade} className={styles.shaded} style={{ backgroundColor: shadeFill(shade) }} />
        ))}
      </div>
      <div className={styles.scaleTicks}>
        {GAP_BANDS.flatMap((edge, i) => {
          const minor = i % 2 === 1 ? styles.minorTick : undefined;
          return [
            <span key={-edge} className={minor} style={{ left: left(GAP_BANDS.length - i) }}>{signedNumber(-edge)}</span>,
            <span key={edge} className={minor} style={{ left: left(GAP_BANDS.length + 1 + i) }}>{signedNumber(edge)}</span>,
          ];
        })}
      </div>
    </div>
  );
}

function RateValue({ efg }: { efg: number | null }) {
  return <span>{efg === null ? "—" : `${fmt(efg)}%`}</span>;
}

const ARM_TD: React.CSSProperties = {
  ...termTdStyle,
  textAlign: "right",
  fontFamily: MONO_FONT_STACK,
  fontVariantNumeric: "tabular-nums",
};


/** The cells after a nested row's label, in the column order of the browse table. */
function ComparisonCells({ values }: { values: Pick<BrowseRow, "effect" | "noRestFga" | "noRestEfg" | "restedFga" | "restedEfg"> }) {
  return <>
    <td style={{ ...ARM_TD, padding: 0 }}><EffectValue row={values} /></td>
    <td className={styles.boundary} style={ARM_TD}><RateValue efg={values.noRestEfg} /></td>
    <td style={ARM_TD}><ShotCount value={values.noRestFga} /></td>
    <td className={styles.boundary} style={ARM_TD}><RateValue efg={values.restedEfg} /></td>
    <td style={ARM_TD}><ShotCount value={values.restedFga} /></td>
  </>;
}

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
  const previousYear = index?.years.find((year) => year < currentYear) ?? null;
  const availableYears = [currentYear, ...(index?.years ?? []).filter((year) => year !== currentYear)];
  const defaultSeason = latestUsableResultSeason(
    (index?.years ?? []).map(seasonLabel), currentSeason,
  );
  const activeYear =
    rawYear === "career"
      ? "career"
      : rawYear && availableYears.includes(Number(rawYear))
        ? Number(rawYear)
        : defaultSeason ? parseSeasonStartYear(defaultSeason) : currentYear;
  const heldCurrent = activeYear === currentYear && !hasCurrentPublication;
  const minFga = defaultPlayerVolume(activeYear, currentYear, params.get("volume"));
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
        "noRestFga",
        "noRestEfg",
        "restedFga",
        "restedEfg",
        "effect",
      ].includes(sortKey)
        ? sortKey
        : ("effect" as SortKey),
    dir: params.get("dir") === "asc" ? (1 as const) : (-1 as const),
  };
  const linkedIndex = index && linkedName ? index.searchKeys.findIndex((key, player) =>
    key === searchKey(linkedName) && (activeYear === "career"
      ? !index.seasonOnlyPlayers.has(player)
      : index.seasonsByPlayer.get(player)?.some(season => season[S.YEAR] === activeYear)),
  ) : -1;
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

  const rows = index && !heldCurrent ? buildRows(index, {
    year: activeYear,
    minFga,
    query: searchKey(query),
    sort: sort.key,
    dir: sort.dir,
    team: team || null,
    pos: (pos || null) as BuildOptions["pos"],
    evidencedOnly,
  }) : [];

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
  if (index && (heldCurrent)) return (
    <div className="flex flex-col gap-4">
      {seasonSelector}
      {error ? <p role="status">Refresh unavailable. Showing the last loaded player export.</p> : null}
      <SeasonDataGuide title="Awaiting results" season={currentSeason}
        body={`Verified player shooting results for ${currentSeason} are not available yet.`}
        previousHref={previousHref} previousLabel={previousLabel} />
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

  const selectedSeason = activeYear === "career" ? null : seasonLabel(activeYear);
  const publication = selectedSeason ? index.publications?.[selectedSeason] ??
    (index.publication?.season === selectedSeason ? index.publication : undefined) : undefined;
  const refreshUnavailable = index.refresh?.status === "failed" || index.refresh?.status === "unavailable";

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
            Show gaps exceeding one observed standard error
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

      {publication ? <p role="status" className="text-[12px] text-[var(--term-text-muted)]">
        {publication.through ? `Through ${throughLabel(publication.through)}` : "No completed games yet"}
        {` · ${publication.observedGames} of ${publication.expectedGames} games`}
        {publication.missingGameIds.length ? ` · ${publication.missingGameIds.length} missing` : ""}
        {refreshUnavailable ? " · Latest refresh incomplete" : ""}
        {" · "}<Link className="fc-text-link" href="/data-status">Data status</Link>
      </p> : refreshUnavailable ? <p role="status" className="text-[12px] text-[var(--term-text-muted)]">
        Some season data could not be refreshed. Showing available verified records.
      </p> : null}
      <div className={styles.key} id="pr-color-note">
        <p className={styles.readingKey}><KeepTogether>With rest = 2+ days rest eFG% minus no rest eFG%, in eFG points. eFG% gives threes extra weight.</KeepTogether></p>
        <ShadeLegend />
        <p className={styles.readingKey}>
          <span style={{ color: "var(--term-worse-text)" }}>Red: lower with rest.</span>{" "}
          <span style={{ color: "var(--term-better-text)" }}>Green: higher with rest.</span>{" "}
          Grey: within 1 point, or fewer than {MIN_COLOUR_SHOTS} shots in a rest group (shown in <span className={styles.lowShots}>orange</span>).
        </p>
      </div>

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
        <p>No rest means played yesterday. 2+ days rest means at least two full days off between the player&apos;s appearances, including games the player sat out. Games after exactly one full day off are not in either group. See <a className="fc-text-link" href="/behind-the-data/player-shooting">Methods</a> for the full comparison rules.</p>
        <p>The colour bands are fixed across seasons, so a shade means the same size every year. A difference built on fewer than {MIN_COLOUR_SHOTS} shots in either group stays grey: at that size one game can move it by several points.</p>
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
        {index.names.length.toLocaleString()} player source records · 1996-97 through{" "}
        {seasonLabel(index.years[0])}, regular season. 2019-20 covers only the
        games played before the March 2020 suspension. Orlando bubble games are
        excluded because the long shutdown changes the meaning of time between
        appearances. eFG% counts a three as 1.5 makes. Small rest splits can change sharply after one game. Career estimates pool
        more attempts and shrink uncertain gaps toward the player-pool mean, but
        still do not isolate a causal effect of rest.
      </p>
      </details>
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
  const allSeasons = index.seasonsByPlayer.get(row.player) ?? [];
  const seasons = [...allSeasons].reverse();
  const totals = careerTotals(allSeasons);
  const seasonOnly = index.seasonOnlyPlayers.has(row.player);
  const estimate = seasonOnly || totals.se === null ? undefined : index.career.get(row.player);

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
              <ComparisonCells values={sr} />
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
            {seasonOnly ? "Observed season" : "Career"}
          </td>
          <ComparisonCells values={totals} />
        </tr>
      )}

      {estimate && (
        <tr className="fc-sub fc-groupend">
          <td
            colSpan={6}
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
            Historical career gap ({seasonLabel(allSeasons[0][S.YEAR])} through {seasonLabel(allSeasons[allSeasons.length - 1][S.YEAR])}): {signed(totals?.exactNumerators ? totals.effect : estimate.delta)} percentage points, give or
            take {estimate.se.toFixed(2)} as one standard error. The estimate
            shrunk toward the player-pool mean is {signed(estimate.shrunk)},
            which reduces the influence of uncertain extremes.
          </td>
        </tr>
      )}
      {!estimate && (
        <tr className="fc-sub fc-groupend">
          <td
            colSpan={6}
            style={{
              ...termTdStyle,
              whiteSpace: "normal",
              fontSize: 12,
              color: "var(--term-text-muted)",
            }}
          >
            {seasonOnly
              ? "Current-season ESPN records are shown separately from the historical NBA records. No cross-provider player identity has been inferred; historical career totals and estimates are unchanged."
              : "No career estimate is available. Estimates require at least 150 attempts in each rest arm and exact shooting counts. Observed totals remain available."}
          </td>
        </tr>
      )}
    </>
  );
}
