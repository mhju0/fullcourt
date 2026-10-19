import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as Schema from "./db/schema";
import { fatigueScores, predictions } from "./db/schema";
import { buildPrediction, toFatigueScoreWrite, type DailyRefreshGame, type ProspectiveRefreshPort, type ProspectiveRefreshResult } from "./daily-refresh";
import { FATIGUE_RECENT_LOOKBACK_DAYS, scoreGameFatigue, type FatigueTeam } from "./fatigue";
import { neutralizeIfUnplayed, rowToRecentGame, type PriorGameRow } from "./fatigue-recent-games";

type AppDb = NodePgDatabase<typeof Schema>;
type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
type Raw = Record<string, unknown>;
type Snapshot = {
  game: Raw;
  home: Raw;
  away: Raw;
  priors: Raw[];
  complete_pair: boolean;
  pre_tip: boolean;
};

class RefreshSkipped extends Error {}

function team(row: Raw): FatigueTeam {
  return {
    id: Number(row.id),
    abbreviation: String(row.abbreviation),
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    altitudeFlag: Boolean(row.altitude_flag),
  };
}

function prior(row: Raw): PriorGameRow & { status: string } {
  return {
    date: String(row.date),
    homeTeamId: Number(row.home_team_id),
    awayTeamId: Number(row.away_team_id),
    homeAbbr: String(row.home_abbr),
    awayAbbr: String(row.away_abbr),
    homeLat: String(row.home_lat),
    homeLon: String(row.home_lon),
    homeAltitude: Boolean(row.home_altitude),
    awayLat: String(row.away_lat),
    awayLon: String(row.away_lon),
    awayAltitude: Boolean(row.away_altitude),
    overtimePeriods: Number(row.overtime_periods),
    status: String(row.status),
    tipOffUtc: row.tip_off_utc ? new Date(String(row.tip_off_utc)) : null,
    homeScore: row.home_score == null ? null : Number(row.home_score),
    awayScore: row.away_score == null ? null : Number(row.away_score),
    neutralSite: Boolean(row.neutral_site),
    neutralVenueCity: row.neutral_venue_city as string | null,
  };
}

function targetGame(row: Raw): DailyRefreshGame {
  return {
    id: Number(row.id),
    date: String(row.date),
    homeTeamId: Number(row.home_team_id),
    awayTeamId: Number(row.away_team_id),
    status: String(row.status),
    tipOffUtc: new Date(String(row.tip_off_utc)),
    neutralSite: Boolean(row.neutral_site),
    neutralVenueCity: row.neutral_venue_city as string | null,
  };
}

/** Automated prospective writers must enter with an ID; no precomputed write crosses this boundary. */
export function createDailyRefreshPort(appDb: AppDb): ProspectiveRefreshPort {
  return {
    async refreshGame(gameId, options = {}): Promise<ProspectiveRefreshResult> {
      try {
        return await appDb.transaction(async (tx) => {
          const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + 4_000);
          const remaining = deadlineMs - Date.now();
          if (remaining <= 0) throw new RefreshSkipped("budget exhausted");
          await tx.execute(sql`select set_config('lock_timeout', ${String(Math.min(1_500, remaining)) + 'ms'}, true), set_config('statement_timeout', ${String(Math.min(1_500, remaining)) + 'ms'}, true)`);
          // A statement begun before a lock wait retains its old snapshot. Finish the lock first.
          const { rows: locked } = await tx.execute(sql`select id from games where id = ${gameId} for update`);
          if (locked.length === 0) throw new RefreshSkipped("missing game");
          const { rows } = await tx.execute(sql`
            select to_jsonb(g) as game, to_jsonb(h) as home, to_jsonb(a) as away,
              g.status = 'scheduled' and g.tip_off_utc > clock_timestamp() as pre_tip,
              exists(select 1 from fatigue_scores f where f.game_id = g.id and f.team_id = g.home_team_id)
              and exists(select 1 from fatigue_scores f where f.game_id = g.id and f.team_id = g.away_team_id) as complete_pair,
              coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
                'home_abbr', ph.abbreviation, 'away_abbr', pa.abbreviation,
                'home_lat', ph.latitude, 'home_lon', ph.longitude, 'home_altitude', ph.altitude_flag,
                'away_lat', pa.latitude, 'away_lon', pa.longitude, 'away_altitude', pa.altitude_flag
              ) order by p.date, p.id)
              from games p join teams ph on ph.id = p.home_team_id join teams pa on pa.id = p.away_team_id
              where p.date >= g.date - ${FATIGUE_RECENT_LOOKBACK_DAYS}::int and p.date < g.date
                and p.status in ('final', 'scheduled', 'live')
                and (p.home_team_id in (g.home_team_id, g.away_team_id) or p.away_team_id in (g.home_team_id, g.away_team_id))), '[]'::jsonb) as priors
            from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id where g.id = ${gameId}
          `);
          const snapshot = rows[0] as unknown as Snapshot | undefined;
          if (!snapshot) throw new RefreshSkipped("missing team");
          if (!snapshot.pre_tip) throw new RefreshSkipped("not scheduled before known tip");
          if (options.onlyIfMissing && snapshot.complete_pair) throw new RefreshSkipped("complete pair already exists");
          const game = targetGame(snapshot.game);
          const priors = snapshot.priors.map(prior).map(neutralizeIfUnplayed);
          const recent = (id: number) => priors
            .filter(p => p.homeTeamId === id || p.awayTeamId === id)
            .map(p => rowToRecentGame(p, id));
          const result = scoreGameFatigue({
            game,
            homeTeam: team(snapshot.home),
            awayTeam: team(snapshot.away),
            homeRecentGames: recent(game.homeTeamId),
            awayRecentGames: recent(game.awayTeamId),
          });
          const pair = [
            toFatigueScoreWrite(game.homeTeamId, result.home),
            toFatigueScoreWrite(game.awayTeamId, result.away),
          ];
          const prediction = buildPrediction(game, Number(pair[0].score), Number(pair[1].score));
          const checkClock = async () => {
            const { rows: [check] } = await tx.execute(sql`select tip_off_utc > clock_timestamp() as pre_tip, extract(epoch from clock_timestamp()) * 1000 as clock_ms from games where id = ${gameId}`);
            if (!check?.pre_tip) throw new RefreshSkipped("tip crossed during refresh");
            if (Number(check.clock_ms) >= deadlineMs) throw new RefreshSkipped("budget exhausted");
          };
          await checkClock();
          await tx.delete(fatigueScores).where(eq(fatigueScores.gameId, gameId));
          await tx.insert(fatigueScores).values(pair.map(row => ({ gameId, ...row })));
          await checkClock();
          await tx.delete(predictions).where(and(eq(predictions.gameId, gameId), isNull(predictions.actualWinnerId)));
          await checkClock();
          let predictionRowsWritten = 0;
          if (prediction) {
            const { rows: inserted } = await tx.execute(sql`insert into predictions (game_id, predicted_advantage_team_id, rest_advantage_differential, actual_winner_id)
              select ${gameId}, ${prediction.predictedAdvantageTeamId}, ${prediction.restAdvantageDifferential}, null
              where not exists(select 1 from predictions where game_id = ${gameId} and actual_winner_id is not null) returning id`);
            predictionRowsWritten = inserted.length;
          }
          await checkClock();
          return { status: "refreshed", predictionRowsWritten };
        }, { isolationLevel: "read committed" });
      } catch (error) {
        if (error instanceof RefreshSkipped) return {
          status: error.message === "budget exhausted" ? "deferred" : "skipped",
          reason: error.message,
        };
        throw error;
      }
    },
  };
}

export function adjacentEasternDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Recovery is selected from stored finals, independently of what this invocation fetched. */
export async function selectRecoveryGameIds(appDb: AppDb, today: string, season: string, deadlineMs = Date.now() + 4_000): Promise<number[]> {
  const tomorrow = adjacentEasternDateKey(today, 1);
  const { rows } = await withCronDbDeadline(appDb, deadlineMs, tx => tx.execute(sql`
    with next_games as (
      select g.*, side.team_id, row_number() over(partition by side.team_id order by g.tip_off_utc, g.id) as position
      from games g cross join lateral (values(g.home_team_id), (g.away_team_id)) side(team_id)
      where g.season = ${season} and g.status = 'scheduled' and g.tip_off_utc > clock_timestamp()
    ), candidates as (
      select distinct n.id, n.tip_off_utc from next_games n
      where (not exists(select 1 from fatigue_scores f where f.game_id = n.id and f.team_id = n.home_team_id)
        or not exists(select 1 from fatigue_scores f where f.game_id = n.id and f.team_id = n.away_team_id))
        or (n.position = 1 and n.date in (${today}::date, ${tomorrow}::date)
      and exists(select 1 from games p where p.status = 'final' and p.date < n.date
        and p.date >= n.date - ${FATIGUE_RECENT_LOOKBACK_DAYS}::int
        and (p.home_team_id = n.team_id or p.away_team_id = n.team_id)))
    )
    select c.id from candidates c left join fatigue_scores f on f.game_id = c.id
    group by c.id, c.tip_off_utc order by min(f.computed_at) nulls first, c.tip_off_utc, c.id
  `));
  return rows.map(row => Number(row.id));
}

export function gamesToRescoreAfterFinals<T extends DailyRefreshGame>(input: {
  finalizedTeamIds: ReadonlySet<number>; upcoming: readonly T[]; now: Date;
}): T[] {
  const ordered = input.upcoming.filter(game => game.status === "scheduled" && game.tipOffUtc != null && game.tipOffUtc.getTime() > input.now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const served = new Set<number>();
  const picked: T[] = [];
  for (const game of ordered) {
    const sides = [game.homeTeamId, game.awayTeamId].filter(id => input.finalizedTeamIds.has(id) && !served.has(id));
    if (!sides.length) continue;
    sides.forEach(id => served.add(id));
    picked.push(game);
  }
  return picked;
}

export async function withCronDbDeadline<T>(
  appDb: AppDb,
  deadlineMs: number,
  work: (tx: AppTx) => Promise<T>,
): Promise<T> {
  if (Date.now() >= deadlineMs) throw new Error("cron database budget exhausted");
  return appDb.transaction(async tx => {
    const remaining = Math.min(1_500, deadlineMs - Date.now());
    if (remaining <= 0) throw new Error("cron database budget exhausted");
    await tx.execute(sql`select set_config('statement_timeout', ${String(remaining) + 'ms'}, true), set_config('lock_timeout', ${String(remaining) + 'ms'}, true)`);
    return work(tx);
  });
}
