import { describe, expect, it } from "vitest";
import source from "@/data/arena-history.json";
import { createArenaHistory, type ArenaHistory } from "@/lib/arena-history";
import { eraCoordinates, requiresFixtureVenueCorrection } from "@/lib/team-era-coordinates";
import { haversineDistance } from "@/lib/haversine";

const history = createArenaHistory(source as ArenaHistory);
const at = (abbr: string, date: string) => eraCoordinates(abbr, date, 0, 0);

describe("sourced franchise arena and modeled-base history", () => {
  it("covers all 30 franchises explicitly, including current arenas", () => {
    expect(history.abbreviations).toHaveLength(30);
    for (const abbr of history.abbreviations) {
      expect(history.arenaFor(abbr, "2026-10-20")).not.toBeNull();
      expect(at(abbr, "2026-10-20").latitude).not.toBe(0);
    }
  });

  it("keeps Seattle and Vancouver before relocation, then uses the actual Memphis building", () => {
    expect(at("OKC", "2008-04-16").latitude).toBeCloseTo(47.6221, 3);
    expect(at("OKC", "2008-10-29").latitude).toBeCloseTo(35.4635, 3);
    expect(at("MEM", "1996-11-01").latitude).toBeCloseTo(49.2778, 3);
    expect(history.arenaFor("MEM", "2001-10-30")?.id).toBe("mem-pyramid");
    expect(history.arenaFor("MEM", "2004-11-03")?.id).toBe("mem-fedex");
  });

  it("preserves explicitly established Katrina and Tampa operating-base bounds", () => {
    expect(at("NOP", "2004-11-01").latitude).toBeCloseTo(29.949, 3);
    expect(at("NOP", "2006-01-15")).toEqual(at("OKC", "2008-10-29"));
    expect(at("NOP", "2007-11-01").latitude).toBeCloseTo(29.949, 3);
    expect(at("TOR", "2020-11-30").latitude).toBeCloseTo(43.6435, 3);
    expect(at("TOR", "2020-12-01").latitude).toBeCloseTo(27.9427, 3);
    expect(at("TOR", "2021-06-30").latitude).toBeCloseTo(27.9427, 3);
    expect(at("TOR", "2021-07-01").latitude).toBeCloseTo(43.6435, 3);
  });

  it("separates Forum, Sports Arena, shared Staples and Intuit eras", () => {
    expect(history.arenaFor("LAL", "1999-05-23")?.id).toBe("lal-forum");
    expect(history.arenaFor("LAC", "1999-05-05")?.id).toBe("lac-sports");
    const lal = at("LAL", "2024-04-01"), lac = at("LAC", "2024-04-01");
    expect(lal).toEqual(lac);
    expect(haversineDistance(lal.latitude, lal.longitude, lac.latitude, lac.longitude)).toBe(0);
    expect(history.arenaFor("LAC", "2024-10-23")?.id).toBe("lac-intuit");
    expect(history.arenaFor("LAL", "2024-10-23")?.id).toBe("la-staples");
  });

  it("resolves in-metro moves and midseason cutovers instead of using today's building", () => {
    expect(history.arenaFor("DET", "1988-06-16")?.id).toBe("det-silverdome");
    expect(history.arenaFor("DET", "1988-11-05")?.id).toBe("det-palace");
    expect(history.arenaFor("DET", "2017-10-18")?.id).toBe("det-lca");
    expect(history.arenaFor("MIA", "1999-12-29")?.id).toBe("mia-old");
    expect(history.arenaFor("MIA", "2000-01-02")?.id).toBe("mia-kaseya");
    expect(history.arenaFor("WAS", "1997-11-29")?.id).toBe("was-capitalcentre");
    expect(history.arenaFor("WAS", "1997-12-02")?.id).toBe("was-capitalone");
    expect(history.arenaFor("TOR", "1999-02-19")?.id).toBe("tor-skydome");
    expect(history.arenaFor("TOR", "1999-02-21")?.id).toBe("tor-scotia");
  });

  it("keeps Atlanta's mixed-arena base explicit without inventing an active Omni era", () => {
    expect(history.arenaFor("ATL", "1998-01-01")).toBeNull();
    expect(at("ATL", "1998-01-01")).toEqual({ latitude: 33.7573, longitude: -84.3963 });
    expect(requiresFixtureVenueCorrection("ATL", "1998-01-01")).toBe(true);
    expect(requiresFixtureVenueCorrection("ATL", "1999-07-01")).toBe(false);
  });

  it("retains caller fallback only outside registered franchise/date coverage", () => {
    expect(eraCoordinates("NEW", "2026-10-20", 10, 20)).toEqual({ latitude: 10, longitude: 20 });
  });
});
