import { describe, expect, it } from "vitest";
import { inlineFlags, teamGameFlags } from "@/components/matchup-parts";
import type { GameResponse } from "@/types";

/** The board's strip width and inline cap (`matchup-table.tsx`). */
const STRIP = 104;
const MAX = 2;

describe("inlineFlags", () => {
  it("keeps two four-character chips and the overflow count", () => {
    expect(inlineFlags(["B2B", "3IN4", "4IN6"], STRIP, MAX)).toEqual({ shown: ["B2B", "3IN4"], hidden: 1 });
  });

  it("drops a second long chip that would push the strip past its width", () => {
    expect(inlineFlags(["TIME ZONES", "4IN6", "OT"], STRIP, MAX)).toEqual({ shown: ["TIME ZONES"], hidden: 2 });
    expect(inlineFlags(["B2B", "TIME ZONES"], STRIP, MAX)).toEqual({ shown: ["B2B"], hidden: 1 });
  });

  it("shows a single long chip on its own", () => {
    expect(inlineFlags(["TIME ZONES"], STRIP, MAX)).toEqual({ shown: ["TIME ZONES"], hidden: 0 });
  });
});

describe("teamGameFlags", () => {
  it("shows time zones on the host's line too, as at a neutral site abroad", () => {
    const game = {
      awayFatigue: { hasTimeZoneDisplacement: true },
      homeFatigue: { hasTimeZoneDisplacement: true },
    } as unknown as GameResponse;
    expect(teamGameFlags(game)).toEqual({ away: ["TIME ZONES"], home: ["TIME ZONES"] });
  });
});


it("does not expose stale flags for a Cup-pending side, while keeping the known side", () => {
  const game = {
    cupSchedulePending: { home: true, away: false },
    homeFatigue: { isBackToBack: true, is3In4: true, isOvertimePenalty: true },
    awayFatigue: { isBackToBack: true },
  } as unknown as GameResponse;
  expect(teamGameFlags(game)).toEqual({ home: [], away: ["B2B"] });
});
