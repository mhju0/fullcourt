import { describe, expect, it } from "vitest";
import { formatLocalDateKey, pickDefaultGamesDate } from "../nba-season";
import type { GameDateCount } from "@/types";

function dates(values: string[]): GameDateCount[] {
  return values.map((date) => ({ date, gameCount: 1 }));
}

describe("pickDefaultGamesDate", () => {
  it("picks today when today has games", () => {
    expect(
      pickDefaultGamesDate(
        "2026-03-30",
        dates(["2026-03-28", "2026-03-30", "2026-04-01"])
      )
    ).toBe("2026-03-30");
  });

  it("picks the last regular-season date after the season ends in May", () => {
    expect(
      pickDefaultGamesDate(
        "2026-05-24",
        dates(["2025-10-22", "2026-03-30", "2026-04-12"])
      )
    ).toBe("2026-04-12");
  });

  it("picks the last regular-season date after the season ends in June", () => {
    expect(
      pickDefaultGamesDate(
        "2026-06-30",
        dates(["2025-10-22", "2026-03-30", "2026-04-12"])
      )
    ).toBe("2026-04-12");
  });

  it("picks the first upcoming October date at the start of a new season", () => {
    expect(
      pickDefaultGamesDate(
        "2026-10-01",
        dates(["2026-10-21", "2026-10-23", "2026-11-01"])
      )
    ).toBe("2026-10-21");
  });

  it("picks the next October date when today has no games in October", () => {
    expect(
      pickDefaultGamesDate(
        "2026-10-15",
        dates(["2026-10-12", "2026-10-18", "2026-10-21"])
      )
    ).toBe("2026-10-18");
  });

  it("picks the first October date when October games exist only before today", () => {
    expect(
      pickDefaultGamesDate(
        "2026-10-31",
        dates(["2026-10-21", "2026-10-23", "2026-11-01"])
      )
    ).toBe("2026-10-21");
  });

  it("picks the first available date before the current season starts", () => {
    expect(
      pickDefaultGamesDate(
        "2026-09-30",
        dates(["2026-10-21", "2026-10-23", "2026-11-01"])
      )
    ).toBe("2026-10-21");
  });

  it("returns null when no date data exists", () => {
    expect(pickDefaultGamesDate("2026-05-24", [])).toBeNull();
  });
});

describe("formatLocalDateKey", () => {
  it("formats with local date parts instead of UTC serialization", () => {
    expect(formatLocalDateKey(new Date(2026, 2, 30, 0, 30))).toBe("2026-03-30");
  });
});
