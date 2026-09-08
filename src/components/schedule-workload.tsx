"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DataTable } from "@/components/ui/data-table";
import { RankBadge } from "@/components/ui/rank-badge";
import { competitionRanks } from "@/lib/rank";
import { apiFetcher } from "@/lib/fetcher";
import { LEAD, TYPE, WIDTH, termCardStyle } from "@/lib/terminal-styles";
import type {
  SeasonReportResponse,
  SeasonReportTeamLabelled,
  SeasonReportWeek,
} from "@/lib/season-report";

function SectionDivider({
  label,
  descriptor,
}: {
  label: string;
  descriptor?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--term-border)] pb-3">
      <h2 className="text-lg font-semibold">{label}</h2>
      <span className="mono text-xs text-[var(--term-text-muted)]">
        {descriptor}
      </span>
    </div>
  );
}

function ScheduleTax({
  teams,
  basis,
}: {
  teams: SeasonReportTeamLabelled[];
  basis: SeasonReportResponse["basis"];
}) {
  const byMiles = [...teams].sort(
    (a, b) => b.travelMiles - a.travelMiles || a.teamId - b.teamId,
  );
  const most = byMiles[0];
  const least = byMiles[byMiles.length - 1];
  const b2bRanks = competitionRanks(byMiles, (t) => t.backToBacks);
  const threeInFourRanks = competitionRanks(byMiles, (t) => t.threeInFours);

  return (
    <div className="flex flex-col gap-3">
      {/* The descriptor has to move with the basis. "COMPLETED GAMES ONLY" over a season with
          no completed game describes an empty set, when what is actually shown is the whole
          published schedule. */}
      <SectionDivider
        label="Travel and workload"
        descriptor={
          basis === "schedule"
            ? "FULL PUBLISHED SCHEDULE"
            : "COMPLETED GAMES ONLY"
        }
      />
      <p
        style={{
          fontSize: TYPE.body,
          color: "var(--term-text-muted)",
          maxWidth: WIDTH.prose,
          lineHeight: LEAD.body,
        }}
      >
        Back-to-backs and dense stretches are demands on a team. The ranking
        above compares those demands with its opponents. Travel is estimated
        from venue locations; time-zone displacement is a modeled schedule
        measure, not a medical finding.
      </p>
      {most && least ? (
        <p
          className="mono"
          style={{ fontSize: 11, color: "var(--term-text-muted)" }}
        >
          {most.abbreviation} has the most estimated travel at{" "}
          {most.travelMiles.toLocaleString()} miles · {least.abbreviation} the
          least at {least.travelMiles.toLocaleString()}
        </p>
      ) : null}
      {/* Full for the same reason as the conversion table above: one row per team, the page's
          column is the measure. The zero-rest player list below stays numeric — a compact
          lookup, not a league table.

          The rank riders (ADR 0010, D1) sit on the two density columns and only those: the
          table is sorted by miles, so a rank there restates the row number, and JET LAG is a
          sibling measure rather than a key one. B2B and 3-IN-4 are the two figures a reader
          looks their own team up for, and they arrive out of sort order — the rider is what
          says "14 back-to-backs" is 3rd-most without making the reader re-sort by eye. Counts,
          not proportions, so ties are common and share a rank by construction. */}
      <DataTable
        wrapperClassName="fc-detail-table overflow-x-auto"
        width="full"
        minWidth={520}
        rows={byMiles}
        rowKey={(t) => t.teamId}
        rowAttrs={() => ({ "data-testid": "schedule-tax-row" })}
        columns={[
          { label: "TEAM", cell: (t) => t.abbreviation },
          {
            label: "TRAVEL MILES",
            numeric: true,
            cell: (t) => t.travelMiles.toLocaleString(),
          },
          {
            label: "BACK-TO-BACKS",
            unit: "GAMES · 1ST = MOST",
            numeric: true,
            cell: (t, i) => (
              <>
                {t.backToBacks}
                {b2bRanks[i] !== null ? (
                  <RankBadge
                    rank={b2bRanks[i]}
                    of={byMiles.length}
                    population="teams"
                  />
                ) : null}
              </>
            ),
          },
          {
            label: "3-IN-4",
            unit: "GAMES · 1ST = MOST",
            numeric: true,
            cell: (t, i) => (
              <>
                {t.threeInFours}
                {threeInFourRanks[i] !== null ? (
                  <RankBadge
                    rank={threeInFourRanks[i]}
                    of={byMiles.length}
                    population="teams"
                  />
                ) : null}
              </>
            ),
          },
          {
            label: "TIME-ZONE SHIFT",
            unit: "GAMES",
            numeric: true,
            cell: (t) => t.jetLagGames,
          },
        ]}
      />
    </div>
  );
}

function FatigueCalendar({ weeks }: { weeks: SeasonReportWeek[] }) {
  const [index, setIndex] = useState(0);
  const selected = weeks[Math.min(index, weeks.length - 1)];
  if (!selected) return <p>No completed-game fatigue measurements yet.</p>;
  const peak = weeks.reduce<SeasonReportWeek | null>(
    (best, w) => (best === null || w.avgFatigue > best.avgFatigue ? w : best),
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider
        label="Fatigue calendar"
        descriptor="Completed games · weekly average"
      />
      <p
        style={{
          fontSize: TYPE.body,
          color: "var(--term-text-muted)",
          maxWidth: WIDTH.prose,
          lineHeight: LEAD.body,
        }}
      >
        Average fatigue score across teams and games each week. Peaks show
        stretches with higher combined workload, travel, and schedule density.
      </p>
      {peak ? (
        <p
          className="mono"
          style={{ fontSize: 11, color: "var(--term-text-muted)" }}
        >
          PEAK: WEEK {peak.week} OF {weeks.length}, FROM {peak.startDate}, AT{" "}
          {peak.avgFatigue.toFixed(2)}
        </p>
      ) : null}
      <label className="flex flex-col gap-2 text-[15px]">
        Inspect week {selected.week}: {selected.startDate} ·{" "}
        {selected.avgFatigue.toFixed(2)} fatigue score · {selected.games} games
        <input
          aria-label="Inspect fatigue week"
          type="range"
          min={0}
          max={weeks.length - 1}
          value={Math.min(index, weeks.length - 1)}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="min-h-11 w-full"
        />
      </label>
      <div
        data-testid="fatigue-calendar"
        style={{ ...termCardStyle, height: 220, padding: 12 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={weeks}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          >
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              ticks={weeks
                .filter(
                  (_, i) => i % Math.max(1, Math.ceil(weeks.length / 6)) === 0,
                )
                .map((w) => w.week)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              width={32}
            />
            <Bar
              dataKey="avgFatigue"
              fill="var(--term-hardwood)"
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ScheduleWorkload({ season }: { season: string }) {
  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  return (
    <section className="flex flex-col gap-6" aria-busy={isLoading}>
      {error ? (
        <p role="status">
          Workload refresh unavailable
          {data ? "; showing the last loaded report." : ". Try again later."}
        </p>
      ) : null}
      {isLoading ? (
        <div
          className="h-24 bg-[var(--term-surface-2)]"
          aria-label="Loading schedule workload"
        />
      ) : null}
      {data && data.teams.length > 0 ? (
        <>
          <details className="fc-disclosure">
            <summary>Show travel and workload</summary>
            <div className="pt-4">
              <ScheduleTax teams={data.teams} basis={data.basis} />
            </div>
          </details>
          <FatigueCalendar key={season} weeks={data.weeks} />
        </>
      ) : !isLoading && !error ? (
        <p>No workload data for this season.</p>
      ) : null}
    </section>
  );
}
