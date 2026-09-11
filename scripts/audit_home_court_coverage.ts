import { writeFile } from 'node:fs/promises';
import { loadEnvLocal } from '@/lib/load-env-local';
import { isNormallyPlayed } from '@/lib/season-regime';

async function main() {
  loadEnvLocal();
  const { db } = await import('@/lib/db');
  const { games } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select({season: games.season, date: games.date, status: games.status,
    homeScore: games.homeScore, awayScore: games.awayScore, neutralSite: games.neutralSite})
    .from(games).where(eq(games.gameType, 'regular'));
  const { getCompletedGamesWithFatigue } = await import('@/lib/db/queries');
  const eligible = await getCompletedGamesWithFatigue();
  const seasons = [...new Set(rows.map(r => r.season))].sort();
  const perSeason = seasons.map(season => {
    const all = rows.filter(r => r.season === season && isNormallyPlayed(r.season, r.date));
    const final = all.filter(r => r.status === 'final' && r.homeScore !== null && r.awayScore !== null);
    const matched = eligible.filter(r => r.season === season);
    const nonNeutral = final.filter(r => !r.neutralSite);
    const wins = (a: typeof final) => a.filter(r => r.homeScore! > r.awayScore!).length;
    return {season, scheduledRecords: all.length, finalScoredRecords: final.length,
      eligibleRecords: matched.length, missingFatigueRecords: final.length-matched.length,
      unfinishedRecords: all.filter(r => r.status !== 'final').length,
      flaggedNeutralGames: final.length-nonNeutral.length,
      allHomeWins: wins(final), eligibleHomeWins: matched.filter(r=>r.homeScore!>r.awayScore!).length,
      homeWinPct: final.length ? 100*wins(final)/final.length : null,
      excludingKnownNeutralHomeWinPct: nonNeutral.length ? 100*wins(nonNeutral)/nonNeutral.length : null};
  });
  const result = {generatedAt: new Date().toISOString(),
    method: 'Sequential read-only queries. Regular-season records outside canonical abnormal stretches; final and scored rows compared against getCompletedGamesWithFatigue(). Neutral flags are incomplete before 2013.',
    perSeason};
  await writeFile('docs/research/2026-09-11-home-court-coverage.json', JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({seasons: perSeason.length,
    finalScored: perSeason.reduce((s,r)=>s+r.finalScoredRecords,0),
    eligible: perSeason.reduce((s,r)=>s+r.eligibleRecords,0),
    missingFatigue: perSeason.filter(r=>r.missingFatigueRecords),
    neutralGames: perSeason.reduce((s,r)=>s+r.flaggedNeutralGames,0),
    lastFive: perSeason.slice(-5)},null,2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
