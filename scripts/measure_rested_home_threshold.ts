import { writeFile } from 'node:fs/promises';
import { loadEnvLocal } from '@/lib/load-env-local';
import { classifyRestAdvantage, isCalledSide } from '@/lib/rest-advantage-evidence';

async function main() {
  loadEnvLocal();
  const { getCompletedGamesWithFatigue } = await import('@/lib/db/queries');
  const rows = await getCompletedGamesWithFatigue();
  const perSeason = [...new Set(rows.map(row => row.season))].sort().map(season => {
    const all = rows.filter(row => row.season === season).sort((a, b) => a.date.localeCompare(b.date));
    const rested = all.filter(row => isCalledSide(classifyRestAdvantage(
      Number(row.homeFatigueScore), Number(row.awayFatigueScore)).advantageTeam));
    const thresholdDate = rested[99]?.date ?? null;
    return { season, firstEligibleGame: all[0].date, thresholdDate,
      elapsedDays: thresholdDate === null ? null :
        (Date.parse(thresholdDate) - Date.parse(all[0].date)) / 86400000 };
  });
  function summarize(seasons: typeof perSeason) {
    const days = seasons.map(row => row.elapsedDays).filter((day): day is number => day !== null).sort((a, b) => a-b);
    const n = days.length;
    return { seasons: n, mean: n ? days.reduce((a, b) => a+b, 0)/n : null,
      median: n ? (n % 2 ? days[Math.floor(n/2)] : (days[n/2-1]+days[n/2])/2) : null,
      min: days[0] ?? null, max: days.at(-1) ?? null };
  }
  const result = { generatedAt: new Date().toISOString(),
    definition: 'Elapsed calendar days from first FullCourt eligible game date to date of 100th rested-home game; opening date is day 0. Canonical classification, final regular-season query, both fatigue records required.',
    all: summarize(perSeason), last10: summarize(perSeason.slice(-10)), last5: summarize(perSeason.slice(-5)), perSeason };
  await writeFile('docs/research/2026-09-11-rested-home-threshold.json', JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify({ all: result.all, last10: result.last10, last5: result.last5 }));
}
main().catch(error => { console.error(error); process.exitCode=1; });
