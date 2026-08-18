import { describe, expect, it } from "vitest";
import { formatDataAsOf } from "@/lib/data-as-of";

/**
 * The "as of" stamp (2026-08-18, UIUX_CHECKLIST §5). What matters here is what the line
 * refuses to say: no stamp without a date, and no reformatting of an ET calendar date.
 */
describe("formatDataAsOf", () => {
  it("names the date, and only the date", () => {
    // The count is read but not printed: on /analysis a `47,143 FINAL GAMES` stamp sat four
    // lines above a tile reading `27,400 GAMES`, two populations under one noun. If a count
    // reappears here, that misreading is back.
    expect(formatDataAsOf({ latestFinalDate: "2026-04-13", finalGames: 46201 })).toBe(
      "AS OF 2026-04-13"
    );
  });

  it("says nothing at all when there is no date to stand on", () => {
    // A surface that prints `AS OF —` spends a line to make no claim. The caller renders
    // nothing instead — the whole-element form of the NO_FIGURE rule.
    expect(formatDataAsOf({ latestFinalDate: null, finalGames: 0 })).toBeNull();
    expect(formatDataAsOf(null)).toBeNull();
    expect(formatDataAsOf(undefined)).toBeNull();
  });

  it("passes the ET date through untouched", () => {
    // `games.date` is already the ET calendar date of tip-off. Routing it through a Date is
    // how an ET date silently becomes a UTC one — the bug class SEASON_ROLLOVER records. If
    // this ever renders "2026-04-12" for this input, that conversion has been reintroduced.
    const line = formatDataAsOf({ latestFinalDate: "2026-04-13", finalGames: 1 });
    expect(line).toContain("2026-04-13");
  });

  it("is not the footer's RENDERED stamp", () => {
    // Both are timestamps in mono at 11px, and only the wording keeps a reader from reading
    // layout freshness as data freshness. The footer says RENDERED and a UTC minute; this
    // says AS OF and an ET game date.
    const line = formatDataAsOf({ latestFinalDate: "2026-04-13", finalGames: 12 }) ?? "";
    expect(line).not.toContain("RENDERED");
    expect(line).not.toMatch(/UTC/);
    expect(line.startsWith("AS OF ")).toBe(true);
  });
});
