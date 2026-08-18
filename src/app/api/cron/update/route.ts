import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { games, teams } from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { parseScoreboard, reconcileScores } from "@/lib/espn-scoreboard";
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
 * read, a `cdn.nba.com` fetch, then one write per live game — and it runs once a day, so a slow
 * run costs nothing. See `SCOREBOARD_TIMEOUT_MS` above for the invariant between the two.
 */
export const maxDuration = 60;

/** Never prerender — uses DB and live NBA feed. */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/update
 *
 * Vercel Cron-compatible endpoint that updates live NBA game scores. Checks for games currently
 * "live" or scheduled for today (ET), reads that date's ESPN scoreboard, and writes back status,
 * scores and overtime.
 *
 * **Reads ESPN, and matches on (away, home), because the previous design could not work.** It
 * fetched `cdn.nba.com`, which 403s — from this region and from GitHub's US runners alike, a
 * datacenter block re-probed 2026-08-18 — and it paired rows by normalized stats game id, which
 * cannot match the `espn-<eventId>` external_ids the 2026-27 season is keyed by. Both faults are
 * removed by sharing `@/lib/espn-scoreboard` with `scripts/sync_scores_espn.ts`: one matcher,
 * one abbreviation map, and a writer that cannot tell an `espn-` row from an `002…` one.
 *
 * This is the *evening* pass. The GitHub Actions pipeline (`scripts/daily_update.py`) runs at
 * 21:00 UTC — before tip-off — so without this route a night's finals would not appear until the
 * following afternoon. This route does not recompute fatigue; the Actions run does that, reading
 * whatever this has already finalized.
 *
 * The Supabase Realtime subscription will automatically push changes
 * to all connected clients when the `games` table is updated.
 *
 * On Vercel, set `CRON_SECRET` in project env; the platform sends
 * `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs.
 * Unauthenticated access is rejected when `VERCEL=1` or when
 * `CRON_SECRET` is set (so local/staging can lock the route too).
 *
 * On Vercel Hobby, crons are limited to once per day. `vercel.json` is the source of truth
 * for the cadence and the time — restating the time here is what let this comment drift to
 * 10:00 UTC, the value that was considered and rejected for firing before tip-off.
 *
 * That one run has to land after the last final of the night. It used to fire at 03:00 UTC,
 * which is 22:00 ET in the winter — a west-coast game tipping at 22:00 ET was still in its
 * first quarter, so its result was missed and the site carried a stale slate until the Actions
 * run the following afternoon. One run per day means the choice is "before some finals" or
 * "after all of them", and after is the only one that leaves the board correct overnight.
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

    // Abbreviations, not ids: the pairing is what this route matches on.
    const homeTeam = alias(teams, "home_team");
    const awayTeam = alias(teams, "away_team");

    const gamesToCheck = await db
      .select({
        id: games.id,
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
          eq(games.date, today),
          inArray(games.status, ["scheduled", "live"])
        )
      );

    if (gamesToCheck.length === 0) {
      return NextResponse.json({
        data: { gamesUpdated: 0 },
        error: null,
        meta: { message: "No live or scheduled games to update" },
      });
    }

    // The date-scoped scoreboard rather than a "today" endpoint: ESPN groups this feed by ET
    // calendar date, which is exactly what `games.date` stores, so the two agree by construction.
    const scoreboardUrl =
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard" +
      `?dates=${today.replaceAll("-", "")}`;

    // The User-Agent is load-bearing in an unobvious way: ESPN's edge fingerprints the whole
    // header set. A browser UA sent by curl with none of a browser's other headers gets a 403,
    // while the same UA through a fetch implementation gets a 200. Measured both ways from a
    // GitHub runner on 2026-08-18; see .github/workflows/probe-data-sources.yml.
    const response = await fetch(scoreboardUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(SCOREBOARD_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[cron/update] ESPN scoreboard HTTP", response.status);
      return NextResponse.json(
        {
          data: { gamesUpdated: 0 },
          error:
            process.env.NODE_ENV === "production"
              ? "Live score feed unavailable"
              : `ESPN returned ${response.status}`,
        },
        { status: 502 }
      );
    }

    const espnGames = parseScoreboard(await response.json());
    const { updates, refusedDowngrades } = reconcileScores(gamesToCheck, espnGames);

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
        espnGamesAvailable: espnGames.length,
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
