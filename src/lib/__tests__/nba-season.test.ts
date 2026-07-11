import { describe, expect, it } from "vitest";
import {
  currentDisplaySeason,
  formatEasternDateKey,
  formatLocalDateKey,
  isNbaOffSeason,
  pickDefaultGamesDate,
} from "../nba-season";
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

describe("formatEasternDateKey", () => {
  it("keeps an evening ET tip on its ET day even though UTC has rolled over (EDT)", () => {
    // 8 PM EDT on Apr 12 = 00:00 UTC Apr 13 — the exact shape of the season-finale bug.
    expect(formatEasternDateKey(new Date("2026-04-13T00:00:00Z"))).toBe("2026-04-12");
  });

  it("handles EST (UTC-5) in midwinter", () => {
    // 10 PM EST Jan 14 = 03:00 UTC Jan 15.
    expect(formatEasternDateKey(new Date("2026-01-15T03:00:00Z"))).toBe("2026-01-14");
  });

  it("matches the UTC date for afternoon ET times", () => {
    expect(formatEasternDateKey(new Date("2026-04-12T18:00:00Z"))).toBe("2026-04-12");
  });

  it("is independent of the process timezone (Seoul, UTC, anywhere)", () => {
    // 2026-07-11 13:00 KST = 04:00 UTC = 00:00 EDT — ET day is Jul 11 regardless of host TZ.
    expect(formatEasternDateKey(new Date("2026-07-11T04:00:00Z"))).toBe("2026-07-11");
    expect(formatEasternDateKey(new Date("2026-07-11T03:59:00Z"))).toBe("2026-07-10");
  });
});

describe("currentDisplaySeason", () => {
  it("returns the in-progress season mid-season", () => {
    expect(currentDisplaySeason("2026-01-15")).toBe("2025-26");
  });

  it("returns the most recently completed season during the July offseason", () => {
    expect(currentDisplaySeason("2026-07-10")).toBe("2025-26");
  });

  it("flips to the new season on Oct 1", () => {
    expect(currentDisplaySeason("2026-10-01")).toBe("2026-27");
  });

  it("still returns the old season on Sep 30, the day before rollover", () => {
    expect(currentDisplaySeason("2026-09-30")).toBe("2025-26");
  });

  it("still returns the current season on Apr 30, its last day", () => {
    expect(currentDisplaySeason("2026-04-30")).toBe("2025-26");
  });

  it("returns the just-completed season on May 1, the first offseason day", () => {
    expect(currentDisplaySeason("2026-05-01")).toBe("2025-26");
  });
});

describe("isNbaOffSeason", () => {
  it("is false mid-season", () => {
    expect(isNbaOffSeason("2026-01-15")).toBe(false);
  });

  it("is true in the July offseason", () => {
    expect(isNbaOffSeason("2026-07-10")).toBe(true);
  });

  it("is false on Oct 1, the season's first day", () => {
    expect(isNbaOffSeason("2026-10-01")).toBe(false);
  });

  it("is true on Sep 30, the day before the season starts", () => {
    expect(isNbaOffSeason("2026-09-30")).toBe(true);
  });

  it("is false on Apr 30, the season's last day", () => {
    expect(isNbaOffSeason("2026-04-30")).toBe(false);
  });

  it("is true on May 1, the first offseason day", () => {
    expect(isNbaOffSeason("2026-05-01")).toBe(true);
  });
});
