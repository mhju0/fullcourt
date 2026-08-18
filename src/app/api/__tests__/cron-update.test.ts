import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The evening score pass. It cannot be exercised against a real slate until the season starts,
 * so its contract is pinned here instead: it must read ESPN (not the NBA CDN, which 403s), match
 * on the pairing (not on an id, which cannot match an `espn-` external_id), and never walk a
 * stored final backwards.
 */

const selectWhere = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: selectWhere }),
        }),
      }),
    }),
    update: () => ({ set: updateSet }),
  },
}));

vi.mock("@/lib/nba-season", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nba-season")>();
  return { ...actual, formatEasternDateKey: () => "2026-10-20" };
});

const { GET } = await import("../cron/update/route");

/** One ESPN scoreboard event, trimmed to the fields the parser reads. */
function event(over: {
  state?: string;
  completed?: boolean;
  homeAbbr?: string;
  awayAbbr?: string;
  homeScore?: string;
  awayScore?: string;
  periods?: number;
} = {}) {
  const {
    state = "post",
    completed = true,
    homeAbbr = "OKC",
    awayAbbr = "HOU",
    homeScore = "125",
    awayScore = "124",
    periods = 6,
  } = over;
  const linescores = Array.from({ length: periods }, () => ({ value: 25 }));
  return {
    id: "401800001",
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

function storedRow(over: Record<string, unknown> = {}) {
  return {
    id: 72409,
    homeAbbr: "OKC",
    awayAbbr: "HOU",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimePeriods: 0,
    ...over,
  };
}

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/update", {
    headers: auth ? { authorization: auth } : {},
  });
}

function espnResponds(events: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events }) })
  );
}

describe("GET /api/cron/update", () => {
  beforeEach(() => {
    selectWhere.mockReset();
    updateSet.mockReset().mockReturnValue({ where: updateWhere });
    updateWhere.mockClear();
    process.env.CRON_SECRET = "test-secret";
    delete process.env.VERCEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(selectWhere).not.toHaveBeenCalled();
  });

  it("does nothing when no game is scheduled or live today", async () => {
    selectWhere.mockResolvedValue([]);
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.gamesUpdated).toBe(0);
  });

  it("reads ESPN, scoped to today's ET date", async () => {
    selectWhere.mockResolvedValue([storedRow()]);
    espnResponds([event()]);

    await GET(req("Bearer test-secret"));

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain("site.api.espn.com");
    expect(url).toContain("dates=20261020");
    expect(url).not.toContain("cdn.nba.com");
  });

  it("finalizes a game and writes its overtime from the same payload", async () => {
    selectWhere.mockResolvedValue([storedRow()]);
    espnResponds([event({ periods: 6 })]);

    const res = await GET(req("Bearer test-secret"));

    expect((await res.json()).data.gamesUpdated).toBe(1);
    expect(updateSet).toHaveBeenCalledWith({
      status: "final",
      homeScore: 125,
      awayScore: 124,
      overtimePeriods: 2,
    });
  });

  it("matches a row keyed by an espn- external_id, which an id-keyed feed could not", async () => {
    // The row carries no id the ESPN feed shares; the pairing is the only thing they have
    // in common, and it is enough.
    selectWhere.mockResolvedValue([storedRow({ id: 999 })]);
    espnResponds([event()]);

    const res = await GET(req("Bearer test-secret"));
    expect((await res.json()).data.gamesUpdated).toBe(1);
  });

  it("leaves overtime alone for a game still in progress", async () => {
    // A live game reports the periods played so far, so period 5 must not be written as an
    // overtime that has not finished happening.
    selectWhere.mockResolvedValue([storedRow()]);
    espnResponds([event({ state: "in", completed: false, periods: 5, homeScore: "90", awayScore: "88" })]);

    await GET(req("Bearer test-secret"));

    expect(updateSet).toHaveBeenCalledWith({
      status: "live",
      homeScore: 90,
      awayScore: 88,
    });
  });

  it("refuses to walk a stored final backwards and reports the refusal", async () => {
    selectWhere.mockResolvedValue([
      storedRow({ status: "final", homeScore: 125, awayScore: 124, overtimePeriods: 2 }),
    ]);
    espnResponds([event({ state: "pre", completed: false, periods: 0 })]);

    const res = await GET(req("Bearer test-secret"));
    const body = await res.json();

    expect(body.data.gamesUpdated).toBe(0);
    expect(body.meta.refusedDowngrades).toBe(1);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("returns 502 rather than a partial write when ESPN is unavailable", async () => {
    selectWhere.mockResolvedValue([storedRow()]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const res = await GET(req("Bearer test-secret"));

    expect(res.status).toBe(502);
    expect(updateSet).not.toHaveBeenCalled();
  });
});
