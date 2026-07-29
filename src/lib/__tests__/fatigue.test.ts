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
    // The bonus is the only difference between these two road-segment loads.
    expect(displaced.roadSegmentLoadScore - local.roadSegmentLoadScore).toBeCloseTo(0.88, 2);
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
