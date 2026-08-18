import { describe, expect, it } from "vitest";
import {
  mapEspnStatus,
  parseScoreboard,
  reconcileScores,
  toOurAbbr,
  type EspnScoreboardGame,
  type StoredGameRow,
} from "@/lib/espn-scoreboard";

/** A stored row with sane defaults; override only what a case is about. */
function row(over: Partial<StoredGameRow> = {}): StoredGameRow {
  return {
    id: 1,
    awayAbbr: "SAC",
    homeAbbr: "DET",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimePeriods: 0,
    ...over,
  };
}

function espn(over: Partial<EspnScoreboardGame> = {}): EspnScoreboardGame {
  return {
    eventId: "401810505",
    awayAbbr: "SAC",
    homeAbbr: "DET",
    status: "final",
    homeScore: 139,
    awayScore: 116,
    periods: 4,
    ...over,
  };
}

/** Shape of one ESPN scoreboard event, trimmed to the fields the parser reads. */
function event(over: {
  id?: string;
  state?: string;
  completed?: boolean;
  homeAbbr?: string;
  awayAbbr?: string;
  homeScore?: string;
  awayScore?: string;
  periods?: number;
} = {}) {
  const {
    id = "401810505",
    state = "post",
    completed = true,
    homeAbbr = "DET",
    awayAbbr = "SAC",
    homeScore = "139",
    awayScore = "116",
    periods = 4,
  } = over;
  const linescores = Array.from({ length: periods }, () => ({ value: 25 }));
  return {
    id,
    competitions: [
      {
        status: { type: { state, completed } },
        competitors: [
          { homeAway: "home", score: homeScore, team: { abbreviation: homeAbbr }, linescores },
          { homeAway: "away", score: awayScore, team: { abbreviation: awayAbbr }, linescores },
        ],
      },
    ],
  };
}

describe("mapEspnStatus", () => {
  it("reads state rather than completed, so a postponed game is not final", () => {
    // ESPN ships a postponement as state "post" with completed false. Trusting `post` alone
    // would publish it as a finished 0-0 game.
    expect(mapEspnStatus("post", false)).toBe("scheduled");
    expect(mapEspnStatus("post", true)).toBe("final");
  });

  it("maps in-progress and pre-game states", () => {
    expect(mapEspnStatus("in", false)).toBe("live");
    expect(mapEspnStatus("pre", false)).toBe("scheduled");
    expect(mapEspnStatus(undefined, undefined)).toBe("scheduled");
  });
});

describe("toOurAbbr", () => {
  it("translates ESPN's abbreviations and passes through the ones that match", () => {
    expect(toOurAbbr("GS")).toBe("GSW");
    expect(toOurAbbr("UTAH")).toBe("UTA");
    expect(toOurAbbr("WSH")).toBe("WAS");
    expect(toOurAbbr("BOS")).toBe("BOS");
  });

  it("folds relocated franchises onto the row that carries their history", () => {
    expect(toOurAbbr("SEA")).toBe("OKC");
    expect(toOurAbbr("VAN")).toBe("MEM");
    expect(toOurAbbr("NJ")).toBe("BKN");
  });
});

describe("parseScoreboard", () => {
  it("parses a completed game with its scores and period count", () => {
    expect(parseScoreboard({ events: [event()] })).toEqual([
      {
        eventId: "401810505",
        awayAbbr: "SAC",
        homeAbbr: "DET",
        status: "final",
        homeScore: 139,
        awayScore: 116,
        periods: 4,
      },
    ]);
  });

  it("reports no score for a scheduled game rather than ESPN's placeholder zero", () => {
    const [g] = parseScoreboard({
      events: [event({ state: "pre", completed: false, homeScore: "0", awayScore: "0", periods: 0 })],
    });
    expect(g.status).toBe("scheduled");
    expect(g.homeScore).toBeNull();
    expect(g.awayScore).toBeNull();
    expect(g.periods).toBeNull();
  });

  it("drops Cup knockout placeholders rather than inventing a TBD fixture", () => {
    expect(parseScoreboard({ events: [event({ homeAbbr: "TBD", awayAbbr: "TBD" })] })).toEqual([]);
  });

  it("drops malformed events instead of throwing", () => {
    expect(parseScoreboard({ events: [{ id: "1", competitions: [{}] }, {}] })).toEqual([]);
    expect(parseScoreboard({})).toEqual([]);
    expect(parseScoreboard(null)).toEqual([]);
  });

  it("applies the abbreviation mapping while parsing", () => {
    const [g] = parseScoreboard({ events: [event({ homeAbbr: "GS", awayAbbr: "UTAH" })] });
    expect(g.homeAbbr).toBe("GSW");
    expect(g.awayAbbr).toBe("UTA");
  });
});

describe("reconcileScores", () => {
  it("matches on the pairing, not on any id, and writes the finished score", () => {
    const result = reconcileScores([row()], [espn()]);
    expect(result.updates).toEqual([
      { gameId: 1, status: "final", homeScore: 139, awayScore: 116, overtimePeriods: 0 },
    ]);
  });

  it("returns nothing when the stored row already matches the feed", () => {
    const stored = row({ status: "final", homeScore: 139, awayScore: 116, overtimePeriods: 0 });
    expect(reconcileScores([stored], [espn()]).updates).toEqual([]);
  });

  it("derives overtime periods from the line score", () => {
    const [update] = reconcileScores([row()], [espn({ periods: 6 })]).updates;
    expect(update.overtimePeriods).toBe(2);
  });

  it("never writes overtime from a game still in progress", () => {
    // A live game reports the periods played SO FAR. Period 5 mid-game must not be read as an
    // overtime that has not happened; that would feed a phantom OT penalty into tonight's fatigue.
    const [update] = reconcileScores(
      [row()],
      [espn({ status: "live", periods: 5, homeScore: 90, awayScore: 88 })]
    ).updates;
    expect(update.status).toBe("live");
    expect(update.overtimePeriods).toBeNull();
  });

  it("refuses to walk a stored final backwards and reports it instead", () => {
    const stored = row({ status: "final", homeScore: 139, awayScore: 116 });
    const result = reconcileScores([stored], [espn({ status: "scheduled", homeScore: null, awayScore: null })]);
    expect(result.updates).toEqual([]);
    expect(result.refusedDowngrades).toEqual([1]);
  });

  it("reports an ESPN event with no stored row rather than silently dropping it", () => {
    // How a mid-season NBA Cup fixture, or a rescheduled game, announces itself.
    const result = reconcileScores([], [espn()]);
    expect(result.updates).toEqual([]);
    expect(result.unmatchedEspn.map((g) => g.eventId)).toEqual(["401810505"]);
  });

  it("reports a stored row the feed did not carry", () => {
    const result = reconcileScores([row({ id: 7 })], []);
    expect(result.updates).toEqual([]);
    expect(result.unmatchedStored.map((r) => r.id)).toEqual([7]);
  });

  it("pairs each row independently when a date carries several games", () => {
    const stored = [
      row({ id: 1, awayAbbr: "SAC", homeAbbr: "DET" }),
      row({ id: 2, awayAbbr: "BOS", homeAbbr: "MIA" }),
      row({ id: 3, awayAbbr: "LAL", homeAbbr: "PHX" }),
    ];
    const feed = [
      espn({ awayAbbr: "BOS", homeAbbr: "MIA", homeScore: 101, awayScore: 99, periods: 5 }),
      espn({ awayAbbr: "SAC", homeAbbr: "DET" }),
    ];
    const result = reconcileScores(stored, feed);
    expect(result.updates.map((u) => u.gameId).sort()).toEqual([1, 2]);
    expect(result.updates.find((u) => u.gameId === 2)?.overtimePeriods).toBe(1);
    expect(result.unmatchedStored.map((r) => r.id)).toEqual([3]);
  });

  it("updates a row keyed by an espn- id exactly as it updates a stats-keyed one", () => {
    // The whole point of matching on the pairing: 2026-27 rows carry `espn-<id>` external_ids
    // and older rows carry `002…`, and this writer must not be able to tell the difference.
    const result = reconcileScores([row({ id: 42 })], [espn()]);
    expect(result.updates.map((u) => u.gameId)).toEqual([42]);
  });
});
