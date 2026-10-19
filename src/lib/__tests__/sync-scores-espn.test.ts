import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  rows: [] as object[], writes: [] as object[], end: vi.fn(), databaseError: false, writeError: false, refused: false,
}));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: () => true, mkdirSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({
  dbPoolConfig: () => ({}),
  createDatabase: () => ({}),
  createDbPool: () => ({
    query: async () => {
      if (mock.databaseError) throw new Error("database unavailable");
      return { rows: mock.rows };
    },
    end: mock.end,
  }),
}));
vi.mock("@/lib/game-status-write", () => ({ writeGameStatus: async (_db: unknown, update: object) => {
  if (mock.writeError) throw new Error("write failed");
  mock.writes.push(update);
  return {written: !mock.refused, invalidated: 0};
} }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const row = (id: number, date: string) => ({
  id, date, homeAbbr: "BOS", awayAbbr: "NYK", status: "scheduled",
  homeScore: null, awayScore: null, overtimePeriods: 0,
});
const final = { events: [{ id: "1", date: "2026-10-20T23:00:00Z", competitions: [{
  status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
  competitors: [
    { homeAway: "home", team: { abbreviation: "BOS" }, score: "100" },
    { homeAway: "away", team: { abbreviation: "NYK" }, score: "90" },
  ],
  period: 4,
}] }] };

beforeEach(() => {
  vi.resetModules();
  mock.rows = [row(1, "2026-10-20"), row(2, "2026-10-21")];
  mock.writes = [];
  mock.databaseError = false;
  mock.writeError = false;
  mock.refused = false;
  mock.end.mockReset();
  process.argv = ["node", "scripts/sync_scores_espn.ts", "2026-10-20", "2026-10-21"];
  process.exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function run() {
  await import("../../../scripts/sync_scores_espn");
  await vi.waitFor(() => expect(mock.end).toHaveBeenCalledOnce());
  await Promise.resolve();
}

describe("score sync process status", () => {
  it("retains good date writes and signals a failed date as degraded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(final)))
      .mockRejectedValueOnce(new Error("feed unavailable")));
    await run();
    expect(mock.writes).toHaveLength(1);
    expect(process.exitCode).toBe(2);
  });

  it("reports zero committed rows and the refused downgrade returned by the write guard", async () => {
    mock.rows=[{...row(1,"2026-10-20"),status:"live",homeScore:80,awayScore:79}];
    mock.refused=true;
    const pre={events:[{...final.events[0],competitions:[{
      ...final.events[0].competitions[0],status:{type:{name:"STATUS_SCHEDULED",state:"pre",completed:false}},
    }]}]};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(pre))));
    await run();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("done — 0 row(s) updated"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("write-time final downgrades refused: 1"));
  });

  it("signals failed dates during dry runs too", async () => {
    process.argv.push("--dry-run");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("feed unavailable")));
    await run();
    expect(mock.writes).toHaveLength(0);
    expect(process.exitCode).toBe(2);
  });

  it("finishes successfully when every date fetch and write succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(final))));
    await run();
    expect(mock.writes).toHaveLength(1);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("accepts empty and unmatched event lists without a fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ events: [] }))));
    await run();
    expect(mock.writes).toHaveLength(0);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("treats database failure as fatal and closes the connection", async () => {
    mock.databaseError = true;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await run();
    expect(fetch).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("does not turn a write failure into a degraded feed status", async () => {
    mock.writeError = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(final)))
      .mockRejectedValueOnce(new Error("feed unavailable")));
    await run();
    expect(process.exitCode).toBe(1);
  });

  it("bounds every scoreboard request with a 25-second abort deadline", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ events: [] }));
    });
    vi.stubGlobal("fetch", fetch);
    await run();
    expect(timeout.mock.calls).toEqual([[25_000], [25_000]]);
  });

  it.each(["not json", JSON.stringify({ error: "upstream problem" })])(
    "signals an invalid scoreboard body as degraded: %s", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(body)));
      await run();
      expect(process.exitCode).toBe(2);
      expect(mock.writes).toHaveLength(0);
    }
  );
});
