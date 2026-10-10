import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { games, teams } from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { parseScoreboard, reconcileScores, type ScoreUpdate } from "@/lib/espn-scoreboard";
import { formatEasternDateKey } from "@/lib/nba-season";

/**
 * Must stay **strictly below** `maxDuration`, or the abort can never fire.
 *
 * It was equal to it: this route inherited Hobby's 10s default while asking for a 10s fetch
 * timeout, so a slow feed killed the function instead of returning the authored
 * "Live score feed unavailable" 502 below. The 502 path was unreachable.
 */
const SCOREBOARD_TIMEOUT_MS = 10_000;

/** Drizzle + `postgres` need the Node.js runtime (not Edge). */
export const runtime = "nodejs";

/**
 * The ceiling, stated rather than inherited. Vercel Hobby defaults to 10s and caps at 60s.
 *
 * Set to the cap because this route has an external dependency it does not control — one DB
 * read, an ESPN fetch per date, then one write per finished game — and it runs about hourly,
 * so a slow run costs nothing. See `SCOREBOARD_TIMEOUT_MS` above for the invariant between the two.
 */
export const maxDuration = 60;

/** Never prerender — reads the DB and ESPN's scoreboard. */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/update
 *
 * Vercel Cron-compatible endpoint that writes finished NBA games. Checks for games not yet
 * final on **yesterday or today (ET)**, reads each of those dates' ESPN scoreboards, and writes
 * back the final status, score and overtime. A game still being played is left alone
 * (`reconcileScores`): the Games page marks it live from its tip time, and a score written
 * mid-game would sit unchanged until the next run.
 *
 * Two dates because the later runs fire after midnight ET, when the games they are for are
 * already "yesterday". See the window comment in the handler.
 *
 * **Reads ESPN, and matches on (away, home), because the previous design could not work.** It
 * fetched `cdn.nba.com`, which 403s — from this region and from GitHub's US runners alike, a
 * datacenter block re-probed 2026-08-18 — and it paired rows by normalized stats game id, which
 * cannot match the `espn-<eventId>` external_ids the 2026-27 season is keyed by. Both faults are
 * removed by sharing `@/lib/espn-scoreboard` with `scripts/sync_scores_espn.ts`: one matcher,
 * one abbreviation map, and a writer that cannot tell an `espn-` row from an `002…` one.
 *
 * This route is what puts a night's finals on the site. The GitHub Actions pipeline
 * (`scripts/daily_update.py`) is scheduled for 21:00 UTC and in practice starts hours late, so it
 * cannot be relied on for scores. This route does not recompute fatigue; the Actions run does
 * that, reading whatever this has already finalized.
 *
 * The Supabase Realtime subscription will automatically push changes
 * to all connected clients when the `games` table is updated.
 *
 * On Vercel, set `CRON_SECRET` in project env; the platform sends
 * `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs.
 * Unauthenticated access is rejected when `VERCEL=1` or when
 * `CRON_SECRET` is set (so local/staging can lock the route too).
 *
 * On Vercel Hobby each cron entry may run once a day and fires at some point inside its hour.
 * `vercel.json` therefore lists one entry per hour from 21:00 to 08:00 UTC, all calling this
 * route, so a final lands within about two hours of the game ending. `vercel.json` is the
 * source of truth for the hours — restating them here is what let this comment drift once.
 *
 * The last entry has to land after the last final of the night. The latest tip of 2026-27 is
 * 04:00 UTC (11 PM ET in winter), so 08:00 UTC leaves four hours for it.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const mustAuthenticate = Boolean(process.env.VERCEL) || Boolean(cronSecret);

  if (mustAuthenticate) {
    if (!cronSecret) {
      return NextResponse.json(
        {
          error:
            "Server misconfiguration: set CRON_SECRET in the project environment for Vercel cron",
        },
        { status: 503 }
      );
    }
    if (!authHeader || !constantTimeEqual(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // ET, not server-UTC: games.date stores ET calendar dates, and a 9 PM ET tip
    // is already "tomorrow" in UTC — the old server-local date missed late games.
    const today = formatEasternDateKey();

    // Yesterday *and* today, because this pass runs after midnight ET.
    //
    // The runs from 04:00 or 05:00 UTC on fall on ET date D+1, while the finals this route
    // exists to capture carry `games.date = D`. Scoped to `today` alone,
    // as it was from the 2026-08-18 schedule move until 2026-08-22, the `where` below selected
    // only games that had not tipped off yet: the evening pass matched nothing and wrote
    // nothing, and every night's result waited for the Actions 7-day lookback the following
    // afternoon. The schedule was right, so the window is what moved. Two dates also make a
    // late or retried run self-healing.
    const yesterday = formatEasternDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const dateKeys = yesterday === today ? [today] : [yesterday, today];

    // Abbreviations, not ids: the pairing is what this route matches on.
    const homeTeam = alias(teams, "home_team");
    const awayTeam = alias(teams, "away_team");

    const gamesToCheck = await db
      .select({
        id: games.id,
        date: games.date,
        homeAbbr: homeTeam.abbreviation,
        awayAbbr: awayTeam.abbreviation,
        status: games.status,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        overtimePeriods: games.overtimePeriods,
      })
      .from(games)
      .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
      .where(
        and(
          inArray(games.date, dateKeys),
          inArray(games.status, ["scheduled", "live"])
        )
      );

    if (gamesToCheck.length === 0) {
      return NextResponse.json({
        data: { gamesUpdated: 0 },
        error: null,
        meta: { message: "No unfinished games to update" },
      });
    }

    // Grouped by date and reconciled per date, never pooled. ESPN's feed is grouped by ET
    // calendar date and `reconcileScores` matches on the (away, home) pairing alone, so two
    // nights merged into one pool would let a consecutive-night rematch of the same two teams
    // take the wrong night's score.
    const pending = new Map<string, typeof gamesToCheck>();
    for (const game of gamesToCheck) {
      const bucket = pending.get(game.date);
      if (bucket) bucket.push(game);
      else pending.set(game.date, [game]);
    }
    // Only the dates that actually have something to update, so a one-date night still costs
    // one fetch.
    const dates = dateKeys.filter((dateKey) => pending.has(dateKey));

    // The date-scoped scoreboard rather than a "today" endpoint: ESPN groups this feed by ET
    // calendar date, which is exactly what `games.date` stores, so the two agree by construction.
    //
    // The User-Agent is load-bearing in an unobvious way: ESPN's edge fingerprints the whole
    // header set. A browser UA sent by curl with none of a browser's other headers gets a 403,
    // while the same UA through a fetch implementation gets a 200. Measured both ways from a
    // GitHub runner on 2026-08-18; see .github/workflows/probe-data-sources.yml.
    const responses = await Promise.all(
      dates.map((dateKey) =>
        fetch(
          "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard" +
            `?dates=${dateKey.replaceAll("-", "")}`,
          {
            headers: { "User-Agent": "Mozilla/5.0" },
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(SCOREBOARD_TIMEOUT_MS),
          }
        )
      )
    );

    // One bad date fails the whole pass rather than half of it: a partial write here would
    // leave the two nights in different states with nothing recording which.
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      console.error("[cron/update] ESPN scoreboard HTTP", failed.status);
      return NextResponse.json(
        {
          data: { gamesUpdated: 0 },
          error:
            process.env.NODE_ENV === "production"
              ? "Live score feed unavailable"
              : `ESPN returned ${failed.status}`,
        },
        { status: 502 }
      );
    }

    const updates: ScoreUpdate[] = [];
    const refusedDowngrades: number[] = [];
    let espnGamesAvailable = 0;
    for (const [index, dateKey] of dates.entries()) {
      const espnGames = parseScoreboard(await responses[index].json());
      espnGamesAvailable += espnGames.length;
      const reconciled = reconcileScores(pending.get(dateKey)!, espnGames);
      updates.push(...reconciled.updates);
      refusedDowngrades.push(...reconciled.refusedDowngrades);
    }

    // One round-trip per game, issued together rather than in series. `reconcileScores` returns
    // at most one update per distinct game id, so these never contend for the same row.
    //
    // overtime_periods is only written when the reconciliation actually derived one — a game
    // still in progress reports null and keeps whatever is stored, rather than zeroing it.
    await Promise.all(
      updates.map((update) =>
        db
          .update(games)
          .set({
            status: update.status,
            homeScore: update.homeScore,
            awayScore: update.awayScore,
            ...(update.overtimePeriods !== null
              ? { overtimePeriods: update.overtimePeriods }
              : {}),
          })
          .where(eq(games.id, update.gameId))
      )
    );

    return NextResponse.json({
      data: { gamesUpdated: updates.length },
      error: null,
      meta: {
        checkedGames: gamesToCheck.length,
        checkedDates: dates,
        espnGamesAvailable,
        refusedDowngrades: refusedDowngrades.length,
      },
    });
  } catch (err) {
    console.error("[cron/update] Error:", err);
    return NextResponse.json(
      {
        data: { gamesUpdated: 0 },
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}

/**
 * Constant-time string compare for the cron bearer token, so a rejected request
 * can't leak the secret byte-by-byte via response timing. Comparing lengths first
 * only reveals the token length, which is not sensitive.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
