import { describe, expect, it } from "vitest";
import { buildGameStoryline } from "@/lib/game-storyline";
import type { FatigueInfo, TeamInfo } from "@/types";

const team = (abbreviation: string, name: string): TeamInfo => ({
  id: 1,
  name,
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
  daysRest: 1,
  gamesInLast7Days: 2,
  gamesInLast30Days: 12,
  is4In6: false,
  isOvertimePenalty: false,
  roadTripConsecutiveAway: 0,
  hasTimeZoneDisplacement: false,
  ...overrides,
});

const game = (away: FatigueInfo | null, home: FatigueInfo | null) => ({
  status: "scheduled",
  season: "2026-27",
  awayTeam: team("DEN", "Nuggets"),
  homeTeam: team("LAL", "Lakers"),
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
      "Nuggets on a back-to-back."
    );
  });

  it("joins a team's clauses with 'and', and both teams with a semicolon", () => {
    const s = buildGameStoryline(
      game(
        restedFatigue({ isBackToBack: true, altitudePenalty: true }),
        restedFatigue({ is4In6: true })
      )
    );
    expect(s).toBe("Nuggets on a back-to-back and playing at altitude; Lakers playing a 4th game in 6 nights.");
  });

  it("never says 3-in-4 and 4-in-6 together — the same nights would be counted twice", () => {
    const s = buildGameStoryline(
      game(restedFatigue({ is3In4: true, is4In6: true }), restedFatigue())
    );
    expect(s).toBe("Nuggets playing a 4th game in 6 nights.");
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
    expect(s).toBe("Nuggets on a back-to-back, playing a 4th game in 6 nights and playing at altitude.");
  });

  it("says a long road trip with a real ordinal", () => {
    const s = buildGameStoryline(
      game(restedFatigue({ roadTripConsecutiveAway: 5 }), restedFatigue())
    );
    expect(s).toBe("Nuggets playing a 5th straight road game.");
  });

  it("names the team by its nickname for that season, not today's", () => {
    const s = buildGameStoryline({
      ...game(restedFatigue({ isBackToBack: true }), restedFatigue({ is3In4: true })),
      season: "2005-06",
      awayTeam: team("NOP", "Pelicans"),
      homeTeam: team("OKC", "Thunder"),
    });
    expect(s).toBe("Hornets on a back-to-back; SuperSonics playing a 3rd game in 4 nights.");
  });

  it("ignores road trips shorter than four games — two away games is not a story", () => {
    expect(
      buildGameStoryline(game(restedFatigue({ roadTripConsecutiveAway: 3 }), restedFatigue()))
    ).toBeNull();
  });
});

it("says playing at altitude for tonight's venue", () => {
  expect(buildGameStoryline(game(restedFatigue({ altitudePenalty: true, altitudeArenaLabel: "Denver (altitude)" }), restedFatigue()))).toBe("Nuggets playing at altitude.");
});

it.each(["postponed", "cancelled"])("does not narrate opener or fatigue claims for %s", status => {
  expect(buildGameStoryline({...game(null,null),status,seasonOpeners:{home:true,away:true}})).toBeNull();
  expect(buildGameStoryline({...game(restedFatigue({isBackToBack:true}),restedFatigue()),status,seasonOpeners:{home:true,away:false}})).toBeNull();
});
