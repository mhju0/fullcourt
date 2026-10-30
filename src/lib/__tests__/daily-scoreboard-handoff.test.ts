import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import scheduledTipFixture from "./fixtures/espn-scheduled-tip-change.json";

const mock = vi.hoisted(() => ({
  files: new Map<string, string>(), syncEnd: vi.fn(), contextEnd: vi.fn(),
  contextRows: [] as object[], contextWrites: [] as unknown[][],
  syncRows: [] as object[],
  receiptWriteError: false,
}));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: (path: string) => mock.files.has(path), mkdirSync: vi.fn(),
  writeFileSync: (path: string, body: string) => {
    if (mock.receiptWriteError && path.includes("/scoreboards/")) throw new Error("receipt unavailable");
    mock.files.set(path, body);
  },
  readFileSync: (path: string) => {
    if (!mock.files.has(path)) throw new Error("missing file");
    return mock.files.get(path);
  },
}));
vi.mock("@/lib/db/pool", () => ({
  dbPoolConfig: () => ({}), createDatabase: () => ({}),
  createDbPool: () => ({ query: async () => ({ rows: mock.syncRows }), end: mock.syncEnd }),
}));
vi.mock("@/lib/game-status-write", () => ({ writeGameStatus: async () => ({ written: true, invalidated: 0 }) }));
vi.mock("postgres", () => ({ default: () => {
  const sql = (parts: TemplateStringsArray | unknown[], ...values: unknown[]): unknown => {
    if (!("raw" in parts)) return { rows: parts };
    const statement = parts.join(" ");
    if (statement.includes("select g.id")) return Promise.resolve(mock.contextRows);
    if (statement.includes("update games g")) {
      const source = values.find((value): value is { rows: unknown[][] } =>
        typeof value === "object" && value !== null && "rows" in value);
      mock.contextWrites.push(...source!.rows);
      return Promise.resolve({ count: source!.rows.length });
    }
    return { fragment: statement };
  };
  return Object.assign(sql, { end: mock.contextEnd });
} }));

const final = { events: [{ ...scheduledTipFixture.events[0], competitions: [{
  ...scheduledTipFixture.events[0].competitions[0],
  status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
  competitors: scheduledTipFixture.events[0].competitions[0].competitors.map(competitor => ({
    ...competitor, score: competitor.homeAway === "home" ? "100" : "90",
    linescores: Array.from({ length: 4 }, () => ({ value: 25 })),
  })),
}] }] };
const target = { id: 1, date: "2026-10-29", season: "2026-27", home: "ATL", away: "CLE" };
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  mock.files.clear(); mock.syncEnd.mockReset(); mock.contextEnd.mockReset();
  mock.contextRows = [target]; mock.contextWrites = [];
  mock.syncRows = [{
    id: 1, date: target.date, homeAbbr: "ATL", awayAbbr: "CLE", status: "scheduled",
    homeScore: null, awayScore: null, overtimePeriods: 0,
  }];
  mock.receiptWriteError = false;
  vi.stubEnv("DAILY_STAGE_SUMMARY_DIR", "/current-stage");
  vi.stubEnv("DAILY_SCOREBOARD_RUN_ID", "current-invocation");
  process.exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv; process.exitCode = originalExitCode;
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

async function scores(to = target.date) {
  process.argv = ["node", "sync_scores_espn.ts", target.date, to];
  await import("../../../scripts/sync_scores_espn");
  await vi.waitFor(() => expect(mock.syncEnd).toHaveBeenCalledOnce());
}
async function context(refresh = true, to = target.date) {
  process.argv = ["node", "fetch_game_context.ts", target.date, to, ...(refresh ? ["--refresh"] : [])];
  await import("../../../scripts/fetch_game_context");
  await vi.waitFor(() => expect(mock.contextEnd).toHaveBeenCalledOnce());
}

it("shares one validated final scoreboard between the real score and context scripts", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  await context();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mock.contextWrites).toEqual([[1, 0, final.events[0].competitions[0].date, false, null]]);
  expect(process.exitCode ?? 0).toBe(0);
});

it("requests the selected Eastern date with an explicit event limit in both scripts", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  vi.stubEnv("DAILY_SCOREBOARD_RUN_ID", "fresh-context-invocation");
  await context();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261029&limit=1000",
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261029&limit=1000",
  ]);
  expect(mock.contextWrites).toEqual([[1, 0, final.events[0].competitions[0].date, false, null]]);
});

it.each(["", "not json", JSON.stringify({ error: "invalid scoreboard" })])(
  "keeps an empty or invalid response degraded without caching it: %j", async body => {
    const fetch = vi.fn().mockImplementation(async () => new Response(body));
    vi.stubGlobal("fetch", fetch);
    await scores();
    expect(process.exitCode).toBe(2);
    await context();
    expect(process.exitCode).toBe(2);
    expect(mock.contextWrites).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mock.files.has("ml/data/officials/sb-20261029.json")).toBe(false);
    expect([...mock.files.keys()].some(path => path.includes("/scoreboards/"))).toBe(false);
  }
);

it("retries a failed score fetch without falling back to an older persistent scoreboard", async () => {
  mock.files.set("ml/data/officials/sb-20261029.json", JSON.stringify({ events: [] }));
  const fetch = vi.fn().mockRejectedValueOnce(new Error("upstream unavailable"))
    .mockResolvedValueOnce(new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  expect(process.exitCode).toBe(2);
  await context(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mock.contextWrites).toHaveLength(1);
  expect(process.exitCode).toBe(0);
});

it("reuses the successful date and retries only the failed date after partial score collection", async () => {
  const nextDate = "2026-10-30";
  mock.syncRows.push({ id: 2, date: nextDate, homeAbbr: "ATL", awayAbbr: "CLE", status: "scheduled",
    homeScore: null, awayScore: null, overtimePeriods: 0 });
  mock.contextRows.push({ ...target, id: 2, date: nextDate });
  const attempts = new Map<string, number>();
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    const date = new URL(url).searchParams.get("dates")!;
    attempts.set(date, (attempts.get(date) ?? 0) + 1);
    if (date === "20261030" && attempts.get(date) === 1) throw new Error("one date unavailable");
    const body = date === "20261029" ? final : { events: [{ ...final.events[0], competitions: [{
      ...final.events[0].competitions[0], date: "2026-10-31T00:00:00Z",
    }] }] };
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal("fetch", fetch);
  await scores(nextDate);
  expect(process.exitCode).toBe(2);
  await context(true, nextDate);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(attempts).toEqual(new Map([["20261029", 1], ["20261030", 2]]));
  expect(mock.contextWrites).toHaveLength(2);
});

it.each(["missing", "hash", "date", "schema", "json", "events"])(
  "fetches again when the current receipt has invalid %s evidence", async failure => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
    vi.stubGlobal("fetch", fetch);
    await scores();
    const path = "/current-stage/scoreboards/2026-10-29.json";
    const receipt = JSON.parse(mock.files.get(path)!);
    if (failure === "missing") mock.files.delete(path);
    else if (failure === "json") mock.files.set(path, "not json");
    else {
      if (failure === "hash") receipt.sha256 = "0".repeat(64);
      if (failure === "date") receipt.date = "2026-10-28";
      if (failure === "schema") receipt.schemaVersion = 2;
      if (failure === "events") {
        receipt.body = JSON.stringify({ events: {} });
        receipt.sha256 = createHash("sha256").update(receipt.body).digest("hex");
      }
      mock.files.set(path, JSON.stringify(receipt));
    }
    await context();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mock.contextWrites).toHaveLength(1);
  }
);

it("ignores a valid prior invocation receipt even when its directory is reused", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  vi.stubEnv("DAILY_SCOREBOARD_RUN_ID", "next-invocation");
  await context();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps standalone --refresh independent of any retained receipt", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  vi.stubEnv("DAILY_SCOREBOARD_RUN_ID", "");
  await context();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("preserves standalone historical cache reuse when refresh was not requested", async () => {
  vi.stubEnv("DAILY_SCOREBOARD_RUN_ID", "");
  mock.files.set("ml/data/officials/sb-20261029.json", JSON.stringify(final));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await context(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.contextWrites).toHaveLength(1);
});

it("keeps scores usable if retaining the optional receipt fails", async () => {
  mock.receiptWriteError = true;
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(final)));
  vi.stubGlobal("fetch", fetch);
  await scores();
  expect(process.exitCode ?? 0).toBe(0);
  await context();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["scheduled", "live", "ambiguous", "other-date"])(
  "refetches when the DB final target is %s in the score-stage response", async reason => {
    const competition = final.events[0].competitions[0];
    const event = reason === "scheduled" || reason === "live" ? {
      ...final.events[0], competitions: [{ ...competition, status: { type: {
        name: reason === "scheduled" ? "STATUS_SCHEDULED" : "STATUS_IN_PROGRESS",
        state: reason === "scheduled" ? "pre" : "in", completed: false,
      } } }],
    } : reason === "other-date" ? {
      ...final.events[0], competitions: [{ ...competition, date: "2026-10-31T00:00:00Z" }],
    } : final.events[0];
    const initial = { events: reason === "ambiguous" ? [event, { ...event, id: "duplicate" }] : [event] };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(initial)))
      .mockResolvedValueOnce(new Response(JSON.stringify(final)));
    vi.stubGlobal("fetch", fetch);
    await scores();
    await context();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mock.contextWrites).toHaveLength(1);
  }
);

it.each(["other-date", "missing-date", "invalid-date"])(
  "refetches before consuming a mixed same-pair receipt with %s", async reason => {
    const competition = final.events[0].competitions[0];
    const date = reason === "other-date" ? "2026-10-31T00:00:00Z"
      : reason === "invalid-date" ? "invalid" : undefined;
    const poisoned = { ...final.events[0], id: "same-pair-other-event", date, competitions: [{
      ...competition, date, neutralSite: true, venue: { address: { city: "Wrong venue" } },
      competitors: competition.competitors.map(team => ({
        ...team, linescores: Array.from({ length: 6 }, () => ({ value: 20 })),
      })),
    }] };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ events: [...final.events, poisoned] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(final)));
    vi.stubGlobal("fetch", fetch);
    await scores();
    await context();
    expect(mock.contextWrites).toEqual([[1, 0, competition.date, false, null]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  }
);

it("refetches once for the date when another game becomes final between stages", async () => {
  const later = { ...final.events[0], id: "later-final", competitions: [{
    ...final.events[0].competitions[0],
    competitors: final.events[0].competitions[0].competitors.map(competitor => ({
      ...competitor, team: { abbreviation: competitor.homeAway === "home" ? "BOS" : "NYK" },
    })),
  }] };
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(final)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ events: [...final.events, later] })));
  vi.stubGlobal("fetch", fetch);
  await scores();
  mock.contextRows.push({ ...target, id: 2, home: "BOS", away: "NYK" });
  await context();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mock.contextWrites).toHaveLength(2);
});
