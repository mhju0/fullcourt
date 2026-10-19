import { sql } from "drizzle-orm";
import type * as Schema from "@/lib/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { isHeldGame } from "@/lib/game-status";
import type { ScoreUpdate } from "@/lib/espn-scoreboard";
import { FATIGUE_RECENT_LOOKBACK_DAYS } from "@/lib/fatigue";

type AppDb = NodePgDatabase<typeof Schema>;

/** Both score writers use the same locks, transition checks and derived-cache invalidation. */
export async function writeGameStatus(appDb: AppDb, update: ScoreUpdate, deadlineMs = Date.now() + 4_000): Promise<{ written: boolean; invalidated: number }> {
  if (!update.expectedIdentity) throw new Error("status write requires reconciled fixture identity");
  const expected = update.expectedIdentity;
  return appDb.transaction(async tx => {
    const remaining = Math.min(1_500, deadlineMs - Date.now());
    if (remaining <= 0) throw new Error("status write budget exhausted");
    await tx.execute(sql`select set_config('lock_timeout', ${remaining + 'ms'}, true), set_config('statement_timeout', ${remaining + 'ms'}, true)`);
    const { rows: [identity] } = await tx.execute(sql`select g.date::text, g.home_team_id, g.away_team_id, h.abbreviation as home_abbr, a.abbreviation as away_abbr from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id where g.id = ${update.gameId}`);
    if (!identity) return { written: false, invalidated: 0 };
    if (identity.date !== expected.date || identity.home_abbr !== expected.homeAbbr || identity.away_abbr !== expected.awayAbbr) {
      throw new Error("reconciled fixture identity no longer matches stored game");
    }
    // IDs are immutable; even a reschedule cannot invert the shared lock order.
    const { rows: locked } = await tx.execute(sql`
      select g.id from games g join games source on source.id = ${update.gameId}
      where g.id = source.id or (
        g.status = 'scheduled' and g.tip_off_utc > clock_timestamp()
        and g.date > source.date and g.date <= source.date + ${FATIGUE_RECENT_LOOKBACK_DAYS}::int
        and (g.home_team_id in (source.home_team_id, source.away_team_id)
          or g.away_team_id in (source.home_team_id, source.away_team_id)))
      order by g.id for update of g
    `);
    if (!locked.length) return { written: false, invalidated: 0 };
    // A separate statement observes any status committed while the lock statement waited.
    const { rows: [source] } = await tx.execute(sql`select status, date::text, home_team_id, away_team_id from games where id = ${update.gameId}`);
    if (!source || source.date !== identity.date || source.home_team_id !== identity.home_team_id || source.away_team_id !== identity.away_team_id) {
      throw new Error("game identity changed during status write; retry after maintenance");
    }
    const before = String(source.status);
    if ((before === "final" && update.status !== "final") ||
        (isHeldGame(before) && (update.status === "scheduled" || update.status === "live")) ||
        (before === "cancelled" && update.status === "postponed")) return { written: false, invalidated: 0 };
    await tx.execute(sql`update games set status = ${update.status},
      home_score = ${update.status === "final" ? update.homeScore : null},
      away_score = ${update.status === "final" ? update.awayScore : null},
      overtime_periods = coalesce(${update.overtimePeriods}::int, overtime_periods)
      where id = ${update.gameId} and (${update.status} = 'final' or status <> 'final')`);
    let invalidated = 0;
    if (before !== update.status && (isHeldGame(before) || isHeldGame(update.status))) {
      const affectedIds = locked.map(row => Number(row.id)).filter(id => id !== update.gameId);
      if (affectedIds.length) {
        const ids = sql.join(affectedIds.map(id => sql`${id}`), sql`, `);
        // Recheck the clock after waiting. No played or already tipped forecast is changed.
        const { rows: removed } = await tx.execute(sql`delete from fatigue_scores f using games g
          where f.game_id = g.id and g.id in (${ids}) and g.status = 'scheduled'
          and g.tip_off_utc > clock_timestamp() returning f.game_id`);
        await tx.execute(sql`delete from predictions p using games g
          where p.game_id = g.id and g.id in (${ids}) and g.status = 'scheduled'
          and g.tip_off_utc > clock_timestamp() and p.actual_winner_id is null`);
        invalidated = new Set(removed.map(row => Number(row.game_id))).size;
      }
    }
    return { written: true, invalidated };
  }, { isolationLevel: "read committed" });
}
