import { describe, expect, it } from "vitest";
import { eraCoordinates } from "@/lib/team-era-coordinates";

/** Current-arena fallbacks as seeded (OKC Paycom Center, MEM FedExForum, NOP Smoothie King). */
const OKC = { lat: 35.4634, lon: -97.5151 };
const MEM = { lat: 35.1382, lon: -90.0506 };
const NOP = { lat: 29.9489, lon: -90.0821 };

describe("eraCoordinates", () => {
  it("geolocates Sonics-era OKC games in Seattle, through the 2007-08 season", () => {
    const opener1985 = eraCoordinates("OKC", "1985-10-25", OKC.lat, OKC.lon);
    expect(opener1985.latitude).toBeCloseTo(47.6221, 3);
    expect(opener1985.longitude).toBeCloseTo(-122.354, 3);

    const lastSeattleSeason = eraCoordinates("OKC", "2008-04-16", OKC.lat, OKC.lon);
    expect(lastSeattleSeason.longitude).toBeCloseTo(-122.354, 3);
  });

  it("returns today's arena from the first OKC season onward", () => {
    const okcDebut = eraCoordinates("OKC", "2008-10-29", OKC.lat, OKC.lon);
    expect(okcDebut.latitude).toBe(OKC.lat);
    expect(okcDebut.longitude).toBe(OKC.lon);
  });

  it("geolocates Grizzlies games in Vancouver through 2000-01, Memphis after", () => {
    const vancouver = eraCoordinates("MEM", "1996-11-01", MEM.lat, MEM.lon);
    expect(vancouver.latitude).toBeCloseTo(49.2778, 3);

    const memphis = eraCoordinates("MEM", "2001-10-30", MEM.lat, MEM.lon);
    expect(memphis.latitude).toBe(MEM.lat);
  });

  it("puts the Katrina-era Hornets in Oklahoma City for 2005-07 only", () => {
    const preKatrina = eraCoordinates("NOP", "2004-11-01", NOP.lat, NOP.lon);
    expect(preKatrina.latitude).toBe(NOP.lat);

    const okcYears = eraCoordinates("NOP", "2006-01-15", NOP.lat, NOP.lon);
    expect(okcYears.latitude).toBeCloseTo(35.4634, 3);
    expect(okcYears.longitude).toBeCloseTo(-97.5151, 3);

    const backInNola = eraCoordinates("NOP", "2007-11-01", NOP.lat, NOP.lon);
    expect(backInNola.latitude).toBe(NOP.lat);
  });

  it("passes through untouched for franchises that never moved", () => {
    const lal = eraCoordinates("LAL", "1987-01-01", 34.043, -118.2673);
    expect(lal).toEqual({ latitude: 34.043, longitude: -118.2673 });
  });
});
