import { describe, expect, it } from "vitest";
import { gamePhase, hasNotTipped, spokenGameState } from "@/lib/game-phase";

const TIP = "2026-10-20T23:00:00.000Z"; // 7:00 PM ET
const at = (hours: number) => Date.parse(TIP) + hours * 3_600_000;

describe("gamePhase", () => {
  it("is upcoming until the tip time", () => {
    expect(gamePhase("scheduled", TIP, at(-0.01))).toBe("upcoming");
  });

  it("is live from the tip time for three hours", () => {
    expect(gamePhase("scheduled", TIP, at(0))).toBe("live");
    expect(gamePhase("scheduled", TIP, at(2.99))).toBe("live");
  });

  it("awaits the final from three hours after the tip", () => {
    expect(gamePhase("scheduled", TIP, at(3))).toBe("awaitingFinal");
    expect(gamePhase("scheduled", TIP, at(11.99))).toBe("awaitingFinal");
  });

  it("falls back to upcoming when no final arrived in twelve hours, so a postponed game is not left waiting", () => {
    expect(gamePhase("scheduled", TIP, at(12))).toBe("upcoming");
  });

  it("is final as soon as the stored status says so, whatever the clock reads", () => {
    expect(gamePhase("final", TIP, at(-5))).toBe("final");
    expect(gamePhase("final", TIP, at(1))).toBe("final");
    expect(gamePhase("final", null, at(1))).toBe("final");
  });

  it("reads a stored live status by the clock too, so it cannot outlast the game", () => {
    expect(gamePhase("live", TIP, at(1))).toBe("live");
    expect(gamePhase("live", TIP, at(5))).toBe("awaitingFinal");
  });

  it("is upcoming when the schedule carries no tip time", () => {
    expect(gamePhase("scheduled", null, at(1))).toBe("upcoming");
  });

  it("accepts the instant as a Date", () => {
    expect(gamePhase("scheduled", new Date(TIP), at(1))).toBe("live");
  });
});

describe("hasNotTipped", () => {
  it("keeps a game until its tip time and drops it after", () => {
    expect(hasNotTipped(TIP, at(-1))).toBe(true);
    expect(hasNotTipped(TIP, at(0))).toBe(false);
  });

  it("keeps a game whose tip time is unknown", () => {
    expect(hasNotTipped(null, at(0))).toBe(true);
  });
});

describe("spokenGameState", () => {
  it("says nothing for a game that has not tipped", () => {
    expect(spokenGameState("upcoming", null, null)).toBe("");
  });

  it("names the live and pending states", () => {
    expect(spokenGameState("live", null, null)).toBe(", live,");
    expect(spokenGameState("awaitingFinal", null, null)).toBe(", result pending,");
  });

  it("reads a final score in the order the row shows it, away then home", () => {
    expect(spokenGameState("final", 112, 104)).toBe(", final 112 to 104,");
  });

  it("says final without a score when none is stored", () => {
    expect(spokenGameState("final", null, 104)).toBe(", final,");
  });
});
