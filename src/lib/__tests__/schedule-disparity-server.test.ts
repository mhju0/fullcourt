import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApiError, getPublicApiErrorMessage } from "@/lib/api-errors";
import {
  getRegularSeasonScheduleForDisparity,
  getTeamDirectory,
} from "@/lib/db/queries";
import { getScheduleDisparity } from "@/lib/schedule-disparity-server";
import type { DisparityGameRow } from "@/lib/schedule-disparity";

vi.mock("@/lib/db/queries", () => ({
  getRegularSeasonScheduleForDisparity: vi.fn(),
  getTeamDirectory: vi.fn(),
}));

const mockGames = vi.mocked(getRegularSeasonScheduleForDisparity);
const mockDirectory = vi.mocked(getTeamDirectory);

function game(
  date: string,
  homeTeamId: number,
  awayTeamId: number
): DisparityGameRow {
  return {
    date,
    status: "final",
    homeTeamId,
    awayTeamId,
    homeFatigueScore: "2.0",
    awayFatigueScore: "1.0",
  };
}

/**
 * Team 1 plays four games, everyone else plays one: a spread of 3, past
 * `RANKABLE_SEASON_GAME_SPREAD_LIMIT`. This is the shape 2019-20 has.
 */
const UNRANKABLE: DisparityGameRow[] = [
  game("2019-10-22", 1, 2),
  game("2019-10-24", 1, 3),
  game("2019-10-26", 1, 4),
  game("2019-10-28", 1, 5),
];

/** Every team plays twice, so the spread is 0. */
const RANKABLE: DisparityGameRow[] = [
  game("2024-10-22", 1, 2),
  game("2024-10-24", 2, 1),
];

beforeEach(() => {
  mockGames.mockReset();
  mockDirectory.mockReset();
  mockDirectory.mockResolvedValue([
    { id: 1, abbreviation: "LAL", name: "Lakers" },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getScheduleDisparity — refusing an unrankable season", () => {
  it("refuses rather than ranking teams on unequal exposure", async () => {
    mockGames.mockResolvedValueOnce(UNRANKABLE);

    await expect(getScheduleDisparity("2019-20")).rejects.toThrow();
  });

  /**
   * The refusal is authored for a reader, so it has to be thrown as the one error
   * shape `api-errors.ts` lets through. Thrown as a plain `Error` it is
   * indistinguishable from a Drizzle failure and is suppressed by the security
   * contract — which is what this module did until now.
   */
  it("carries the counts to the browser in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockGames.mockResolvedValueOnce(UNRANKABLE);

    const err = await getScheduleDisparity("2019-20").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PublicApiError);
    const message = getPublicApiErrorMessage(err);
    expect(message).toContain("2019-20");
    expect(message).toContain("1");
    expect(message).toContain("4");
  });

  it("answers with a status that says the request was understood", async () => {
    mockGames.mockResolvedValueOnce(UNRANKABLE);

    const err = await getScheduleDisparity("2019-20").catch((e: unknown) => e);

    expect((err as PublicApiError).status).toBe(422);
  });

  /**
   * An upcoming season between schedule release and ingest has no games at all.
   * That is not the unequal-exposure case and must stay a 200 with an empty table.
   */
  it("does not refuse a season that has no games yet", async () => {
    mockGames.mockResolvedValueOnce([]);

    const result = await getScheduleDisparity("2026-27");

    expect(result.season).toBe("2026-27");
    expect(result.teams).toEqual([]);
  });

  it("does not refuse a season whose teams played equally", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const result = await getScheduleDisparity("2024-25");

    expect(result.season).toBe("2024-25");
    expect(result.teams.length).toBeGreaterThan(0);
  });
});

describe("getScheduleDisparity — labelling", () => {
  it("labels a team from the directory", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const result = await getScheduleDisparity("2024-25");
    const lakers = result.teams.find((t) => t.teamId === 1);

    expect(lakers?.abbreviation).toBe("LAL");
    expect(lakers?.name).toBe("Lakers");
  });

  it("falls back when the directory has no row for a team", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const result = await getScheduleDisparity("2024-25");
    const unknown = result.teams.find((t) => t.teamId === 2);

    expect(unknown?.abbreviation).toBe("—");
    expect(unknown?.name).toBe("Team 2");
  });
});
