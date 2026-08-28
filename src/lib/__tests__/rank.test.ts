import { describe, expect, it } from "vitest";

import { competitionRanks, ordinal } from "@/lib/rank";

describe("competitionRanks", () => {
  it("ranks descending by default: largest value is 1st", () => {
    expect(competitionRanks([10, 30, 20], (v) => v)).toEqual([3, 1, 2]);
  });

  it("ranks ascending when asked: smallest value is 1st", () => {
    expect(competitionRanks([10, 30, 20], (v) => v, "asc")).toEqual([1, 3, 2]);
  });

  it("shares a rank on ties and skips the shared slots (competition ranking)", () => {
    // 40, 30, 30, 10 → 1st, 2nd, 2nd, 4th — no 3rd exists.
    expect(competitionRanks([30, 40, 10, 30], (v) => v)).toEqual([2, 1, 4, 2]);
  });

  it("gives null values no standing and no effect on the field", () => {
    const rows: (number | null)[] = [30, null, 10];
    expect(competitionRanks(rows, (v) => v)).toEqual([1, null, 2]);
  });

  it("is positional: ranks align with the input order, not the sorted order", () => {
    const rows = [{ v: 5 }, { v: 9 }, { v: 7 }];
    expect(competitionRanks(rows, (r) => r.v)).toEqual([3, 1, 2]);
  });
});

describe("ordinal", () => {
  it("handles the teens as TH", () => {
    expect(ordinal(11)).toBe("11TH");
    expect(ordinal(12)).toBe("12TH");
    expect(ordinal(13)).toBe("13TH");
  });

  it("handles 1/2/3 endings outside the teens", () => {
    expect(ordinal(1)).toBe("1ST");
    expect(ordinal(2)).toBe("2ND");
    expect(ordinal(3)).toBe("3RD");
    expect(ordinal(21)).toBe("21ST");
    expect(ordinal(22)).toBe("22ND");
    expect(ordinal(23)).toBe("23RD");
    expect(ordinal(30)).toBe("30TH");
  });
});
