import { writeGameStatus } from "@/lib/game-status-write";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and, inArray, or, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { games, teams } from "@/lib/db/schema";
import { refreshProspectiveGames, type ProspectiveRefreshSummary } from "@/lib/daily-refresh";
import { adjacentEasternDateKey, createDailyRefreshPort, selectRecoveryGameIds, withCronDbDeadline } from "@/lib/daily-refresh-port";
import { parseScoreboard, reconcileScores } from "@/lib/espn-scoreboard";
import { defaultNbaSeason, formatEasternDateKey } from "@/lib/nba-season";

const SCOREBOARD_TIMEOUT_MS = 10_000;
const ROUTE_BUDGET_MS = 55_000;
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (Boolean(process.env.VERCEL) || Boolean(cronSecret)) {
    if (!cronSecret) return NextResponse.json({ error: "Server misconfiguration: set CRON_SECRET in the project environment for Vercel cron" }, { status: 503 });
    const auth = request.headers.get("authorization");
    if (!auth || !constantTimeEqual(auth, `Bearer ${cronSecret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deadlineMs = Date.now() + ROUTE_BUDGET_MS;
  const today = formatEasternDateKey();
  const dateKeys = [adjacentEasternDateKey(today, -1), today, adjacentEasternDateKey(today, 1)];
  let gamesUpdated = 0;
  let checkedGames = 0;
  let espnGamesAvailable = 0;
  let refusedDowngrades = 0;
  let scoreFailures = 0;
  let scoreDeferred = 0;
  let feedFailed = false;
  let checkedDates: string[] = [];

  try {
    const home = alias(teams, "home_team");
    const away = alias(teams, "away_team");
    const pendingGames = await withCronDbDeadline(db, deadlineMs, tx => tx.select({
      id: games.id, date: games.date, homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId,
      homeAbbr: home.abbreviation, awayAbbr: away.abbreviation, status: games.status,
      homeScore: games.homeScore, awayScore: games.awayScore, overtimePeriods: games.overtimePeriods,
      externalId: games.externalId, tipOffUtc: games.tipOffUtc,
    }).from(games).innerJoin(home, eq(games.homeTeamId, home.id)).innerJoin(away, eq(games.awayTeamId, away.id))
      .where(or(
        and(inArray(games.date, dateKeys), inArray(games.status, ["scheduled", "live", "postponed", "cancelled"])),
        and(eq(games.season, defaultNbaSeason()), inArray(games.status, ["postponed", "cancelled"]), lte(games.date, today)),
      )));
    checkedGames = pendingGames.length;
    const pending = new Map<string, typeof pendingGames>();
    for (const game of pendingGames) pending.set(game.date, [...(pending.get(game.date) ?? []), game]);
    checkedDates = [...pending.keys()].sort();
    const fetched = await Promise.allSettled(checkedDates.map(async date => {
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) throw new Error("score budget exhausted");
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date.replaceAll("-", "")}`, {
        headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 },
        signal: AbortSignal.timeout(Math.min(SCOREBOARD_TIMEOUT_MS, remaining)),
      });
      if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.events)) throw new Error("Invalid scoreboard: events must be an array");
      return parseScoreboard(payload);
    }));
    for (const [index, result] of fetched.entries()) {
      const date = checkedDates[index];
      if (result.status === "rejected") {
        feedFailed = true;
        scoreFailures++;
        console.error("[cron/update] score date failed", date, result.reason);
        continue;
      }
      espnGamesAvailable += result.value.length;
      const reconciled = reconcileScores(pending.get(date)!, result.value, date);
      refusedDowngrades += reconciled.refusedDowngrades.length;
      for (const update of reconciled.updates) {
        if (Date.now() >= deadlineMs) { scoreDeferred++; continue; }
        try {
          const result = await writeGameStatus(db, update, deadlineMs);
          gamesUpdated += Number(result.written);
          if (!result.written) refusedDowngrades++;

        } catch (error) {
          scoreFailures++;
          console.error("[cron/update] final write failed", update.gameId, error);
        }
      }
    }
  } catch (error) {
    scoreFailures++;
    console.error("[cron/update] score stage failed", error);
  }

  let refresh: ProspectiveRefreshSummary | null = null;
  let recoveryFailed = false;
  try {
    const gameIds = await selectRecoveryGameIds(db, today, defaultNbaSeason(), deadlineMs);
    refresh = await refreshProspectiveGames({ gameIds, port: createDailyRefreshPort(db), deadlineMs });
    for (const failure of refresh.failedGames) console.error("[cron/update] refresh kept game", failure.gameId, failure.reason);
    if (refresh.skippedGames.length || refresh.deferredGames.length) console.info("[cron/update] refresh skipped/deferred", refresh.skippedGames, refresh.deferredGames);
  } catch (error) {
    recoveryFailed = true;
    console.error("[cron/update] recovery stage failed", error);
  }

  const degraded = scoreFailures > 0 || scoreDeferred > 0 || recoveryFailed || (refresh?.failedGames.length ?? 0) > 0 || (refresh?.deferredGames.length ?? 0) > 0;
  return NextResponse.json({
    data: { gamesUpdated },
    error: degraded ? (feedFailed ? "Live score feed unavailable; reconciliation incomplete" : "Score or fatigue reconciliation incomplete") : null,
    meta: {
      checkedGames, checkedDates, espnGamesAvailable, refusedDowngrades, scoreFailures, scoreDeferred,
      fatigueRescored: refresh?.gamesRefreshed ?? null,
      fatigueFailed: (refresh?.failedGames.length ?? 0) + Number(recoveryFailed),
      fatigueSkipped: refresh?.skippedGames.length ?? 0,
      fatigueDeferred: refresh?.deferredGames.length ?? 0,
    },
  }, { status: degraded ? (feedFailed ? 502 : 503) : 200 });
}

function constantTimeEqual(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
