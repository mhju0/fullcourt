import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRegularSeasonScheduleForDisparity,
  getSeasonGamesStamp,
  getTeamDirectory,
} from "@/lib/db/queries";
import type { DisparityGameRow } from "@/lib/schedule-disparity";

vi.mock("@/lib/db/queries", () => ({
  getRegularSeasonScheduleForDisparity: vi.fn(),
  getSeasonGamesStamp: vi.fn(),
  getTeamDirectory: vi.fn(),
}));

const mockGames = vi.mocked(getRegularSeasonScheduleForDisparity);
const mockStamp = vi.mocked(getSeasonGamesStamp);
const mockDirectory = vi.mocked(getTeamDirectory);

/**
 * Fresh module per test: the cache is module state.
 *
 * `api-errors` is re-imported from the same reset graph and handed back with it. A
 * statically imported `PublicApiError` would be a *different class object* from the one
 * the freshly-loaded module throws, so `instanceof` would fail on a correct error.
 */
async function loadModule() {
  vi.resetModules();
  const [server, errors] = await Promise.all([
    import("@/lib/schedule-disparity-server"),
    import("@/lib/api-errors"),
  ]);
  return { ...server, ...errors };
}

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
  mockStamp.mockReset();
  mockDirectory.mockReset();
  mockStamp.mockResolvedValue("1230/1230@2025-04-13");
  mockDirectory.mockResolvedValue([
    { id: 1, abbreviation: "LAL", name: "Lakers" },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("getScheduleDisparity — refusing an unrankable season", () => {
  it("refuses rather than ranking teams on unequal exposure", async () => {
    mockGames.mockResolvedValueOnce(UNRANKABLE);

    const { getScheduleDisparity } = await loadModule();

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

    const { getScheduleDisparity, PublicApiError, getPublicApiErrorMessage } =
      await loadModule();

    const err = await getScheduleDisparity("2019-20").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PublicApiError);
    const message = getPublicApiErrorMessage(err);
    expect(message).toContain("2019-20");
    expect(message).toContain("1");
    expect(message).toContain("4");
  });

  it("answers with a status that says the request was understood", async () => {
    mockGames.mockResolvedValueOnce(UNRANKABLE);

    const { getScheduleDisparity } = await loadModule();

    const err = await getScheduleDisparity("2019-20").catch((e: unknown) => e);

    expect((err as { status?: number }).status).toBe(422);
  });

  /**
   * An upcoming season between schedule release and ingest has no games at all.
   * That is not the unequal-exposure case and must stay a 200 with an empty table.
   */
  it("does not refuse a season that has no games yet", async () => {
    mockGames.mockResolvedValueOnce([]);

    const { getScheduleDisparity } = await loadModule();

    const result = await getScheduleDisparity("2026-27");

    expect(result.season).toBe("2026-27");
    expect(result.teams).toEqual([]);
  });

  it("does not refuse a season whose teams played equally", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const { getScheduleDisparity } = await loadModule();

    const result = await getScheduleDisparity("2024-25");

    expect(result.season).toBe("2024-25");
    expect(result.teams.length).toBeGreaterThan(0);
  });
});

describe("getScheduleDisparity — labelling", () => {
  it("labels a team from the directory", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const { getScheduleDisparity } = await loadModule();

    const result = await getScheduleDisparity("2024-25");
    const lakers = result.teams.find((t) => t.teamId === 1);

    expect(lakers?.abbreviation).toBe("LAL");
    expect(lakers?.name).toBe("Lakers");
  });

  it("falls back when the directory has no row for a team", async () => {
    mockGames.mockResolvedValueOnce(RANKABLE);

    const { getScheduleDisparity } = await loadModule();

    const result = await getScheduleDisparity("2024-25");
    const unknown = result.teams.find((t) => t.teamId === 2);

    expect(unknown?.abbreviation).toBe("—");
    expect(unknown?.name).toBe("Team 2");
  });
});

/**
 * This reads every game in a season with no LIMIT and reduces them in JS, the same cost
 * profile the Season Report is held for, and it was the one such module with no cache.
 * `getSeasonGamesStamp` keys `publishableGames(eq(games.season, season))` — exactly the
 * population `getRegularSeasonScheduleForDisparity` reads — so it needed no new query.
 */
describe("getScheduleDisparity — holding", () => {
  it("reads the season once while the stamp is unchanged", async () => {
    mockGames.mockResolvedValue(RANKABLE);
    const { getScheduleDisparity } = await loadModule();

    const first = await getScheduleDisparity("2024-25");
    const second = await getScheduleDisparity("2024-25");

    expect(mockGames).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("re-reads once the season's games move", async () => {
    mockGames.mockResolvedValue(RANKABLE);
    mockStamp
      .mockResolvedValueOnce("1230/1200@2025-04-10")
      .mockResolvedValueOnce("1230/1201@2025-04-11");
    const { getScheduleDisparity } = await loadModule();

    await getScheduleDisparity("2024-25");
    await getScheduleDisparity("2024-25");

    expect(mockGames).toHaveBeenCalledTimes(2);
  });

  /**
   * The stamp has to be the per-season one, not the backtest's. This module reads
   * scheduled games too, and reporting on a schedule before it is played is the point —
   * a final-games-only stamp cannot move between schedule release and opening night.
   */
  it("re-reads when a schedule is seeded with nothing yet final", async () => {
    mockGames.mockResolvedValue(RANKABLE);
    mockStamp
      .mockResolvedValueOnce("0/0@none")
      .mockResolvedValueOnce("1230/0@2027-04-11");
    const { getScheduleDisparity } = await loadModule();

    await getScheduleDisparity("2026-27");
    await getScheduleDisparity("2026-27");

    expect(mockGames).toHaveBeenCalledTimes(2);
  });

  it("holds each season separately, so viewing one does not evict another", async () => {
    mockGames.mockResolvedValue(RANKABLE);
    mockStamp.mockImplementation(async (season: string) =>
      season === "2024-25" ? "1230/1230@2025-04-13" : "1230/0@2027-04-11"
    );
    const { getScheduleDisparity } = await loadModule();

    const current = await getScheduleDisparity("2024-25");
    await getScheduleDisparity("2026-27");

    expect(await getScheduleDisparity("2024-25")).toBe(current);
    expect(mockGames).toHaveBeenCalledTimes(2);
  });

  /**
   * A refusal is not an answer to hold. If it were, a season that becomes rankable once
   * its remaining games are ingested would keep being refused until the process restarted.
   */
  it("does not hold a refusal", async () => {
    mockGames.mockResolvedValueOnce(UNRANKABLE).mockResolvedValueOnce(RANKABLE);
    const { getScheduleDisparity, PublicApiError } = await loadModule();

    await expect(getScheduleDisparity("2024-25")).rejects.toBeInstanceOf(PublicApiError);

    const recovered = await getScheduleDisparity("2024-25");
    expect(recovered.teams.length).toBeGreaterThan(0);
  });

  /**
   * `asOf` is documented as the date the figures were computed, and the page prints it
   * only on a provisional season. A held response keeps its build date rather than being
   * re-stamped on each serve — re-stamping would assert a computation that did not happen.
   */
  it("keeps the date the figures were built, not the date they were served", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    mockGames.mockResolvedValue(RANKABLE);
    const { getScheduleDisparity } = await loadModule();

    const built = await getScheduleDisparity("2024-25");

    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    const served = await getScheduleDisparity("2024-25");

    expect(served.asOf).toBe(built.asOf);
    expect(mockGames).toHaveBeenCalledTimes(1);
  });

  it("restamps asOf when the games move and the figures are rebuilt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    mockGames.mockResolvedValue(RANKABLE);
    mockStamp
      .mockResolvedValueOnce("1230/1200@2025-04-10")
      .mockResolvedValueOnce("1230/1201@2025-04-11");
    const { getScheduleDisparity } = await loadModule();

    const first = await getScheduleDisparity("2024-25");

    vi.setSystemTime(new Date("2026-08-09T12:00:00Z"));
    const rebuilt = await getScheduleDisparity("2024-25");

    expect(rebuilt.asOf).not.toBe(first.asOf);
  });
});
