import { describe, expect, it } from "vitest";
import { cupPlaceholders } from "@/lib/nba-cup";

const dates = (n: number, start = "2026-10-21") =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 2);
    return d.toISOString().slice(0, 10);
  });

describe("cupPlaceholders", () => {
  it("fills an 80-game 2026-27 season with two rows after the last game on or before the quarterfinals", () => {
    const season = dates(80);
    const result = cupPlaceholders("2026-27", season)!;
    expect(result.count).toBe(2);
    expect(season[result.afterIndex] <= "2026-12-05").toBe(true);
    expect(season[result.afterIndex + 1] > "2026-12-05").toBe(true);
  });

  it("adds one row for a quarterfinal loser at 81", () => {
    expect(cupPlaceholders("2026-27", dates(81))?.count).toBe(1);
  });

  it("adds nothing once the league's games are ingested", () => {
    expect(cupPlaceholders("2026-27", dates(82))).toBeNull();
  });

  it("adds nothing to a season without a known gap or to a short season", () => {
    expect(cupPlaceholders("2024-25", dates(80))).toBeNull();
    expect(cupPlaceholders("2026-27", dates(66))).toBeNull();
  });
});
