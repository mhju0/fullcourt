import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB client so the liveness query can be forced to succeed or throw
// without a real connection. Only `db.execute` is exercised by the route.
const execute = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { execute: (...args: unknown[]) => execute(...args) },
}));

import { GET } from "../health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 { status: ok, db: up } when the liveness query succeeds", async () => {
    execute.mockResolvedValueOnce([{ "?column?": 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      db: string;
      timestamp: string;
    };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 503 { status: error, db: down } and logs when the query throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      status: string;
      db: string;
      timestamp: string;
    };
    expect(body.status).toBe("error");
    expect(body.db).toBe("down");
    // The raw DB error must never reach the response body.
    expect(JSON.stringify(body)).not.toContain("connection refused");
    expect(consoleError).toHaveBeenCalled();
  });
});
