import { describe, expect, it } from "vitest";
import { freshnessFromRow } from "../../scripts/daily-freshness";

const row = { observed_at: "2026-10-15T21:20:00.000Z", session_timezone: "UTC",
  eligible_games: 2, present_rows: 4, missing_rows: 0,
  oldest_computed_at: "2026-10-15 21:00:00", latest_computed_at: "2026-10-15 21:19:00",
  oldest_age_seconds: 1200, latest_age_seconds: 60 };

describe("scoped fatigue freshness", () => {
  it("reports oldest and newest latest-per-side row age with counts", () => {
    expect(freshnessFromRow(row, "2026-10-15", "2026-10-29")).toMatchObject({
      status: "estimated", expected_rows: 4, present_rows: 4,
      oldest_age_seconds: 1200, latest_age_seconds: 60,
      window_from_et: "2026-10-15", window_to_et: "2026-10-29",
    });
  });
  it("does not turn partial coverage into complete freshness", () => {
    expect(freshnessFromRow({ ...row, present_rows: 3, missing_rows: 1 }, "2026-10-15", "2026-10-29").status).toBe("incomplete");
  });
  it("does not publish ages under an unverified non-UTC session", () => {
    expect(freshnessFromRow({ ...row, session_timezone: "America/New_York" }, "2026-10-15", "2026-10-29")).toMatchObject({
      status: "unknown", oldest_age_seconds: null, latest_age_seconds: null,
    });
  });
  it("future computed timestamps are unknown rather than perfectly fresh", () => {
    expect(freshnessFromRow({ ...row, latest_age_seconds: -60 }, "2026-10-15", "2026-10-29")).toMatchObject({
      status: "unknown", reason: "future_computed_at", oldest_age_seconds: null, latest_age_seconds: null,
    });
  });
  it("inconsistent or non-finite counters cannot establish coverage", () => {
    expect(freshnessFromRow({ ...row, present_rows: 2 }, "2026-10-15", "2026-10-29").status).toBe("unknown");
    expect(freshnessFromRow({ ...row, eligible_games: "NaN" }, "2026-10-15", "2026-10-29").status).toBe("unknown");
  });
  it("empty eligible window has no inferred row age", () => {
    expect(freshnessFromRow({ ...row, eligible_games: 0, present_rows: 0, missing_rows: 0,
      oldest_computed_at: null, latest_computed_at: null, oldest_age_seconds: null,
      latest_age_seconds: null }, "2026-10-15", "2026-10-29")).toMatchObject({ status: "no_data", oldest_age_seconds: null });
  });
});
