import { describe, expect, it } from "vitest";
import { gameDayContext } from "@/lib/game-day-context";

const context = (date: string, today = "2026-10-26", gameCount = 0, season = "2026-27") =>
  gameDayContext({ date, today, gameCount, season });

describe("source-backed empty-day context", () => {
  it.each([
    ["2026-11-03", "Election Day. No games scheduled."],
    ["2026-11-26", "Thanksgiving. No games scheduled."],
    ["2026-12-24", "Christmas Eve. No games scheduled."],
    ["2026-12-11", "NBA Cup Championship. No regular-season games scheduled."],
    ["2027-04-10", "League off day before the regular-season finale."],
    ["2027-02-19", "All-Star break."],
    ["2027-02-24", "All-Star break."],
  ])("labels %s only when it has no actual games", (date, message) => {
    expect(context(date)).toEqual({ message, count: 0 });
    expect(context(date, "2026-10-26", 1)).toBeNull();
  });

  it("uses exact All-Star ranges without extending to adjoining days or other years", () => {
    expect(context("2026-02-13", "2026-02-13", 0, "2025-26")?.message).toBe("All-Star break.");
    expect(context("2026-02-18", "2026-02-18", 0, "2025-26")?.message).toBe("All-Star break.");
    for (const date of ["2027-02-18", "2027-02-25", "2028-02-19"]) expect(context(date)).toBeNull();
  });

  it.each(["2026-12-04", "2026-12-10"])("retires pending on bracket completion and never calls missing records zero: %s", date => {
    expect(context(date, "2026-11-27")).toEqual({ message: "NBA Cup schedule pending. Matchups to be announced.", count: "TBD" });
    expect(context(date, "2026-11-28")).toEqual({ message: "NBA Cup schedule not available.", count: "TBD" });
    expect(context(date, date)).toEqual({ message: "No regular-season games listed for this day.", count: "—" });
    expect(context(date, "2027-01-01")).toEqual({ message: "No regular-season games listed for this day.", count: "—" });
    expect(context(date, "2026-11-01", 3)).toBeNull();
  });

  it("leaves arbitrary gaps unexplained and recognizes holiday dates without suppressing games", () => {
    expect(context("2026-11-04")).toBeNull();
    expect(context("2025-11-27", "2025-11-01", 0, "2025-26")?.message).toContain("Thanksgiving.");
    expect(context("2025-11-27", "2025-11-01", 1, "2025-26")).toBeNull();
    expect(gameDayContext({ season: "2011-12", date: "2011-12-24", gameCount: 0, today: "2011-12-24", inSeason: false })).toBeNull();
    expect(context("2024-11-05", "2024-11-01", 0, "2024-25")).toBeNull();
  });
});
