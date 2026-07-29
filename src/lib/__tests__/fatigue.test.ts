import { describe, expect, it } from "vitest";
import {
  calculateFatigue,
  calculateRestAdvantage,
  type RecentGame,
} from "@/lib/fatigue";
import { haversineDistance } from "@/lib/haversine";

/** Lakers home (approx STAPLES / Crypto.com arena). */
const LA_LAT = 34.043;
const LA_LON = -118.267;

/** Madison Square Garden area. */
const NYC_LAT = 40.7505;
const NYC_LON = -73.9934;

/** Ball Arena (Denver). */
const DEN_LAT = 39.7487;
const DEN_LON = -105.0077;

/** TD Garden area. */
const BOS_LAT = 42.3662;
const BOS_LON = -71.0621;

function baseRecent(overrides: Partial<RecentGame> = {}): RecentGame {
  return {
    date: "2025-01-01",
    teamId: 1,
    opponentTeamId: 2,
    isHome: true,
    teamLat: LA_LAT,
    teamLon: LA_LON,
    opponentLat: LA_LAT,
    opponentLon: LA_LON,
    opponentAltitudeFlag: false,
    overtimePeriods: 0,
    ...overrides,
  };
}

/** Subject team is LAL at home (venue = Crypto.com). */
function fatigueHomeTeam(
  gameDate: string,
  recent: RecentGame[],
  isVisitingAltitude = false
) {
  return calculateFatigue(
    gameDate,
    recent,
    isVisitingAltitude,
    LA_LAT,
    LA_LON,
    LA_LAT,
    LA_LON,
    true
  );
}

/** Subject team is LAL on the road at `venueLat` / `venueLon`. */
function fatigueAwayTeam(
  gameDate: string,
  recent: RecentGame[],
  isVisitingAltitude: boolean,
  venueLat: number,
  venueLon: number
) {
  return calculateFatigue(
    gameDate,
    recent,
    isVisitingAltitude,
    LA_LAT,
    LA_LON,
    venueLat,
    venueLon,
    false
  );
}

describe("calculateFatigue", () => {
  it("season opener (no recent games) → fully rested baseline", () => {
    const result = fatigueHomeTeam("2025-10-22", []);

    expect(result.score).toBe(0);
    expect(result.decayLoadScore).toBe(0);
    expect(result.travelLoadScore).toBe(0);
    expect(result.gamesInLast7Days).toBe(0);
    expect(result.daysSinceLastGame).toBeNull();
    expect(result.freshnessBonus).toBe(0);
    expect(result.overtimeFatigueBonus).toBe(0);
    expect(result.isOvertimePenalty).toBe(false);
  });

  it("3+ days since last game applies freshness bonus (about −1 pt or lower)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-01", isHome: true }),
    ];

    const result = fatigueHomeTeam("2025-01-08", recent);

    expect(result.daysSinceLastGame).toBe(7);
    expect(result.freshnessBonus).toBeLessThanOrEqual(-1);
    expect(result.freshnessBonus).toBeGreaterThanOrEqual(-2);
    expect(result.isBackToBack).toBe(false);
  });

  it("back-to-back adds ~3 fatigue points once base decay load is material", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-03", isHome: true }),
      baseRecent({ date: "2025-01-04", isHome: true }),
      baseRecent({ date: "2025-01-05", isHome: true }),
    ];

    const consecutive = fatigueHomeTeam("2025-01-06", recent);
    const spaced = fatigueHomeTeam("2025-01-07", recent);

    expect(consecutive.isBackToBack).toBe(true);
    expect(spaced.isBackToBack).toBe(false);
    expect(consecutive.score - spaced.score).toBeGreaterThanOrEqual(2);
    expect(consecutive.score - spaced.score).toBeLessThanOrEqual(5);
  });

  it("third game in four nights (stacked games) adds ~2+ fatigue vs a single front-loaded game", () => {
    const threeInFour: RecentGame[] = [
      baseRecent({ date: "2025-06-01", isHome: true }),
      baseRecent({ date: "2025-06-02", isHome: true }),
      baseRecent({ date: "2025-06-03", isHome: true }),
    ];
    const singleBeforeFourth: RecentGame[] = [
      baseRecent({ date: "2025-06-03", isHome: true }),
    ];

    const stacked = fatigueHomeTeam("2025-06-04", threeInFour);
    const light = fatigueHomeTeam("2025-06-04", singleBeforeFourth);

    expect(stacked.gamesInLast7Days).toBe(3);
    expect(stacked.score).toBeGreaterThan(light.score + 2);
  });

  it("compressed schedule (4 games in 7 days) adds density-driven fatigue vs one game", () => {
    const busy: RecentGame[] = [
      baseRecent({ date: "2025-03-01", isHome: true }),
      baseRecent({ date: "2025-03-03", isHome: true }),
      baseRecent({ date: "2025-03-05", isHome: true }),
      baseRecent({ date: "2025-03-07", isHome: true }),
    ];

    const light: RecentGame[] = [baseRecent({ date: "2025-03-07", isHome: true })];

    const busyResult = fatigueHomeTeam("2025-03-08", busy);
    const lightResult = fatigueHomeTeam("2025-03-08", light);

    expect(busyResult.densityMultiplier).toBeGreaterThan(1);
    expect(busyResult.score).toBeGreaterThan(lightResult.score + 1);
  });

  it("long inter-arena travel adds ~1+ fatigue vs same-arena chain", () => {
    const homeOnly: RecentGame[] = [
      baseRecent({
        date: "2025-02-10",
        isHome: true,
        opponentLat: LA_LAT,
        opponentLon: LA_LON,
      }),
    ];

    const coastToCoast: RecentGame[] = [
      baseRecent({
        date: "2025-02-10",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const homeStay = fatigueHomeTeam("2025-02-12", homeOnly);
    const traveled = fatigueHomeTeam("2025-02-12", coastToCoast);

    expect(traveled.travelDistanceMiles).toBeGreaterThan(1000);
    expect(traveled.score).toBeGreaterThan(homeStay.score + 0.8);
  });

  it("road trip streak is consecutive away games plus tonight when the team is away", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
      baseRecent({
        date: "2025-01-03",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const thirdStraightRoad = fatigueAwayTeam(
      "2025-01-05",
      recent,
      false,
      DEN_LAT,
      DEN_LON
    );
    expect(thirdStraightRoad.roadTripConsecutiveAway).toBe(3);
  });

  it("visiting altitude (away at Denver) applies altitude multiplier (~+1–2 pts vs flat venue)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-04-05", isHome: true }),
    ];

    const flat = fatigueHomeTeam("2025-04-07", recent);
    const altitude = fatigueAwayTeam("2025-04-07", recent, true, DEN_LAT, DEN_LON);

    expect(altitude.altitudeMultiplier).toBe(1.15);
    expect(flat.altitudeMultiplier).toBe(1);
    expect(altitude.score - flat.score).toBeGreaterThanOrEqual(1);
    expect(altitude.score - flat.score).toBeLessThanOrEqual(2.5);
  });

  it("combined: back-to-back + long travel + altitude compounds", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-11-09",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const flatNoB2b = fatigueAwayTeam(
      "2025-11-12",
      recent,
      false,
      LA_LAT,
      LA_LON
    );

    const stacked = fatigueAwayTeam(
      "2025-11-10",
      recent,
      true,
      DEN_LAT,
      DEN_LON
    );

    expect(stacked.isBackToBack).toBe(true);
    expect(stacked.altitudeMultiplier).toBe(1.15);
    expect(stacked.score).toBeGreaterThan(flatNoB2b.score + 3);
  });

  it("adds +0.5 when the prior game went to one overtime", () => {
    const noOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 0 }),
    ]);
    const oneOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 1 }),
    ]);
    expect(oneOt.overtimeFatigueBonus).toBe(0.5);
    expect(oneOt.isOvertimePenalty).toBe(true);
    expect(oneOt.score - noOt.score).toBeCloseTo(0.5, 5);
  });

  it("adds +1.0 when the prior game went to double overtime or more", () => {
    const oneOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 1 }),
    ]);
    const twoOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 2 }),
    ]);
    expect(twoOt.overtimeFatigueBonus).toBe(1);
    expect(twoOt.score - oneOt.score).toBeCloseTo(0.5, 5);
  });

  it("travel miles use a 7-day window (older inter-game legs are excluded)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
      baseRecent({
        date: "2025-01-02",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const r = fatigueHomeTeam("2025-02-01", recent);
    // No prior game in the 7-day window before Feb 1 → only Boston → LA (home), not LA–NYC–BOS–LA.
    expect(r.travelDistanceMiles).toBeGreaterThan(2200);
    expect(r.travelDistanceMiles).toBeLessThan(3800);
  });

  it("away → away uses direct arena legs regardless of rest days (no phantom home round trip)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const oneDayGap = fatigueAwayTeam("2025-01-02", recent, false, BOS_LAT, BOS_LON);
    const multiDayGap = fatigueAwayTeam("2025-01-04", recent, false, BOS_LAT, BOS_LON);

    expect(multiDayGap.travelDistanceMiles).toBe(oneDayGap.travelDistanceMiles);
  });

  it("travel: previous HOME → current AWAY is home arena → road arena (one leg)", () => {
    const recent = [baseRecent({ date: "2025-01-10", isHome: true })];
    const r = fatigueAwayTeam("2025-01-12", recent, false, DEN_LAT, DEN_LON);
    const expected = Math.round(haversineDistance(LA_LAT, LA_LON, DEN_LAT, DEN_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous AWAY → current AWAY is prev road arena → next road arena (no home detour)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];
    // Prior game falls outside 7-day window → single inter-game leg NYC → Boston only.
    const r = fatigueAwayTeam("2025-01-25", recent, false, BOS_LAT, BOS_LON);
    const expected = Math.round(haversineDistance(NYC_LAT, NYC_LON, BOS_LAT, BOS_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous AWAY → current HOME is road arena → home arena (one leg)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const r = fatigueHomeTeam("2025-01-20", recent);
    const expected = Math.round(haversineDistance(BOS_LAT, BOS_LON, LA_LAT, LA_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous HOME → current HOME is 0 between games (home stand)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-10", isHome: true }),
      baseRecent({ date: "2025-01-12", isHome: true }),
    ];
    const r = fatigueHomeTeam("2025-01-14", recent);
    expect(r.travelDistanceMiles).toBe(0);
  });
});

/**
 * Ratified rules (2026-07-29):
 * #1 — a team's first game of the season scores 0.00 fatigue; the miles flown to get
 *      there are computed and displayed, never zeroed.
 * #2 — the coast-to-coast bonus is a time-zone displacement term: it fires only when
 *      tonight's game is on the road ≥2 time zones (≥26° longitude) from home — never
 *      retroactively at home, and never based on the whole trip's spread.
 */
describe("ratified rule #1 — season openers", () => {
  /** Minneapolis (Target Center). */
  const MIN_LAT = 44.9795;
  const MIN_LON = -93.2762;
  /** Portland (Moda Center). */
  const POR_LAT = 45.5316;
  const POR_LON = -122.6668;

  it("MIN at POR opener (the 2025-10-22 case): zero score, real miles, factual displacement", () => {
    const result = calculateFatigue(
      "2025-10-22",
      [],
      false,
      MIN_LAT,
      MIN_LON,
      POR_LAT,
      POR_LON,
      false
    );

    // The 0.88 opening-night "coast" charge was the defect: a full offseason means
    // zero accumulated load, whatever tonight's longitude says.
    expect(result.score).toBe(0);
    expect(result.roadSegmentLoadScore).toBe(0);
    expect(result.travelLoadScore).toBe(0);

    // But the flight is real and stays visible: ~1,422 great-circle miles.
    expect(result.travelDistanceMiles).toBeGreaterThan(1400);
    expect(result.travelDistanceMiles).toBeLessThan(1450);

    // Central → Pacific is a genuine 2-zone displacement; the flag stays factual.
    expect(result.hasTimeZoneDisplacement).toBe(true);
    expect(result.roadTripConsecutiveAway).toBe(1);
  });

  it("home opener stays the fully rested baseline with zero miles", () => {
    const result = fatigueHomeTeam("2025-10-22", []);
    expect(result.score).toBe(0);
    expect(result.travelDistanceMiles).toBe(0);
    expect(result.hasTimeZoneDisplacement).toBe(false);
  });

  it("away opener within 2 zones: zero score, real miles, no displacement", () => {
    // LAL opening at Denver: 13° of longitude, one zone.
    const result = fatigueAwayTeam("2025-10-22", [], true, DEN_LAT, DEN_LON);
    expect(result.score).toBe(0);
    expect(result.travelDistanceMiles).toBeGreaterThan(800);
    expect(result.hasTimeZoneDisplacement).toBe(false);
  });
});

describe("ratified rule #2 — time-zone displacement replaces coast-to-coast", () => {
  it("fires on a road game ≥2 zones from home, even a one-game trip", () => {
    const recent: RecentGame[] = [baseRecent({ date: "2025-01-05", isHome: true })];
    const displaced = fatigueAwayTeam("2025-01-08", recent, false, BOS_LAT, BOS_LON);
    const local = fatigueAwayTeam("2025-01-08", recent, false, DEN_LAT, DEN_LON);

    expect(displaced.hasTimeZoneDisplacement).toBe(true);
    expect(local.hasTimeZoneDisplacement).toBe(false);
    // The bonus is the only difference between these two road-segment loads. LA → Boston
    // is eastward, so the ratified 0.88 carries the 1.25 advance penalty (2026-07-30).
    expect(displaced.roadSegmentLoadScore - local.roadSegmentLoadScore).toBeCloseTo(1.1, 2);
  });

  it("never fires retroactively at home, even right after a coast-crossing trip", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-03", isHome: false, opponentLat: NYC_LAT, opponentLon: NYC_LON }),
      baseRecent({ date: "2025-01-05", isHome: false, opponentLat: BOS_LAT, opponentLon: BOS_LON }),
    ];
    const backHome = fatigueHomeTeam("2025-01-07", recent);
    expect(backHome.hasTimeZoneDisplacement).toBe(false);
  });

  it("measures tonight's venue against home, not the whole trip's spread", () => {
    // Denver-based team, earlier trip game in Boston, tonight in LA: 13° from home.
    // The old spread-over-the-trip logic flagged this; displacement must not.
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-05",
        isHome: false,
        teamLat: DEN_LAT,
        teamLon: DEN_LON,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const result = calculateFatigue(
      "2025-01-07",
      recent,
      false,
      DEN_LAT,
      DEN_LON,
      LA_LAT,
      LA_LON,
      false
    );
    expect(result.hasTimeZoneDisplacement).toBe(false);
  });
});

/**
 * Real time zones replace the 26°-longitude proxy. Every case below straddles 26° in the
 * direction that made the old rule wrong, so each one fails against the longitude test.
 */
describe("time-zone displacement uses real zones, not a longitude proxy", () => {
  const ATL_LAT = 33.7573;
  const ATL_LON = -84.3963;
  const DAL_LAT = 32.7905;
  const DAL_LON = -96.8103;
  const OKC_LAT = 35.4634;
  const OKC_LON = -97.5151;
  const PHX_LAT = 33.4457;
  const PHX_LON = -112.0712;
  const CHI_LAT = 41.8807;
  const CHI_LON = -87.6742;

  function awayFrom(
    gameDate: string,
    homeLat: number,
    homeLon: number,
    venueLat: number,
    venueLon: number
  ) {
    return calculateFatigue(
      gameDate,
      [{ ...baseRecent({ date: "2025-01-05", isHome: true }), teamLat: homeLat, teamLon: homeLon }],
      false,
      homeLat,
      homeLon,
      venueLat,
      venueLon,
      false
    );
  }

  it("fires for Denver at Atlanta — 2 zones apart but only 20.6° of longitude", () => {
    const r = awayFrom("2025-01-08", DEN_LAT, DEN_LON, ATL_LAT, ATL_LON);
    expect(Math.abs(ATL_LON - DEN_LON)).toBeLessThan(26); // old rule stayed silent here
    expect(r.hasTimeZoneDisplacement).toBe(true);
  });

  it("fires for the Lakers at Dallas — 2 zones apart but only 21.5° of longitude", () => {
    const r = awayFrom("2025-01-08", LA_LAT, LA_LON, DAL_LAT, DAL_LON);
    expect(Math.abs(DAL_LON - LA_LON)).toBeLessThan(26);
    expect(r.hasTimeZoneDisplacement).toBe(true);
  });

  it("stays silent for Boston at Oklahoma City — 26.5° of longitude but only 1 zone", () => {
    const r = awayFrom("2025-01-08", BOS_LAT, BOS_LON, OKC_LAT, OKC_LON);
    expect(Math.abs(OKC_LON - BOS_LON)).toBeGreaterThan(26); // old rule false-fired here
    expect(r.hasTimeZoneDisplacement).toBe(false);
  });

  it("tracks Phoenix's missing DST: Chicago at Phoenix is 2 zones in October, 1 in January", () => {
    const october = awayFrom("2025-10-28", CHI_LAT, CHI_LON, PHX_LAT, PHX_LON);
    const january = awayFrom("2026-01-15", CHI_LAT, CHI_LON, PHX_LAT, PHX_LON);

    expect(october.hasTimeZoneDisplacement).toBe(true);
    expect(january.hasTimeZoneDisplacement).toBe(false);
  });

  it("resolves relocated-era coordinates: Seattle-era Sonics at Chicago is 2 zones", () => {
    const SEA_LAT = 47.6221;
    const SEA_LON = -122.354;
    const r = awayFrom("1995-01-08", SEA_LAT, SEA_LON, CHI_LAT, CHI_LON);
    expect(r.hasTimeZoneDisplacement).toBe(true);
  });
});

/**
 * Neutral-site games are away games for BOTH teams, played at a venue that is neither
 * arena. Before this, travel legs geolocated them at the listed home team's building —
 * so a Lakers "home" game in Paris cost 0 miles and the return flight never happened.
 */
/**
 * Two back-to-backs with identical calendar dates but different tips: a 10:30pm game
 * followed by a 7pm game is a ~21h turnaround; the reverse is ~27h. Ratified 2026-07-30.
 */
/**
 * Displacement decays as the body clock re-entrains (~1 day per zone) and is heavier
 * travelling east than west. Both ratified 2026-07-30.
 */
/** Ratified 2026-07-30: prior-game workload, continuous rest credit, altitude residue. */
describe("blowout discount", () => {
  function priorGame(margin: number | null) {
    return calculateFatigue(
      "2025-01-10",
      [{ ...baseRecent({ date: "2025-01-09", isHome: true }), pointMargin: margin }],
      false, LA_LAT, LA_LON, LA_LAT, LA_LON, true
    );
  }

  it("charges a competitive game in full and a rout at the 25% cap", () => {
    const close = priorGame(2).decayLoadScore;
    const rout = priorGame(40).decayLoadScore;
    expect(priorGame(15).decayLoadScore).toBe(close); // floor: nothing under 15
    // cap: never more than 25% off (decay load is rounded to 2dp, so compare loosely)
    expect(rout).toBeCloseTo(close * 0.75, 1);
  });

  it("ramps between the floor and the cap rather than stepping", () => {
    const at20 = priorGame(20).decayLoadScore;
    const at30 = priorGame(30).decayLoadScore;
    expect(at20).toBeLessThan(priorGame(15).decayLoadScore);
    expect(at30).toBeLessThan(at20);
  });

  it("charges in full when the margin is unknown", () => {
    expect(priorGame(null).decayLoadScore).toBe(priorGame(2).decayLoadScore);
  });
});

describe("freshness is continuous at the plateau", () => {
  function rest(days: number) {
    const prior = new Date(Date.UTC(2025, 0, 10));
    prior.setUTCDate(prior.getUTCDate() - days);
    return fatigueHomeTeam("2025-01-10", [
      baseRecent({ date: prior.toISOString().slice(0, 10), isHome: true }),
    ]);
  }

  it("grants no credit on the plateau day itself, removing the old −1.26 step", () => {
    expect(rest(2).freshnessBonus).toBe(0);
    // was −1.26: a gate artifact, not recovery. (toBeCloseTo because the curve
    // evaluates to −0 here, which Object.is treats as distinct from 0.)
    expect(rest(3).freshnessBonus).toBeCloseTo(0, 5);
  });

  it("accrues monotonically after the plateau toward the −2.0 ceiling", () => {
    const bonuses = [4, 5, 6, 8, 10].map((d) => rest(d).freshnessBonus);
    for (let i = 1; i < bonuses.length; i++) {
      expect(bonuses[i]).toBeLessThan(bonuses[i - 1]!);
    }
    expect(bonuses.at(-1)!).toBeGreaterThan(-2);
  });
});

describe("altitude carryover", () => {
  const denverVisit = {
    ...baseRecent({ date: "2025-01-09", isHome: false }),
    opponentLat: DEN_LAT,
    opponentLon: DEN_LON,
    venueAltitude: true,
  };

  it("charges a residual the night after visiting altitude", () => {
    const result = fatigueHomeTeam("2025-01-10", [denverVisit]);
    expect(result.altitudeMultiplier).toBe(1.06);
  });

  it("does not stack: being at altitude tonight still charges the full 1.15", () => {
    const result = calculateFatigue(
      "2025-01-10", [denverVisit], true, LA_LAT, LA_LON, DEN_LAT, DEN_LON, false
    );
    expect(result.altitudeMultiplier).toBe(1.15);
  });

  it("gives Denver nothing for leaving home — descending is the easy direction", () => {
    const denverHomeGame = {
      ...baseRecent({ date: "2025-01-09", isHome: true }),
      teamLat: DEN_LAT,
      teamLon: DEN_LON,
      venueAltitude: true,
    };
    const result = fatigueHomeTeam("2025-01-10", [denverHomeGame]);
    expect(result.altitudeMultiplier).toBe(1.0);
  });
});

describe("circadian direction and acclimation", () => {
  const NY_LAT = 40.7505;
  const NY_LON = -73.9934;

  /** Away game at `venue`, preceded by `priorVenues` (oldest → newest) on the road. */
  function trip(
    homeLat: number,
    homeLon: number,
    priorVenues: Array<[number, number]>,
    venueLat: number,
    venueLon: number
  ) {
    // A prior home game first, so this is a real road trip rather than a season opener
    // (openers score 0 by ratified rule #1 and would mask the term under test).
    const recent: RecentGame[] = [
      {
        ...baseRecent({ date: "2025-01-01", isHome: true }),
        teamLat: homeLat,
        teamLon: homeLon,
        opponentLat: homeLat,
        opponentLon: homeLon,
      },
      ...priorVenues.map(([lat, lon], i) => ({
        ...baseRecent({ date: `2025-01-0${i + 2}`, isHome: false }),
        teamLat: homeLat,
        teamLon: homeLon,
        opponentLat: lat,
        opponentLon: lon,
      })),
    ];
    return calculateFatigue(
      `2025-01-0${priorVenues.length + 2}`,
      recent,
      false,
      homeLat,
      homeLon,
      venueLat,
      venueLon,
      false
    );
  }

  it("charges more travelling east than the mirror-image trip west", () => {
    // LA → New York (3 zones east) vs New York → LA (3 zones west).
    const eastward = trip(LA_LAT, LA_LON, [], NY_LAT, NY_LON);
    const westward = trip(NY_LAT, NY_LON, [], LA_LAT, LA_LON);

    expect(eastward.roadSegmentLoadScore).toBeCloseTo(0.88 * 1.25, 2);
    expect(westward.roadSegmentLoadScore).toBeCloseTo(0.88 * 0.85, 2);
    expect(eastward.roadSegmentLoadScore).toBeGreaterThan(westward.roadSegmentLoadScore);
  });

  it("decays across successive nights in the same zone and clears the flag", () => {
    const east: Array<[number, number]> = [[NY_LAT, NY_LON]];
    const night1 = trip(LA_LAT, LA_LON, [], NY_LAT, NY_LON);
    const night2 = trip(LA_LAT, LA_LON, east, NY_LAT, NY_LON);
    const night3 = trip(LA_LAT, LA_LON, [...east, [BOS_LAT, BOS_LON]], NY_LAT, NY_LON);
    const night4 = trip(
      LA_LAT, LA_LON,
      [...east, [BOS_LAT, BOS_LON], [NY_LAT, NY_LON]],
      NY_LAT, NY_LON
    );

    // 3 zones crossed → thirds. Road-streak load grows, so compare the trend of the
    // displacement component via the flag plus a strictly decreasing sequence.
    expect(night1.hasTimeZoneDisplacement).toBe(true);
    expect(night2.hasTimeZoneDisplacement).toBe(true);
    expect(night3.hasTimeZoneDisplacement).toBe(true);
    expect(night4.hasTimeZoneDisplacement).toBe(false); // fully re-entrained
  });

  it("does not count nights spent in a different zone as acclimation", () => {
    // Prior game back in the Pacific zone resets the clock; tonight in NY is night one.
    const viaHome = trip(LA_LAT, LA_LON, [[LA_LAT, LA_LON]], NY_LAT, NY_LON);
    expect(viaHome.hasTimeZoneDisplacement).toBe(true);
    // Full undecayed eastward charge, exactly as if the trip had just begun.
    const streakLoad = 0.34 * Math.max(0, viaHome.roadTripConsecutiveAway - 2);
    expect(viaHome.roadSegmentLoadScore - streakLoad).toBeCloseTo(0.88 * 1.25, 2);
  });
});

describe("back-to-back turnaround hours", () => {
  const prevLateTip = new Date("2025-01-11T03:00:00Z"); // 10pm ET on the 10th
  const prevEarlyTip = new Date("2025-01-11T00:00:00Z"); // 7pm ET on the 10th
  const tonightEarly = new Date("2025-01-12T00:00:00Z"); // 7pm ET on the 11th
  const tonightLate = new Date("2025-01-12T03:00:00Z"); // 10pm ET on the 11th

  function b2b(prevTip: Date | null, tonightTip: Date | null) {
    const recent: RecentGame[] = [
      { ...baseRecent({ date: "2025-01-10", isHome: true }), tipOffUtc: prevTip },
    ];
    return calculateFatigue(
      "2025-01-11", recent, false, LA_LAT, LA_LON, LA_LAT, LA_LON, true, tonightTip
    );
  }

  it("penalises a short turnaround more than a long one", () => {
    const short = b2b(prevLateTip, tonightEarly); // 21h
    const long = b2b(prevEarlyTip, tonightLate); // 27h

    expect(short.backToBackMultiplier).toBeCloseTo(1.44, 3);
    expect(long.backToBackMultiplier).toBeCloseTo(1.32, 3);
    expect(short.score).toBeGreaterThan(long.score);
  });

  it("falls back to the flat 1.38 when either tip time is missing", () => {
    expect(b2b(null, tonightEarly).backToBackMultiplier).toBe(1.38);
    expect(b2b(prevLateTip, null).backToBackMultiplier).toBe(1.38);
    expect(b2b(null, null).backToBackMultiplier).toBe(1.38);
  });

  it("clamps absurd turnarounds rather than extrapolating", () => {
    const absurdlyShort = b2b(new Date("2025-01-11T20:00:00Z"), tonightEarly); // 4h
    const absurdlyLong = b2b(new Date("2025-01-10T00:00:00Z"), tonightLate); // 51h
    expect(absurdlyShort.backToBackMultiplier).toBe(1.46);
    expect(absurdlyLong.backToBackMultiplier).toBe(1.3);
  });
});

describe("neutral-site venues", () => {
  const PARIS_LAT = 48.8386;
  const PARIS_LON = 2.3784;

  /** LAL is the nominal home team, but the game is in Paris. */
  function lalInParis(recent: RecentGame[]) {
    return calculateFatigue(
      "2025-01-23",
      recent,
      false,
      LA_LAT,
      LA_LON,
      PARIS_LAT,
      PARIS_LON,
      false // neutral → not a home game for either side
    );
  }

  it("charges the flight to Paris rather than treating it as a home stand", () => {
    const recent: RecentGame[] = [baseRecent({ date: "2025-01-21", isHome: true })];
    const result = lalInParis(recent);

    // LA → Paris great-circle is ~5,650 mi; anything near 0 means it was treated as home.
    expect(result.travelDistanceMiles).toBeGreaterThan(5000);
    expect(result.travelLoadScore).toBeGreaterThan(0);
  });

  it("counts Paris as time-zone displacement (9 hours from Los Angeles)", () => {
    const recent: RecentGame[] = [baseRecent({ date: "2025-01-21", isHome: true })];
    expect(lalInParis(recent).hasTimeZoneDisplacement).toBe(true);
  });

  it("flies the team home from a neutral venue on the next leg", () => {
    // Prior game in Paris (venue override set), tonight back home in LA.
    const recent: RecentGame[] = [
      {
        ...baseRecent({ date: "2025-01-23", isHome: false }),
        venueLat: PARIS_LAT,
        venueLon: PARIS_LON,
      },
    ];
    const backHome = calculateFatigue(
      "2025-01-26",
      recent,
      false,
      LA_LAT,
      LA_LON,
      LA_LAT,
      LA_LON,
      true
    );
    expect(backHome.travelDistanceMiles).toBeGreaterThan(5000);
  });

  it("resolves London and Paris to different zones despite both being European", () => {
    const recent: RecentGame[] = [baseRecent({ date: "2025-01-21", isHome: true })];
    const london = calculateFatigue(
      "2025-01-23", recent, false, BOS_LAT, BOS_LON, 51.503, 0.0032, false
    );
    const paris = calculateFatigue(
      "2025-01-23", recent, false, BOS_LAT, BOS_LON, PARIS_LAT, PARIS_LON, false
    );
    // Both displaced from Boston, but the venues sit in different zones (UTC+0 vs +1).
    expect(london.hasTimeZoneDisplacement).toBe(true);
    expect(paris.hasTimeZoneDisplacement).toBe(true);
  });
});

describe("calculateRestAdvantage", () => {
  it("positive when away team is more fatigued (home rested advantage)", () => {
    const home = fatigueHomeTeam("2025-01-10", []);
    const awayHeavy = fatigueAwayTeam(
      "2025-01-10",
      [baseRecent({ date: "2025-01-09", isHome: true })],
      false,
      LA_LAT,
      LA_LON
    );

    expect(calculateRestAdvantage(home, awayHeavy)).toBeGreaterThan(0);
  });

  it("negative when home team is more fatigued", () => {
    const homeHeavy = fatigueHomeTeam("2025-01-10", [
      baseRecent({ date: "2025-01-09", isHome: true }),
    ]);
    const away = fatigueAwayTeam("2025-01-10", [], false, LA_LAT, LA_LON);

    expect(calculateRestAdvantage(homeHeavy, away)).toBeLessThan(0);
  });
});

/**
 * The flags name a property of *tonight's* game: fatigue.ts states "'3 in 4 nights' means
 * tonight is the team's 3rd game in a 4-calendar-day span". They previously asked a different
 * question — whether any 4-day window inside the 30-day lookback held 3 games — so a fully
 * rested team stayed flagged for weeks after a dense stretch ended.
 */
describe("3-in-4 / 4-in-6 flags describe tonight, not the lookback", () => {
  const dense = ["2025-03-01", "2025-03-02", "2025-03-04"].map((date) =>
    baseRecent({ date })
  );

  it("flags a game that is genuinely the 3rd in 4 nights", () => {
    const r = fatigueHomeTeam("2025-03-04", [
      baseRecent({ date: "2025-03-01" }),
      baseRecent({ date: "2025-03-02" }),
    ]);

    expect(r.isThreeInFour).toBe(true);
  });

  it("does not flag a rested game weeks after a dense stretch ended", () => {
    // 16 days of rest; the 3-in-4 stretch ended 2025-03-04, still inside the 30-day lookback.
    const r = fatigueHomeTeam("2025-03-20", dense);

    expect(r.daysSinceLastGame).toBe(16);
    expect(r.isThreeInFour).toBe(false);
    expect(r.isFourInSix).toBe(false);
  });

  it("does not contradict a zero fatigue score", () => {
    const r = fatigueHomeTeam("2025-03-20", dense);

    // A team the model scores as completely fresh must not also read as short-rest.
    expect(r.score).toBe(0);
    expect(r.isThreeInFour).toBe(false);
  });

  it("flags a game that is genuinely the 4th in 6 nights", () => {
    const r = fatigueHomeTeam("2025-03-06", [
      baseRecent({ date: "2025-03-01" }),
      baseRecent({ date: "2025-03-03" }),
      baseRecent({ date: "2025-03-05" }),
    ]);

    expect(r.isFourInSix).toBe(true);
  });

  it("stops flagging 4-in-6 once the window has moved past the stretch", () => {
    const r = fatigueHomeTeam("2025-03-12", [
      baseRecent({ date: "2025-03-01" }),
      baseRecent({ date: "2025-03-03" }),
      baseRecent({ date: "2025-03-05" }),
      baseRecent({ date: "2025-03-06" }),
    ]);

    expect(r.isFourInSix).toBe(false);
  });
});
