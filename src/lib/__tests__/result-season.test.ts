import { describe, expect, it } from "vitest";
import { latestUsableResultSeason } from "@/lib/result-season";

describe("latest usable result season", () => {
  it("finds the latest actual publication across gaps and unsorted inputs", () => {
    expect(latestUsableResultSeason(["2024-25", "2022-23"], "2026-27", false)).toBe("2024-25");
  });
  it("requires both publication and readiness for current-season defaults", () => {
    expect(latestUsableResultSeason(["2024-25", "2026-27"], "2026-27", false)).toBe("2024-25");
    expect(latestUsableResultSeason(["2024-25", "2026-27"], "2026-27", true)).toBe("2026-27");
    expect(latestUsableResultSeason(["2024-25"], "2026-27", true)).toBe("2024-25");
  });
  it("returns no made-up fallback when no usable publication exists", () => {
    expect(latestUsableResultSeason([], "2026-27", false)).toBeNull();
    expect(latestUsableResultSeason(["2026-27", "2027-28"], "2026-27", false)).toBeNull();
  });
});
