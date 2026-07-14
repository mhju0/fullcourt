import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import {
  reconcileLiveScores,
  type NbaScoreboard,
} from "@/lib/live-score-sync";
import { formatEasternDateKey } from "@/lib/nba-season";

const SCOREBOARD_TIMEOUT_MS = 10_000;

/** Drizzle + `postgres` need the Node.js runtime (not Edge). */
export const runtime = "nodejs";

/** Never prerender — uses DB and live NBA feed. */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/update
 *
 * Vercel Cron-compatible endpoint that updates live NBA game scores.
 * Checks for games currently in "live" status or scheduled for today,
 * fetches current scores from the NBA CDN, and updates the database.
 *
 * The Supabase Realtime subscription will automatically push changes
 * to all connected clients when the `games` table is updated.
 *
 * On Vercel, set `CRON_SECRET` in project env; the platform sends
 * `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs.
 * Unauthenticated access is rejected when `VERCEL=1` or when
 * `CRON_SECRET` is set (so local/staging can lock the route too).
 *
 * On Vercel Hobby, crons are limited to once per day (`vercel.json`: 10:00 UTC).
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

    // Find all games that are live or scheduled for today
    const gamesToCheck = await db
      .select({
        id: games.id,
        externalId: games.externalId,
        status: games.status,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
      })
      .from(games)
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

    // Fetch today's scoreboard from the NBA CDN
    const scoreboardUrl =
      "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";

    const response = await fetch(scoreboardUrl, {
      headers: { "User-Agent": "fullcourt/1.0" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(SCOREBOARD_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[cron/update] NBA scoreboard HTTP", response.status);
      return NextResponse.json(
        {
          data: { gamesUpdated: 0 },
          error:
            process.env.NODE_ENV === "production"
              ? "Live score feed unavailable"
              : `NBA CDN returned ${response.status}`,
        },
        { status: 502 }
      );
    }

    const scoreboard = (await response.json()) as NbaScoreboard;
    const nbaGames = scoreboard.scoreboard.games;

    const updates = reconcileLiveScores(gamesToCheck, nbaGames);

    for (const update of updates) {
      await db
        .update(games)
        .set({
          status: update.status,
          homeScore: update.homeScore,
          awayScore: update.awayScore,
        })
        .where(eq(games.id, update.gameId));
    }

    return NextResponse.json({
      data: { gamesUpdated: updates.length },
      error: null,
      meta: {
        checkedGames: gamesToCheck.length,
        nbaGamesAvailable: nbaGames.length,
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
