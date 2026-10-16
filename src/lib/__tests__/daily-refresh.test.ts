import { describe, expect, it } from "vitest";
import {
  buildPrediction,
  refreshDailyGames,
  type DailyRefreshPort,
  type DailyRefreshWrite,
} from "@/lib/daily-refresh";

const teams = [
  {
    id: 1,
    abbreviation: "BOS",
    latitude: "42.3601",
    longitude: "-71.0589",
    altitudeFlag: false,
  },
  {
    id: 2,
    abbreviation: "NYK",
    latitude: "40.7128",
    longitude: "-74.0060",
    altitudeFlag: false,
  },
] as const;

describe("refreshDailyGames", () => {
  it("preserves a failed game's prior state and continues with later games", async () => {
    const stored = new Map<number, string>([
      [10, "last-known-good"],
      [11, "old"],
    ]);
    const writes: DailyRefreshWrite[] = [];
    const port: DailyRefreshPort = {
      async loadRecentGames() {
        return [];
      },
      async replaceGameRefresh(write) {
        writes.push(write);
        if (write.gameId === 10) {
          throw new Error("simulated transaction failure");
        }
        stored.set(write.gameId, "refreshed");
      },
    };

    const result = await refreshDailyGames({
      games: [
        {
          id: 10,
          date: "2026-01-10",
          homeTeamId: 1,
          awayTeamId: 2,
          status: "scheduled",
          neutralSite: false,
        },
        {
          id: 11,
          date: "2026-01-11",
          homeTeamId: 1,
          awayTeamId: 2,
          status: "scheduled",
          neutralSite: false,
        },
      ],
      teams,
      port,
    });

    expect(writes.map((write) => write.gameId)).toEqual([10, 11]);
    expect(stored.get(10)).toBe("last-known-good");
    expect(stored.get(11)).toBe("refreshed");
    expect(result).toMatchObject({
      gamesRefreshed: 1,
      fatigueRowsWritten: 2,
      failedGames: [{ gameId: 10, reason: "simulated transaction failure" }],
    });
  });

  it("replaces an unresolved prediction with no prediction for a neutral game", async () => {
    let write: DailyRefreshWrite | undefined;
    const port: DailyRefreshPort = {
      async loadRecentGames() {
        return [];
      },
      async replaceGameRefresh(nextWrite) {
        write = nextWrite;
      },
    };

    const result = await refreshDailyGames({
      games: [
        {
          id: 12,
          date: "2026-01-12",
          homeTeamId: 1,
          awayTeamId: 2,
          status: "scheduled",
          neutralSite: false,
        },
      ],
      teams,
      port,
    });

    expect(write).toMatchObject({
      gameId: 12,
      replaceUnresolvedPrediction: true,
      prediction: null,
    });
    expect(result.predictionRowsWritten).toBe(0);
  });

  /**
   * The venue swap lives in the caller, not in calculateFatigue — passing Paris
   * coordinates always worked; what was broken was daily-refresh handing it the home
   * team's arena. So this asserts on the refresh path, where the bug actually was.
   */
  it("sends both teams to the neutral venue instead of the home arena", async () => {
    const port: DailyRefreshPort = {
      async loadRecentGames() {
        // One prior home game each, so tonight has a real travel leg to measure.
        return [
          {
            date: "2026-01-12",
            isHome: true,
            teamLat: 42.3601,
            teamLon: -71.0589,
            opponentLat: 40.7128,
            opponentLon: -74.006,
            overtimePeriods: 0,
          },
        ];
      },
      async replaceGameRefresh() {},
    };

    const collect = async (neutral: boolean) => {
      let write: DailyRefreshWrite | undefined;
      await refreshDailyGames({
        games: [
          {
            id: 13,
            date: "2026-01-15",
            homeTeamId: 1,
            awayTeamId: 2,
            status: "final",
            neutralSite: neutral,
            ...(neutral ? { neutralVenueCity: "Paris" } : {}),
          },
        ],
        teams,
        port: { ...port, async replaceGameRefresh(w) { write = w; } },
      });
      return write!.fatigueRows;
    };

    const [homeAtHome] = await collect(false);
    const [homeInParis] = await collect(true);

    // Boston hosting Boston-based games flies nowhere; Boston "hosting" in Paris flies ~3,400 mi.
    expect(Number(homeAtHome.travelDistanceMiles)).toBe(0);
    expect(Number(homeInParis.travelDistanceMiles)).toBeGreaterThan(3000);
    expect(homeInParis.hasTimeZoneDisplacement).toBe(true);
    expect(homeAtHome.hasTimeZoneDisplacement).toBe(false);
  });
});


it("counts a deadline reached inside the transaction as deferred, rather than a harmless skip", async () => {
  const { refreshProspectiveGames } = await import("@/lib/daily-refresh");
  const summary = await refreshProspectiveGames({
    gameIds: [10, 11],
    port: { refreshGame: async () => ({ status: "deferred", reason: "budget exhausted" }) },
  });
  expect(summary.deferredGames).toEqual([10, 11]);
  expect(summary.skippedGames).toEqual([]);
});

it("writes no open prediction for a rested host at a neutral site (D-92)", () => {
  const game = { id: 20, date: "2026-11-07", homeTeamId: 1, awayTeamId: 2, status: "scheduled" };
  expect(buildPrediction({ ...game, neutralSite: false }, 2, 6)).not.toBeNull();
  expect(buildPrediction({ ...game, neutralSite: true }, 2, 6)).toBeNull();
});
