import { PgDialect } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { fatigueScores } from "@/lib/db/schema";
import { backfillGameFilter } from "../../../scripts/backfill-fatigue-selection";

/**
 * backfill_fatigue.ts scores against prior *final* games, so an unplayed game scored by it comes
 * back as a measured 0.0 dead heat (2026-08-18). Asserted on the generated SQL, since the rows a
 * database happens to return prove nothing about the clause.
 */
const homeFatigue = alias(fatigueScores, "home_fatigue");
const awayFatigue = alias(fatigueScores, "away_fatigue");
const render = (opts: { force: boolean; start?: string; end?: string }) =>
  new PgDialect().sqlToQuery(
    backfillGameFilter({ ...opts, homeFatigueId: homeFatigue.id, awayFatigueId: awayFatigue.id })
  );

describe("backfill fatigue game selection", () => {
  it("only selects final games, in both modes", () => {
    for (const force of [true, false]) {
      const { sql, params } = render({ force });
      expect(sql).toContain('"games"."status" = $1');
      expect(params[0]).toBe("final");
    }
  });

  it("treats a game missing either side's row as a gap", () => {
    const { sql } = render({ force: false });
    expect(sql).toContain('("home_fatigue"."id" is null or "away_fatigue"."id" is null)');
  });

  it("recomputes every final game under --force, ignoring the date range", () => {
    const { sql, params } = render({ force: true, start: "2022-10-01", end: "2023-06-30" });
    expect(sql).not.toContain("is null");
    expect(params).toEqual(["final"]);
  });

  it("applies the date range to the gap mode", () => {
    const { sql, params } = render({ force: false, start: "2022-10-01", end: "2023-06-30" });
    expect(sql).toContain('"games"."date" between $2 and $3');
    expect(params).toEqual(["final", "2022-10-01", "2023-06-30"]);
  });
});
