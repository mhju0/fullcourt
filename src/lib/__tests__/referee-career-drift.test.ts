import { describe, expect, it } from "vitest";
import facts from "@/data/referee-career-drift.json";
import { MIN_GAMES } from "@/lib/referee-foul-style";

describe("published referee career-window evidence", () => {
  it("uses the same full-window publication bar as the browse table", () => {
    expect(facts.windowGames).toBe(MIN_GAMES);
    expect(facts.minCareerForSplit).toBeGreaterThan(facts.windowGames);
    expect(facts.drift.cells).toBe(facts.drift.officialsTested * 6);
    expect(facts.drift.officialsTested).toBeLessThanOrEqual(facts.publishedOfficials);
  });

  it("keeps the method-page shares consistent with their denominators", () => {
    for (const result of [facts.drift, facts.seasonSplit]) {
      expect(result.cells).toBeGreaterThan(0);
      expect(result.beyond).toBeLessThanOrEqual(result.cells);
      expect(result.sharePct).toBeCloseTo(100 * result.beyond / result.cells, 1);
    }
  });

  it("still supports the method-page claim that careers obscure changing patterns", () => {
    expect(facts.drift.sharePct).toBeGreaterThan(facts.drift.chancePct);
    expect(facts.drift.leadingTraitChanges).toBeGreaterThan(0);
    expect(facts.drift.leadingTraitChanges).toBeLessThanOrEqual(facts.publishedOfficials);
    expect(facts.drift.windowBoldCells).toBeLessThan(facts.drift.careerBoldCells);
    expect(facts.seasonSplit.signAgreementPct).toBeGreaterThanOrEqual(0);
    expect(facts.seasonSplit.signAgreementPct).toBeLessThanOrEqual(100);
  });
});
