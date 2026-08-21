/**
 * Referee Effect — playoff extension of the officials cache.
 *
 * `scripts/fetch_officials.ts` walks the database's **regular-season** games, so the cache under
 * `ml/data/officials/` holds no postseason summary at all. That is a real limit on the referee
 * analysis: the loudest public claims about officials ("this referee and that star never win
 * together") are *playoff* claims, and they cannot be tested against a regular-season-only corpus.
 *
 * This script closes that gap and nothing else. It needs **no database and no scoreboard fetches**
 * — the date scoreboards already cached by `fetch_officials.ts` cover April through June for every
 * season, so the postseason events are enumerated straight off disk (`season.type === 3`,
 * `STATUS_FINAL`) and only the missing `ev-<id>.json` summaries are pulled.
 *
 * Everything it writes lands in the same gitignored cache, under the same filenames, in the same
 * shape, so `ml/extract_referee_corpus.py` picks the games up with no change: that extractor
 * already records `season_type`, and every analysis filters on it explicitly.
 *
 * Usage: npx tsx scripts/fetch_playoff_officials.ts [--limit N]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const CACHE_DIR = "ml/data/officials";
const CONCURRENCY = 8;
/** ESPN's `season.year` is the year the season ends: 2016 is 2015-16, matching the cached corpus. */
const FIRST_SEASON_YEAR = 2016;
const LAST_SEASON_YEAR = 2026;

/** Run fn over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    })
  );
}

interface PlayoffEvent {
  id: string;
  seasonYear: number;
  date: string;
  headline: string;
}

/** Read every cached date scoreboard and pull out the finished postseason games. */
function enumerateFromCache(): PlayoffEvent[] {
  const seen = new Map<string, PlayoffEvent>();
  for (const file of readdirSync(CACHE_DIR)) {
    if (!file.startsWith("sb-") || !file.endsWith(".json")) continue;
    let payload: any;
    try {
      payload = JSON.parse(readFileSync(`${CACHE_DIR}/${file}`, "utf8"));
    } catch {
      continue; // a truncated cache entry is skipped, not fatal
    }
    for (const event of payload?.events ?? []) {
      const season = event?.season ?? {};
      if (Number(season.type) !== 3) continue;
      const year = Number(season.year);
      if (!(year >= FIRST_SEASON_YEAR && year <= LAST_SEASON_YEAR)) continue;
      if (event?.status?.type?.name !== "STATUS_FINAL") continue;
      const id = String(event.id);
      const notes = event?.competitions?.[0]?.notes ?? [];
      seen.set(id, {
        id,
        seasonYear: year,
        date: String(event.date ?? "").slice(0, 10),
        headline: String(notes[0]?.headline ?? ""),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 0;

  const all = enumerateFromCache();
  const missing = all.filter((e) => !existsSync(`${CACHE_DIR}/ev-${e.id}.json`));
  const todo = limit > 0 ? missing.slice(0, limit) : missing;

  const bySeason = new Map<number, number>();
  for (const e of all) bySeason.set(e.seasonYear, (bySeason.get(e.seasonYear) ?? 0) + 1);
  console.log(`postseason games in cached scoreboards: ${all.length}`);
  console.log(
    "  per season: " +
      [...bySeason.entries()].sort().map(([y, n]) => `${y - 1}-${String(y).slice(2)}:${n}`).join(" ")
  );
  console.log(`already cached: ${all.length - missing.length}; fetching ${todo.length}`);

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];
  await pool(todo, CONCURRENCY, async (event, i) => {
    const path = `${CACHE_DIR}/ev-${event.id}.json`;
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${event.id}`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const parsed = JSON.parse(body); // never cache a non-JSON error page
      if (!parsed?.header?.id) throw new Error("payload has no header.id");
      writeFileSync(path, body);
      ok++;
    } catch (e) {
      failed++;
      errors.push(`${event.date} ${event.id}: ${e instanceof Error ? e.message : e}`);
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${todo.length} fetched`);
  });

  console.log(`done. wrote ${ok}, failed ${failed}`);
  for (const line of errors.slice(0, 20)) console.log(`  [ERROR] ${line}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
