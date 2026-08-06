/**
 * The published fallbacks, pinned. Both readers that label teams render these strings
 * into a table a person reads, so they are part of the site's copy, not a detail.
 */
import { describe, expect, it } from "vitest";
import { teamLabeller } from "@/lib/team-labels";

const DIRECTORY = [
  { id: 1610612747, abbreviation: "LAL", name: "Los Angeles Lakers" },
  { id: 1610612738, abbreviation: "BOS", name: "Boston Celtics" },
];

describe("teamLabeller", () => {
  it("labels a team the directory has", () => {
    const label = teamLabeller(DIRECTORY);

    expect(label(1610612747)).toEqual({
      abbreviation: "LAL",
      name: "Los Angeles Lakers",
    });
  });

  /**
   * `teams` holds the current league; `games` reaches back to 1985-86. A franchise with
   * rows in one and not the other is the case these strings exist for.
   */
  it("names a team the directory does not have, rather than leaving a blank cell", () => {
    const label = teamLabeller(DIRECTORY);

    expect(label(1610612758)).toEqual({
      abbreviation: "—",
      name: "Team 1610612758",
    });
  });

  it("writes the missing abbreviation as an em-dash, not as a minus sign", () => {
    // U+2014, not the U+2212 that `signed-number.ts` renders: this is an absent label,
    // not a negative quantity, and the two are indistinguishable by eye in review.
    const dash = teamLabeller([])(1).abbreviation;

    expect(dash.codePointAt(0)).toBe(0x2014);
  });

  it("labels from an empty directory without throwing", () => {
    const label = teamLabeller([]);

    expect(label(42).name).toBe("Team 42");
  });

  it("answers the same way for the same id", () => {
    const label = teamLabeller(DIRECTORY);

    expect(label(1610612738)).toEqual(label(1610612738));
  });
});
