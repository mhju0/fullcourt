import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined) });
  return { sql, write: vi.fn() };
});
vi.mock("postgres", () => ({ default: () => mocks.sql }));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("node:fs", async (original) => ({
  ...await original<typeof import("node:fs")>(),
  existsSync: () => false, mkdirSync: vi.fn(), writeFileSync: mocks.write,
}));

const oldArguments = process.argv;
let oldExit: typeof process.exitCode;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  oldExit = process.exitCode;
  process.exitCode = undefined;
  process.argv = ["node", "context", "2025-03-15", "2025-03-15", "--refresh"];
  vi.stubEnv("DATABASE_URL", "test-only");
  vi.stubEnv("DAILY_STAGE_SUMMARY_DIR", "/test-output");
  mocks.sql.mockImplementation((strings) => {
    if (String(strings?.[0]).includes("select g.id")) return Promise.resolve([
      { id: 1, date: "2025-03-15", season: "2024-25", home: "BKN", away: "BOS" },
      { id: 2, date: "2025-03-15", season: "2024-25", home: "LAL", away: "NYK" },
    ]);
    if (String(strings?.[0]).includes("update games g")) return Promise.resolve({ count: 1 });
    return "fragment";
  });
});
afterEach(() => {
  process.argv = oldArguments;
  process.exitCode = oldExit;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function executeContext() {
  await import("../../scripts/fetch_game_context");
  await vi.waitFor(() => expect(mocks.sql.end).toHaveBeenCalled());
}

describe("context stage reporting", () => {
  it("writes successful matches, then reports optional unmatched coverage", async () => {
    const body = { events: [{ competitions: [{ date: "2025-03-15T22:00Z", neutralSite: false, competitors: [
      { homeAway: "home", team: { abbreviation: "BKN" }, linescores: [1, 2, 3, 4] },
      { homeAway: "away", team: { abbreviation: "BOS" }, linescores: [1, 2, 3, 4] },
    ] }] }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(body) }));
    await executeContext();
    expect(mocks.sql.mock.calls.filter(([strings]) => String(strings?.[0]).includes("update games g"))).toHaveLength(1);
    expect(process.exitCode).toBe(2);
    const output = mocks.write.mock.calls.find(([file]) => String(file).endsWith("/context.json"));
    expect(JSON.parse(String(output?.[1]))).toMatchObject({ rows_written: 1, matched: 1, unmatched: 1, date_errors: 0 });
  });

  it("database failure reports critical status and closes the connection", async () => {
    mocks.sql.mockImplementation((strings) => {
      if (String(strings?.[0]).includes("select g.id")) return Promise.reject(new Error("postgres://secret"));
      return "fragment";
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await executeContext();
    expect(process.exitCode).toBe(1);
    expect(errors.mock.calls.flat().join(" ")).not.toContain("postgres://secret");
    errors.mockRestore();
  });

  it("invalid provider shape degrades without writing rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => '{"error":"https://secret"}' }));
    await executeContext();
    expect(mocks.sql.mock.calls.filter(([strings]) => String(strings?.[0]).includes("update games g"))).toHaveLength(0);
    expect(process.exitCode).toBe(2);
    const output = mocks.write.mock.calls.find(([file]) => String(file).endsWith("/context.json"));
    expect(JSON.parse(String(output?.[1]))).toMatchObject({ rows_written: 0, date_errors: 1 });
    expect(String(output?.[1])).not.toContain("https://secret");
  });
});
