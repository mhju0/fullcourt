import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as Schema from "@/lib/db/schema";

type AppDb = NodePgDatabase<typeof Schema>;

/**
 * Records the winner on every prediction for a final game. The stored score is the
 * source of truth, so a later score correction regrades the pick. Ties and missing
 * scores stay open.
 */
export async function gradeFinishedPredictions(appDb: AppDb): Promise<number> {
  const { rows } = await appDb.execute(sql`
    update predictions p
    set actual_winner_id = case when g.home_score > g.away_score then g.home_team_id else g.away_team_id end
    from games g
    where g.id = p.game_id and g.status = 'final'
      and g.home_score is not null and g.away_score is not null and g.home_score <> g.away_score
      and p.actual_winner_id is distinct from
        (case when g.home_score > g.away_score then g.home_team_id else g.away_team_id end)
    returning p.id`);
  return rows.length;
}
