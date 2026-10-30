import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import scheduledTipFixture from "@/lib/__tests__/fixtures/espn-scheduled-tip-change.json";

/**
 * The evening score pass. It cannot be exercised against a real slate until the season starts,
 * so its contract is pinned here instead: it must read ESPN (not the NBA CDN, which 403s), match
 * on the pairing (not on an id, which cannot match an `espn-` external_id), and never walk a
 * stored final backwards.
 */

const selectWhere = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const updateReturning = vi.fn();

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

/**
 * Date-aware on purpose. The route asks for two ET dates — `formatEasternDateKey()` for today
 * and `formatEasternDateKey(<24h ago>)` for yesterday — and a stub that ignored its argument
 * would collapse them into one, hiding the whole window this file exists to pin.
 */
vi.mock("@/lib/nba-season", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nba-season")>();
  return {
    ...actual,
    formatEasternDateKey: (date?: Date) => (date ? actual.formatEasternDateKey(date) : today),
  };
});

const TODAY = "2026-10-20";
const YESTERDAY = "2026-10-19";
let today = TODAY;

const recoveryIds = vi.fn();
const refreshGame = vi.fn();
vi.mock("@/lib/daily-refresh-port", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/daily-refresh-port")>();
  return {
    ...actual,
    selectRecoveryGameIds: recoveryIds,
    withCronDbDeadline: (_db: unknown, _deadline: number, work: (tx: unknown) => Promise<unknown>) => work({
      select: () => ({ from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: selectWhere }) }) }) }),
      update: () => ({ set: updateSet }),
    }),
    createDailyRefreshPort: () => ({ refreshGame }),
  };
});

vi.mock("@/lib/game-status-write", () => ({
  writeGameStatus: async (_db: unknown, update: { expectedIdentity?: unknown; gameId: number; status: string; homeScore: number | null; awayScore: number | null; overtimePeriods: number | null; scheduledTip?: { tipOffUtc: string } }) => {
    const {status, homeScore, awayScore, overtimePeriods} = update;
    updateSet(update.scheduledTip ? { tipOffUtc: update.scheduledTip.tipOffUtc } : {status, homeScore, awayScore, ...(overtimePeriods !== null ? {overtimePeriods} : {})});
    const rows = await updateReturning();
    return {written: rows.length > 0, invalidated: 0};
  },
}));

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
        status: { type: { state, completed, name: state === "post" && completed ? "STATUS_FINAL" : state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED" } },
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
    date: TODAY,
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

function datedEvents(events: unknown[], compact: string): unknown[] {
  const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}T23:00:00Z`;
  return events.map(ev => ({...ev as object,date}));
}
function espnResponds(events: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => ({ok:true,json:async()=>({events:datedEvents(events,new URL(url).searchParams.get("dates")!)})}))
  );
}

/** Per-date scoreboards, so a two-date run can be told which night it read. */
function espnRespondsByDate(byDate: Record<string, unknown[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      const dateKey = new URL(url).searchParams.get("dates") ?? "";
      const events = datedEvents(byDate[dateKey] ?? [], dateKey);
      return { ok: true, json: async () => ({ events }) };
    })
  );
}

/** The `dates=` values the route actually asked ESPN for, in call order. */
function fetchedDates(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map((call) => new URL(call[0] as string).searchParams.get("dates") ?? "");
}

describe("GET /api/cron/update", () => {
  beforeEach(() => {
    today = TODAY;
    selectWhere.mockReset();
    recoveryIds.mockReset().mockResolvedValue([]);
    refreshGame.mockReset().mockResolvedValue({ status: "refreshed", predictionRowsWritten: 0 });
    updateSet.mockReset().mockReturnValue({ where: updateWhere });
    updateWhere.mockReset().mockReturnValue({ returning: updateReturning });
    updateReturning.mockReset().mockResolvedValue([{ id: 1 }]);
    process.env.CRON_SECRET = "test-secret";
    delete process.env.VERCEL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.CRON_SECRET;
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(selectWhere).not.toHaveBeenCalled();
  });

  it("does nothing when every game on the two dates is already final", async () => {
    selectWhere.mockResolvedValue([]);
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.gamesUpdated).toBe(0);
  });

  it("recovers stored-final fatigue when there are no unfinished score rows", async () => {
    selectWhere.mockResolvedValue([]);
    recoveryIds.mockResolvedValue([99]);
    const res = await GET(req("Bearer test-secret"));
    expect(refreshGame).toHaveBeenCalledWith(99, expect.objectContaining({ deadlineMs: expect.any(Number) }));
    expect((await res.json()).meta.fatigueRescored).toBe(1);
  });

  it("corrects the authentic CLE@ATL scheduled tip before its stale 7 PM ET time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T16:00:00Z"));
    today = "2026-10-29";
    selectWhere.mockResolvedValue([storedRow({ id: 118764, externalId: "espn-401909893", date: "2026-10-29",
      homeAbbr: "ATL", awayAbbr: "CLE", tipOffUtc: new Date("2026-10-29T23:00:00Z") })]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => scheduledTipFixture }));

    const res = await GET(req("Bearer test-secret"));

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ tipOffUtc: "2026-10-30T00:00:00.000Z" });
  });

  it("polls tomorrow's unfinished fixtures as well as today's and yesterday's", async () => {
    selectWhere.mockResolvedValue([storedRow({ date: "2026-10-21" })]);
    espnRespondsByDate({ "20261021": [event({ state: "pre", completed: false, periods: 0 })] });
    await GET(req("Bearer test-secret"));
    const query = new PgDialect().sqlToQuery(selectWhere.mock.calls[0][0]);
    expect(query.params.slice(0, 3)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(fetchedDates()).toEqual(["20261021"]);
  });

  it("runs recovery after an ESPN failure and exposes a sanitized degraded result", async () => {
    selectWhere.mockResolvedValue([storedRow()]);
    recoveryIds.mockResolvedValue([99]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("postgresql://secret@private")));
    const res = await GET(req("Bearer test-secret"));
    expect(refreshGame).toHaveBeenCalled();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret@private");
  });

  it("keeps good date finals when the other date feed fails", async () => {
    selectWhere.mockResolvedValue([storedRow({ id: 1, date: YESTERDAY }), storedRow({ id: 2 })]);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.includes("20261019")
      ? { ok: true, json: async () => ({ events: datedEvents([event()], "20261019") }) }
      : { ok: false, status: 403 }));
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(502);
    expect((await res.json()).data.gamesUpdated).toBe(1);
    expect(updateSet).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { events: null }, { events: {} }])("rejects malformed feed envelopes but still recovers: %j", async payload => {
    selectWhere.mockResolvedValue([storedRow()]);
    recoveryIds.mockResolvedValue([99]);
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>payload}));
    const res=await GET(req("Bearer test-secret"));
    expect(res.status).toBe(502);
    expect(updateSet).not.toHaveBeenCalled();
    expect(refreshGame).toHaveBeenCalledWith(99,expect.any(Object));
  });

  it("counts a write-time final guard refusal instead of a successful update", async () => {
    selectWhere.mockResolvedValue([storedRow({status:"live",homeScore:80,awayScore:79})]);
    updateReturning.mockResolvedValue([]);
    espnResponds([event({state:"pre",completed:false,periods:0})]);
    const res=await GET(req("Bearer test-secret"));
    const body=await res.json();
    expect(body.data.gamesUpdated).toBe(0);
    expect(body.meta.refusedDowngrades).toBe(1);
  });

  it("reads ESPN, scoped to the ET date of the games it found", async () => {
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

  it("writes nothing for a game still in progress", async () => {
    // A mid-game score would sit on the page unchanged until the next run, and period 5
    // mid-game is not yet an overtime. The Games page marks the game live from its tip time.
    selectWhere.mockResolvedValue([storedRow()]);
    espnResponds([event({ state: "in", completed: false, periods: 5, homeScore: "90", awayScore: "88" })]);

    const res = await GET(req("Bearer test-secret"));

    expect((await res.json()).data.gamesUpdated).toBe(0);
    expect(updateSet).not.toHaveBeenCalled();
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

  /**
   * The window, pinned at both ends.
   *
   * The late runs fire after midnight ET (vercel.json), so by the time they run, the games
   * they exist to finalize are on ET date D while "today" is already D+1. From the 2026-08-18
   * schedule move until 2026-08-22 the route scoped to today alone and therefore matched
   * nothing at all. These fail if the window is ever narrowed back.
   */
  describe("the after-midnight window", () => {
    it("finalizes last night's game, which a today-only scope could not see", async () => {
      selectWhere.mockResolvedValue([storedRow({ date: YESTERDAY })]);
      espnRespondsByDate({ "20261019": [event()] });

      const res = await GET(req("Bearer test-secret"));

      expect(fetchedDates()).toEqual(["20261019"]);
      expect((await res.json()).data.gamesUpdated).toBe(1);
      expect(updateSet).toHaveBeenCalledWith({
        status: "final",
        homeScore: 125,
        awayScore: 124,
        overtimePeriods: 2,
      });
    });

    it("reads both nights when both carry unfinished games", async () => {
      selectWhere.mockResolvedValue([
        storedRow({ id: 1, date: YESTERDAY }),
        storedRow({ id: 2, date: TODAY, homeAbbr: "BOS", awayAbbr: "NYK" }),
      ]);
      espnRespondsByDate({
        "20261019": [event()],
        "20261020": [event({ homeAbbr: "BOS", awayAbbr: "NYK" })],
      });

      const res = await GET(req("Bearer test-secret"));
      const body = await res.json();

      expect(fetchedDates().sort()).toEqual(["20261019", "20261020"]);
      expect(body.data.gamesUpdated).toBe(2);
      expect(body.meta.espnGamesAvailable).toBe(2);
    });

    it("does not pool the two nights, so a rematch takes its own night's score", async () => {
      // The same pairing on consecutive nights is the one case where merging both dates into
      // a single (away, home) pool would silently cross-match.
      selectWhere.mockResolvedValue([
        storedRow({ id: 1, date: YESTERDAY }),
        storedRow({ id: 2, date: TODAY }),
      ]);
      espnRespondsByDate({
        "20261019": [event({ homeScore: "101", awayScore: "99", periods: 4 })],
        "20261020": [event({ homeScore: "125", awayScore: "124", periods: 6 })],
      });

      await GET(req("Bearer test-secret"));

      expect(updateSet).toHaveBeenCalledWith({
        status: "final",
        homeScore: 101,
        awayScore: 99,
        overtimePeriods: 0,
      });
      expect(updateSet).toHaveBeenCalledWith({
        status: "final",
        homeScore: 125,
        awayScore: 124,
        overtimePeriods: 2,
      });
    });

    it("costs one fetch when only one of the two dates has anything to check", async () => {
      selectWhere.mockResolvedValue([storedRow({ date: TODAY })]);
      espnRespondsByDate({ "20261020": [event()] });

      await GET(req("Bearer test-secret"));

      expect(fetchedDates()).toEqual(["20261020"]);
    });
  });
});

/**
 * The schedule, pinned. Vercel Hobby rejects the deploy if any entry would run more than once
 * a day, and the hours are what make a final appear the same night.
 */
describe("vercel.json cron schedule", () => {
  const crons = (
    JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    }
  ).crons;

  it("runs every entry once a day, on this route", () => {
    for (const cron of crons) {
      expect(cron.path).toBe("/api/cron/update");
      expect(cron.schedule).toMatch(/^0 \d{1,2} \* \* \*$/);
    }
  });

  it("covers every hour from 21:00 to 08:00 UTC exactly once", () => {
    const hours = crons.map((cron) => Number(cron.schedule.split(" ")[1]));
    expect([...hours].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 21, 22, 23]);
  });
});
