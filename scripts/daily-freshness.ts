import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as Schema from "@/lib/db/schema";
import { withCronDbDeadline } from "@/lib/daily-refresh-port";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type AppDb = NodePgDatabase<typeof Schema>;
type FreshnessRow = {
  observed_at: string; session_timezone: string; eligible_games: number | string;
  present_rows: number | string; missing_rows: number | string;
  oldest_computed_at: string | null; latest_computed_at: string | null;
  oldest_age_seconds: number | string | null; latest_age_seconds: number | string | null;
};

export function freshnessFromRow(row: FreshnessRow, from: string, to: string) {
  const utc = row.session_timezone === "UTC" || row.session_timezone === "Etc/UTC";
  const count = (value: number | string) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const eligible = count(row.eligible_games);
  const present = count(row.present_rows);
  const missing = count(row.missing_rows);
  const rawAges = [row.oldest_age_seconds, row.latest_age_seconds];
  const future = rawAges.some(value => value != null && Number(value) < 0);
  const invalidCounts = eligible == null || present == null || missing == null || eligible * 2 !== present + missing;
  const invalidAges = rawAges.some(value => value != null && !Number.isFinite(Number(value)))
    || (present != null && present > 0 && rawAges.some(value => value == null));
  const reason = invalidCounts ? "invalid_counts" : future ? "future_computed_at" : invalidAges ? "invalid_age"
    : !utc ? "non_utc_session" : "unverified_historical_timezone";
  const unknown = invalidCounts || future || invalidAges || !utc;
  const age = (value: number | string | null) => !unknown && value != null ? Math.floor(Number(value)) : null;
  return {
    status: unknown ? "unknown" : eligible === 0 ? "no_data" : missing! > 0 ? "incomplete" : "estimated",
    reason,
    scope: "latest fatigue row for each side of scheduled games before known future tip",
    window_from_et: from, window_to_et: to, observed_at: row.observed_at,
    session_timezone: row.session_timezone,
    timestamp_interpretation: "stored timestamp interpreted as UTC; historical writer session timezone unverified",
    eligible_games: eligible, expected_rows: eligible == null ? null : eligible * 2, present_rows: present, missing_rows: missing,
    oldest_computed_at: row.oldest_computed_at, latest_computed_at: row.latest_computed_at,
    oldest_age_seconds: age(row.oldest_age_seconds), latest_age_seconds: age(row.latest_age_seconds),
  };
}

export async function readDailyFreshness(appDb: AppDb, from: string, to: string) {
  const { rows } = await withCronDbDeadline(appDb, Date.now() + 2_000, tx => tx.execute(sql`
    with observation as materialized (select clock_timestamp() as observed_at),
    eligible as (
      select g.id, g.home_team_id, g.away_team_id from games g cross join observation o
      where g.date >= ${from}::date and g.date <= ${to}::date
        and g.status = 'scheduled' and g.tip_off_utc > o.observed_at
    ), latest as (
      select g.id, side.team_id, f.computed_at
      from eligible g cross join lateral (values(g.home_team_id), (g.away_team_id)) side(team_id)
      left join lateral (
        select fs.computed_at from fatigue_scores fs
        where fs.game_id = g.id and fs.team_id = side.team_id
        order by fs.computed_at desc limit 1
      ) f on true
    )
    select to_char((select observed_at from observation) at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as observed_at,
      current_setting('TimeZone') as session_timezone,
      count(distinct id)::int as eligible_games,
      count(computed_at)::int as present_rows,
      (count(*) - count(computed_at))::int as missing_rows,
      min(computed_at)::text as oldest_computed_at,
      max(computed_at)::text as latest_computed_at,
      extract(epoch from ((select observed_at from observation)::timestamp - min(computed_at))) as oldest_age_seconds,
      extract(epoch from ((select observed_at from observation)::timestamp - max(computed_at))) as latest_age_seconds
    from latest
  `));
  return freshnessFromRow(rows[0] as unknown as FreshnessRow, from, to);
}

export async function reportDailyFreshness(appDb: AppDb, from: string, to: string): Promise<void> {
  let result: Record<string, unknown>;
  try {
    result = await readDailyFreshness(appDb, from, to);
  } catch {
    result = { status: "unknown", window_from_et: from, window_to_et: to };
  }
  const directory = process.env.DAILY_STAGE_SUMMARY_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "freshness.json"), JSON.stringify(result));
  }
  console.log(`[run-daily] scoped fatigue freshness: ${result.status}`);
}
