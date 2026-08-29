import { describe, expect, it } from "vitest";
import { buildGameStoryline } from "@/lib/game-storyline";
import type { FatigueInfo, TeamInfo } from "@/types";

const team = (abbreviation: string): TeamInfo => ({
  id: 1,
  name: abbreviation,
  abbreviation,
  city: abbreviation,
});

const restedFatigue = (overrides: Partial<FatigueInfo> = {}): FatigueInfo => ({
  score: 2,
  isBackToBack: false,
  is3In4: false,
  travelDistanceMiles: 0,
  altitudePenalty: false,
  altitudeArenaLabel: null,
  daysRest: 2,
  gamesInLast7Days: 2,
  gamesInLast30Days: 12,
  is4In6: false,
  isOvertimePenalty: false,
  roadTripConsecutiveAway: 0,
  hasTimeZoneDisplacement: false,
  ...overrides,
});

const game = (away: FatigueInfo | null, home: FatigueInfo | null) => ({
  awayTeam: team("DEN"),
  homeTeam: team("LAL"),
  awayFatigue: away,
  homeFatigue: home,
});

describe("buildGameStoryline", () => {
  it("is silent on an ordinary game — the line only exists when there is a story", () => {
    expect(buildGameStoryline(game(restedFatigue(), restedFatigue()))).toBeNull();
  });

  it("is silent when fatigue is unmeasured", () => {
    expect(buildGameStoryline(game(null, null))).toBeNull();
  });

  it("names one team's single story plainly", () => {
    expect(buildGameStoryline(game(restedFatigue({ isBackToBack: true }), restedFatigue()))).toBe(
      "DEN on a back-to-back."
    );
  });

  it("joins a team's clauses with 'and', and both teams with a semicolon", () => {
    const s = buildGameStoryline(
      game(
        restedFatigue({ isBackToBack: true, altitudePenalty: true }),
        restedFatigue({ is4In6: true })
      )
    );
    expect(s).toBe("DEN on a back-to-back and at altitude; LAL 4th game in 6 nights.");
  });

  it("never says 3-in-4 and 4-in-6 together — the same nights would be counted twice", () => {
    const s = buildGameStoryline(
      game(restedFatigue({ is3In4: true, is4In6: true }), restedFatigue())
    );
    expect(s).toBe("DEN 4th game in 6 nights.");
  });

  it("caps a stacked team at three clauses, in priority order", () => {
    const s = buildGameStoryline(
      game(
        restedFatigue({
          isBackToBack: true,
          is4In6: true,
          altitudePenalty: true,
          roadTripConsecutiveAway: 6,
          isOvertimePenalty: true,
          hasTimeZoneDisplacement: true,
        }),
        restedFatigue()
      )
    );
    expect(s).toBe("DEN on a back-to-back, 4th game in 6 nights and at altitude.");
  });

  it("says a long road trip with a real ordinal", () => {
    const s = buildGameStoryline(
      game(restedFatigue({ roadTripConsecutiveAway: 5 }), restedFatigue())
    );
    expect(s).toBe("DEN 5th straight road game.");
  });

  it("ignores road trips shorter than four games — two away games is not a story", () => {
    expect(
      buildGameStoryline(game(restedFatigue({ roadTripConsecutiveAway: 3 }), restedFatigue()))
    ).toBeNull();
  });
});
