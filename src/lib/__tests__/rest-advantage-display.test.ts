import { describe, expect, it } from "vitest";
import { formatRestAdvantageDisplay } from "@/lib/rest-advantage-display";

describe("formatRestAdvantageDisplay", () => {
  it("labels the away team when the API marks away as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 3.2, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "LAL",
      value: "3.2",
      text: "LAL 3.2",
    });
  });

  it("labels the home team when the API marks home as advantaged", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: -3.2, advantageTeam: "home" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      kind: "team",
      teamAbbreviation: "BOS",
      value: "3.2",
      text: "BOS 3.2",
    });
  });

  it("keeps one decimal for small non-zero values", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 0.3, advantageTeam: "away" },
        "BOS",
        "LAL"
      )
    ).toMatchObject({
      value: "0.3",
      text: "LAL 0.3",
    });
  });

  it("displays neutral text for neutral/no-call values", () => {
    expect(
      formatRestAdvantageDisplay(
        { differential: 0.3, advantageTeam: "neutral" },
        "BOS",
        "LAL"
      )
    ).toEqual({
      kind: "neutral",
      text: "NEUTRAL",
    });
  });
});
