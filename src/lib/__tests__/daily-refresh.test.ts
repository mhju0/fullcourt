import { describe, expect, it } from "vitest";
import {
  refreshDailyGames,
  type DailyRefreshPort,
  type DailyRefreshWrite,
} from "@/lib/daily-refresh";

const teams = [
  {
    id: 1,
    latitude: "42.3601",
    longitude: "-71.0589",
    altitudeFlag: false,
  },
  {
    id: 2,
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
        },
        {
          id: 11,
          date: "2026-01-11",
          homeTeamId: 1,
          awayTeamId: 2,
          status: "scheduled",
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
});
