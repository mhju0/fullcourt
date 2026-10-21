import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { getTeamDirectory } from "@/lib/db/queries";
import { buildSeasonReadiness } from "@/lib/season-readiness";

export async function getSeasonReadiness(season: string) {
  // Operational GP counts physical regular-season appearances, including neutral games.
  // It deliberately differs from publishableGames' analytical regime and fatigue cohorts.
  // Sequential: one connection in production (pool.ts).
  const rows = await db.select({
    gameId: games.id,
    date: games.date,
    status: games.status,
    homeTeamId: games.homeTeamId,
    awayTeamId: games.awayTeamId,
    homeScore: games.homeScore,
    awayScore: games.awayScore,
  }).from(games).where(and(eq(games.season, season), eq(games.gameType, "regular")));
  const directory = await getTeamDirectory();
  return buildSeasonReadiness(season, rows, directory);
}
