import { applyGameInputCorrection, espnScheduleGameType } from "@/lib/game-input-corrections";
import { mapEspnStatus } from "@/lib/espn-scoreboard";
/**
 * Seed an upcoming season's regular-season schedule into `games` from ESPN.
 *
 * This exists because on schedule-release day none of the project's normal ingest paths can
 * reach a source. `fetch_schedule.py` drives nba_api against stats.nba.com, which times out
 * from Seoul and from GitHub's runners; `fetch_nba_schedule_cdn.py` reads cdn.nba.com, which
 * answers 403 to both (Akamai blocks non-US and datacenter IPs alike, with or without browser
 * headers). ESPN's scoreboard is the one schedule source that answers, which is the same
 * reason `fetch_game_context.ts` and the referee pipeline use it.
 *
 * **`external_id` is `espn-<eventId>`, not a stats `002…` id.** The canonical ids are not
 * derivable — the NBA's game numbering is not date-ordered (2025-26 opens `0022500001`,
 * `0022500002`, then jumps to `0022500080` on night two) — and no reachable source carries
 * them. The `bref-` rows from the 2026-07-12 audit are the precedent for a non-stats key.
 * **"Not derivable" is true at release time only.** hoopR's `nba_stats_*` box scores carry the
 * canonical `002…` id and are reachable — measured 2026-08-18, its 2025-26 regular-season ids
 * match this database's `external_id` set exactly, 1,230 of 1,230 with none on either side. It
 * publishes games that have been *played*, so it is no help for a schedule released in August,
 * but it does mean a re-key becomes possible once the season is underway.
 *
 * Shooting joins hoopR's NBA IDs to canonical fixtures, with explicit reviewed aliases
 * for exceptional stored IDs. New ESPN-keyed seasons still need a reviewed ID mapping
 * or re-key before their cached shooting outcomes can be matched; missing fixtures fail
 * the producer's coverage guard. `scripts/seed_season_from_hoopr.ts` already has the
 * hoopR-to-ESPN fixture matching machinery.
 *
 * The nightly score path no longer does. `scripts/sync_scores_espn.ts` and `/api/cron/update`
 * both match on (date, away, home) through `src/lib/espn-scoreboard.ts`, so they maintain an
 * `espn-` row and an `002…` row identically and no re-keying is needed to keep this season
 * scored. That was the point of matching on the pairing rather than the id.
 *
 * The write is gated behind structural checks (§ validate) rather than trusted: a season is
 * only written if all 30 teams appear, every team has the same game count, no team is booked
 * twice on a date, and no existing row already holds the same (season, date, home, away). A
 * failure prints and writes nothing.
 *
 * **Do not run `backfill_fatigue.ts` over the season this seeds.** Fatigue is scored from a
 * team's *played* games — `fetchRecentGamesForTeam` selects `status = 'final'` — so a season
 * that has not started scores every team 0 with a null `days_since_last_game`. Those rows are
 * not harmless: `buildRestAdvantage` reads them as a measured dead heat and the Games board
 * prints EVEN for all 1,200 fixtures, while Schedule Disparity's `netFatigueEdge` reports a
 * measured 0 instead of "not measured". With no rows at all both correctly return null, and
 * `run-daily.ts` — which deletes and recomputes a date's rows rather than skipping scored ones
 * — fills each day in properly as it is played. The date-derived figures (back-to-back and
 * three-in-four edges) work off this seed alone and need no backfill.
 *
 * Only the **regular season** is seeded (`season.type === 2`); ESPN's TBD placeholders for the
 * NBA Cup knockout rounds carry no teams and are skipped. Expect 1,200 games at release, not
 * 1,230: the NBA publishes 80 of each team's 82 games and fills the last two in once Cup group
 * play resolves in December. Re-run then — the upsert is idempotent.
 *
 * Usage:
 *   pnpm exec tsx scripts/seed_upcoming_season_espn.ts 2026-27 --dry-run
 *   pnpm exec tsx scripts/seed_upcoming_season_espn.ts 2026-27
 *   pnpm exec tsx scripts/seed_upcoming_season_espn.ts 2026-27 --refresh   # ignore cached scoreboards
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { deduplicateSeedEvents, validateSeedScoreboard } from "./seed-season-contract";
import { pathToFileURL } from "node:url";

/** Shared with fetch_officials.ts / fetch_game_context.ts — same `sb-YYYYMMDD.json` names. */
const CACHE_DIR = "ml/data/officials";
const CONCURRENCY = 8;

/** ESPN scoreboard abbreviation → this project's abbreviation, where they differ. */
const ESPN_ABBR: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};
const toOurAbbr = (espn: string) => ESPN_ABBR[espn] ?? espn;

type SeedGame = {
  externalId: string;
  status: "scheduled" | "postponed" | "cancelled";
  date: string;
  home: string;
  away: string;
  tipOffUtc: string;
  neutralSite: boolean;
  neutralVenueCity: string | null;
  gameType: string;
  sourceStatus?: string;
};

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/** ET calendar date of a UTC instant — `games.date` is the NBA's scheduling day. */
const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function fetchScoreboard(dateKey: string, refresh: boolean, cacheDirectory = CACHE_DIR): Promise<unknown> {
  const compact = dateKey.replaceAll("-", "");
  const path = `${cacheDirectory}/sb-${compact}.json`;
  if (!refresh && existsSync(path)) {
    const cached: unknown = JSON.parse(readFileSync(path, "utf8"));
    validateSeedScoreboard(cached);
    return cached;
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`;
  // No User-Agent override on purpose: sending a browser UA is what trips Akamai's block
  // here (a plain request answers 200, `Mozilla/5.0` answers 403).
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const parsed: unknown = JSON.parse(body);
      validateSeedScoreboard(parsed);
      mkdirSync(cacheDirectory, { recursive: true });
      writeFileSync(path, body);
      return parsed;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Every calendar date from `from` to `to`, inclusive (YYYY-MM-DD). */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's payload is untyped upstream */
export function parseUpcomingSeedEvent(ev: any, seasonEndYear: number): SeedGame | null {
  if (ev?.season?.type !== 2 || Number(ev?.season?.year) !== seasonEndYear) return null;

  const comp = ev?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
  const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
  if (!home || !away) throw new Error("Malformed ESPN fixture: missing competitors");

  const homeAbbr = toOurAbbr(String(home.team?.abbreviation ?? ""));
  const awayAbbr = toOurAbbr(String(away.team?.abbreviation ?? ""));
  // The NBA Cup knockout rounds are published as TBD-vs-TBD placeholders before group play
  // resolves. They carry no teams, so there is nothing to seed.
  if (homeAbbr === "TBD" || awayAbbr === "TBD") return null;

  const providerStatus = mapEspnStatus(comp.status?.type?.state, comp.status?.type?.completed, comp.status?.type?.name);
  if (providerStatus === "unknown") throw new Error("Malformed ESPN fixture: unknown status");
  const status: SeedGame["status"] = providerStatus === "postponed" || providerStatus === "cancelled" ? providerStatus : "scheduled";
  const tipOffUtc = String(comp.date);
  if (!/^\d+$/.test(String(ev.id)) || !homeAbbr || !awayAbbr || homeAbbr === awayAbbr || !Number.isFinite(new Date(tipOffUtc).getTime())) {
    throw new Error("Malformed ESPN fixture identity or tip-off");
  }
  return applyGameInputCorrection<SeedGame & {homeAbbr:string;awayAbbr:string}>({
    homeAbbr, awayAbbr, gameType: espnScheduleGameType(comp.notes),
    externalId: `espn-${ev.id}`,
    status,
    sourceStatus: providerStatus,
    date: ET_DATE.format(new Date(tipOffUtc)),
    home: homeAbbr,
    away: awayAbbr,
    tipOffUtc,
    neutralSite: Boolean(comp.neutralSite),
    neutralVenueCity:
      comp.neutralSite && comp.venue?.address?.city ? String(comp.venue.address.city) : null,
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Structural checks. Returns problems; an empty array means the slate is safe to write. */
export function validateUpcomingSeed(games: readonly SeedGame[]): string[] {
  const problems: string[] = [];
  const total = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const g of games.filter(g=>g.gameType === "regular")) {
    bump(total, g.home);
    bump(total, g.away);
  }

  if (total.size !== 30) problems.push(`expected 30 teams, saw ${total.size}`);

  const counts = [...new Set(total.values())].sort((a, b) => a - b);
  if (counts.some(count => count !== 80 && count !== 82)) problems.push(`expected 80 or 82 regular-season games per team, saw ${counts.join(", ")}`);
  if (counts.length > 1) {
    const odd = [...total.entries()]
      .filter(([, n]) => n !== counts[counts.length - 1])
      .map(([t, n]) => `${t}=${n}`);
    problems.push(`teams do not share a game count (${counts.join(", ")}): ${odd.join(" ")}`);
  }

  const championships=games.filter(g=>g.gameType === "cup_final");
  if(championships.length>1 || championships.some(g=>!g.neutralSite))problems.push("Cup championship must be a single identified neutral fixture");
  const perDay = new Map<string, Map<string, number>>();
  for (const g of games) {
    if (!perDay.has(g.date)) perDay.set(g.date, new Map());
    bump(perDay.get(g.date)!, g.home);
    bump(perDay.get(g.date)!, g.away);
  }
  for (const [date, teams] of perDay) {
    for (const [team, n] of teams) {
      if (n > 1) problems.push(`${team} is booked ${n}x on ${date}`);
    }
  }

  const seen = new Set<string>();
  for (const g of games) {
    const key = `${g.date}|${g.away}@${g.home}`;
    if (seen.has(key)) problems.push(`duplicate fixture ${key}`);
    seen.add(key);
  }

  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const season = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  const dryRun = args.includes("--dry-run");
  const refresh = args.includes("--refresh");

  if (!season) {
    console.error("Usage: tsx scripts/seed_upcoming_season_espn.ts <season> [--dry-run] [--refresh]");
    process.exit(1);
  }

  const startYear = Number(season.slice(0, 4));
  const seasonEndYear = startYear + 1;
  // Wide enough to cover any release calendar; season.type/year does the real filtering.
  const dates = dateRange(`${startYear}-10-01`, `${seasonEndYear}-06-30`);
  console.log(`Seeding ${season} from ESPN — scanning ${dates.length} dates…`);

  const games: SeedGame[] = [];
  let errors = 0;
  let done = 0;
  await pool(dates, CONCURRENCY, async (date) => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const sb: any = await fetchScoreboard(date, refresh);
      for (const ev of sb?.events ?? []) {
        const g = parseUpcomingSeedEvent(ev, seasonEndYear);
        if (g) games.push(g);
      }
    } catch (e) {
      errors++;
      console.log(`[ERROR] ${date}: ${e instanceof Error ? e.message : e}`);
    }
    if (++done % 60 === 0) console.log(`  ${done}/${dates.length} dates`);
  });

  if (errors) throw new Error(`REFUSING TO WRITE — ${errors} ESPN dates failed; schedule coverage is incomplete`);
  const slate = deduplicateSeedEvents(games).sort((a, b) =>
    a.tipOffUtc === b.tipOffUtc ? a.externalId.localeCompare(b.externalId) : a.tipOffUtc < b.tipOffUtc ? -1 : 1
  );

  const days = new Set(slate.map((g) => g.date));
  console.log(
    `\n${slate.length} regular-season games across ${days.size} dates ` +
      `(${slate[0]?.date} → ${slate[slate.length - 1]?.date}), ${errors} date error(s)`
  );
  console.log(`  neutral-site games: ${slate.filter((g) => g.neutralSite).length}`);

  const byId = new Map(slate.map(game => [game.externalId, game]));
  const problems = validateUpcomingSeed(slate);
  if (problems.length > 0) {
    console.error(`\nREFUSING TO WRITE — ${problems.length} structural problem(s):`);
    for (const p of problems.slice(0, 25)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("  structural checks: OK (30 teams, equal game counts, no double-bookings)");

  const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
  try {
    const teamRows = await sql<{ id: number; abbreviation: string }[]>`
      select id, abbreviation from teams`;
    const teamId = new Map(teamRows.map((t) => [t.abbreviation, t.id]));
    const unknown = [...new Set(slate.flatMap((g) => [g.home, g.away]))].filter(
      (a) => !teamId.has(a)
    );
    if (unknown.length > 0) {
      console.error(`REFUSING TO WRITE — unknown team abbreviation(s): ${unknown.join(", ")}`);
      process.exit(1);
    }

    // A row for the same fixture under a different external_id would become a duplicate the
    // unique index cannot catch — `external_id` is the only uniqueness guard on `games`.
    const existing = await sql<{ external_id: string; date: string; home: string; away: string; status: string }[]>`
      select g.external_id, g.date::text as date, ht.abbreviation home, at.abbreviation away, g.status
      from games g
      join teams ht on ht.id = g.home_team_id
      join teams at on at.id = g.away_team_id
      where g.season = ${season}`;
    const holds = existing.filter(e => {const incoming=byId.get(e.external_id);return incoming && incoming.status !== "scheduled" && incoming.status !== e.status && e.status !== "final";});
    if (holds.length) throw new Error("REFUSING TO WRITE — lifecycle changes require sync_scores_espn.ts and its transactional projection invalidation");
    const moved = existing.filter(e => { const incoming = byId.get(e.external_id); return incoming && (incoming.date !== e.date || incoming.home !== e.home || incoming.away !== e.away); });
    if (moved.length) throw new Error(`REFUSING TO WRITE — ${moved.length} existing fixtures changed date or pairing; review reschedule identity and fatigue invalidation first`);
    const collisions = existing.filter((e) => {
      const incoming = byId.get(e.external_id);
      return !incoming && slate.some((g) => g.date === e.date && g.home === e.home && g.away === e.away);
    });
    if (collisions.length > 0) {
      console.error(
        `REFUSING TO WRITE — ${collisions.length} existing ${season} row(s) hold the same ` +
          `fixture under a different external_id (e.g. ${collisions[0].external_id} ` +
          `${collisions[0].date} ${collisions[0].away}@${collisions[0].home}). ` +
          `Re-key or remove them first.`
      );
      process.exit(1);
    }
    console.log(`  existing ${season} rows: ${existing.length}, fixture collisions: 0`);

    if (dryRun) {
      console.log("\n--dry-run: no rows written");
      return;
    }

    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < slate.length; i += CHUNK) {
      const chunk = slate.slice(i, i + CHUNK);
      await sql`
        insert into games ${sql(
          chunk.map((g) => ({
            external_id: g.externalId,
            date: g.date,
            season,
            home_team_id: teamId.get(g.home)!,
            away_team_id: teamId.get(g.away)!,
            home_score: null,
            away_score: null,
            status: g.status,
            overtime_periods: 0,
            game_type: g.gameType,
            tip_off_utc: g.tipOffUtc,
            neutral_site: g.neutralSite,
            neutral_venue_city: g.neutralVenueCity,
          }))
        )}
        on conflict (external_id) do update set
          date = games.date,
          season = excluded.season,
          home_team_id = excluded.home_team_id,
          away_team_id = excluded.away_team_id,
          status = case when games.status in ('final', 'postponed', 'cancelled') then games.status else excluded.status end,
          game_type = excluded.game_type,
          tip_off_utc = case when games.status in ('postponed', 'cancelled') then games.tip_off_utc else excluded.tip_off_utc end,
          neutral_site = excluded.neutral_site,
          neutral_venue_city = excluded.neutral_venue_city`;
      written += chunk.length;
      console.log(`  wrote ${written}/${slate.length}`);
    }
    console.log(`\ndone — ${written} ${season} rows upserted`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
