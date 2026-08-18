/**
 * Game context ingest — overtime periods, tip-off time, neutral-site flag.
 *
 * Three fatigue inputs, one ESPN scoreboard call per game date:
 *
 *   overtime_periods — `linescores.length - 4`. The column has existed since
 *     migration 0002 but was NEVER populated: its only loader,
 *     scripts/nba_ot_periods.py, reads stats.nba.com, which is unreachable from
 *     here and from CI (docs/audit + memory: cdn.nba.com 403s, stats.nba.com
 *     times out). Every one of the 49,353 games in the DB reads 0 OT periods, so
 *     the model's overtime term has never once fired.
 *   tip_off_utc    — `competitions[0].date`, the real tip instant.
 *   neutral_site   — `competitions[0].neutralSite`.
 *
 * ESPN is used for the same reason the referee pipeline uses it: it is reachable.
 * Coverage begins around 2002; earlier seasons keep their defaults and are a
 * documented model limitation, not a bug.
 *
 * Scoreboard responses are cached in the SAME directory as fetch_officials.ts and
 * under the same `sb-YYYYMMDD.json` name, so dates that script already pulled cost
 * no HTTP at all here.
 *
 * Prerequisite: drizzle/0011_games_tip_off_neutral_site.sql applied.
 *
 * Usage:
 *   npx tsx scripts/fetch_game_context.ts                          # all seasons from FIRST_SEASON
 *   npx tsx scripts/fetch_game_context.ts 2024-10-01 2025-06-30    # date range
 *   npx tsx scripts/fetch_game_context.ts --dry-run                # report only, write nothing
 *   npx tsx scripts/fetch_game_context.ts <from> <to> --refresh    # ignore cached scoreboards
 *
 * `--refresh` matters for recent dates: a scoreboard cached while a game was still in
 * progress has no final line score, so the daily run must re-fetch rather than trust it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

// Shared with scripts/sync_scores_espn.ts, which matches ESPN events to stored rows on the
// same (date, away, home) key. Two copies of this map would silently match two different
// sets of games.
import { toOurAbbr } from "@/lib/espn-scoreboard";

/** ESPN's NBA coverage thins out before this; earlier seasons keep column defaults. */
const FIRST_SEASON = "2002-03";
const CACHE_DIR = "ml/data/officials";
const CONCURRENCY = 10;

/** Run fn over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

async function fetchJsonCached(
  url: string,
  cacheFile: string,
  refresh: boolean
): Promise<unknown> {
  const path = `${CACHE_DIR}/${cacheFile}`;
  if (!refresh && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = await res.text();
  JSON.parse(body); // never cache a non-JSON error page
  writeFileSync(path, body);
  return JSON.parse(body);
}

interface Context {
  /** Null when ESPN carries no line score — distinct from a known 0 OT periods. */
  overtimePeriods: number | null;
  tipOffUtc: string | null;
  neutralSite: boolean;
  /** City of a neutral-site game; null for ordinary home games. */
  neutralVenueCity: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */
function parseEvent(comp: any): { key: string; ctx: Context } | null {
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!home || !away) return null;

  // Both sides list every period played; take the longer in case one is truncated.
  const periods = Math.max(
    (home.linescores ?? []).length,
    (away.linescores ?? []).length
  );

  return {
    key: `${toOurAbbr(String(away.team.abbreviation))}@${toOurAbbr(String(home.team.abbreviation))}`,
    ctx: {
      overtimePeriods: periods >= 4 ? periods - 4 : null,
      tipOffUtc: comp.date ? String(comp.date) : null,
      neutralSite: Boolean(comp.neutralSite),
      neutralVenueCity:
        comp.neutralSite && comp.venue?.address?.city
          ? String(comp.venue.address.city)
          : null,
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const dates_ = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dryRun = flags.includes("--dry-run");
  const refresh = flags.includes("--refresh");
  const [from, to] = dates_;
  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });

  const rows = await sql<
    { id: number; date: string; season: string; home: string; away: string }[]
  >`
    -- ::text is load-bearing: postgres.js hydrates date columns as JS Date objects,
    -- so String(row.date) yields "Sun Dec 21 2014 09:00:00 GMT+0900", not "2014-12-21".
    select g.id, g.date::text as date, g.season, ht.abbreviation home, at.abbreviation away
    from games g
    join teams ht on ht.id = g.home_team_id
    join teams at on at.id = g.away_team_id
    where g.status = 'final' and g.season >= ${FIRST_SEASON}
      ${from ? sql`and g.date >= ${from}` : sql``}
      ${to ? sql`and g.date <= ${to}` : sql``}
    order by g.date`;

  const byDate = new Map<string, typeof rows>();
  for (const g of rows) {
    const d = String(g.date);
    if (!byDate.has(d)) byDate.set(d, [] as unknown as typeof rows);
    byDate.get(d)!.push(g);
  }
  const dates = [...byDate.keys()].sort();
  console.log(`${rows.length} final games across ${dates.length} dates, ${FIRST_SEASON}+`);

  const updates: Array<{ id: number } & Context> = [];
  let unmatched = 0;
  let errors = 0;
  let done = 0;

  await pool(dates, CONCURRENCY, async (date) => {
    const compact = date.replaceAll("-", "");
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const sb: any = await fetchJsonCached(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`,
        `sb-${compact}.json`,
        refresh
      );
      const events = new Map<string, Context>();
      for (const ev of sb?.events ?? []) {
        const parsed = parseEvent(ev?.competitions?.[0]);
        if (parsed) events.set(parsed.key, parsed.ctx);
      }
      for (const g of byDate.get(date)!) {
        const ctx = events.get(`${g.away}@${g.home}`);
        if (ctx) updates.push({ id: g.id, ...ctx });
        else unmatched++;
      }
    } catch (e) {
      errors++;
      console.log(`[ERROR] ${date}: ${e instanceof Error ? e.message : e}`);
    }
    if (++done % 250 === 0) console.log(`  ${done}/${dates.length} dates`);
  });

  const withOt = updates.filter((u) => (u.overtimePeriods ?? 0) > 0);
  const noLine = updates.filter((u) => u.overtimePeriods === null);
  console.log(
    `matched ${updates.length}, unmatched ${unmatched}, date errors ${errors}\n` +
      `  overtime games: ${withOt.length} (max ${Math.max(0, ...withOt.map((u) => u.overtimePeriods!))} OT)\n` +
      `  no line score (OT left as-is): ${noLine.length}\n` +
      `  neutral-site games: ${updates.filter((u) => u.neutralSite).length}\n` +
      `  tip-off times: ${updates.filter((u) => u.tipOffUtc).length}`
  );

  if (dryRun) {
    console.log("--dry-run: no rows written");
    await sql.end();
    return;
  }

  // Chunked UPDATE ... FROM (values …); OT is left untouched where ESPN had no line score.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const res = await sql`
      update games g set
        overtime_periods = coalesce(v.ot::int, g.overtime_periods),
        tip_off_utc = v.tip::timestamptz,
        neutral_site = v.neutral::boolean,
        neutral_venue_city = v.city::varchar
      from (values ${sql(
        chunk.map(
          (u) =>
            [u.id, u.overtimePeriods, u.tipOffUtc, u.neutralSite, u.neutralVenueCity] as const
        )
      )}) as v(id, ot, tip, neutral, city)
      where g.id = v.id::int`;
    written += res.count ?? chunk.length;
    if (i % (CHUNK * 10) === 0) console.log(`  wrote ${written}/${updates.length}`);
  }
  console.log(`done — ${written} rows updated`);
  await sql.end();
}

main();
