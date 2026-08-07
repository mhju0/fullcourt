import { NextRequest } from "next/server";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicApiError } from "@/lib/api-errors";
import { CACHE, jsonRoute } from "@/lib/api-route";

/**
 * The cache policy is the reason this file exists. `s-maxage` is measured in minutes and
 * `stale-while-revalidate` in hours, so a response that is cached when it should not be stays
 * wrong long after the condition that produced it is over. These pin which responses may carry
 * the header, not only that the header can be set.
 */

const req = (url = "https://example.test/api/thing") => new NextRequest(url);

const ok = jsonRoute("test/ok", z.object({}), async () => ({ value: 1 }), CACHE.historical);

const uncached = jsonRoute("test/uncached", z.object({}), async () => ({ value: 1 }));

const boom = jsonRoute(
  "test/boom",
  z.object({}),
  async () => {
    throw new Error("database is down");
  },
  CACHE.historical
);

const missing = jsonRoute(
  "test/missing",
  z.object({}),
  async () => {
    throw new PublicApiError("No such game", 404);
  },
  CACHE.historical
);

const strict = jsonRoute(
  "test/strict",
  z.object({ season: z.string().refine((s) => s === "2024-25", "Invalid season") }),
  async () => ({ value: 1 }),
  CACHE.historical
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jsonRoute cache policy", () => {
  it("sets the policy on a success", async () => {
    const res = await ok(req());

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE.historical);
  });

  it("sets no policy when the route did not ask for one", async () => {
    const res = await uncached(req());

    expect(res.status).toBe(200);
    // Next fills its own default downstream; what matters is that this wrapper adds nothing.
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("does NOT cache a 500, so an outage cannot outlive itself at the edge", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await boom(req());

    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("does NOT cache an authored error status", async () => {
    const res = await missing(req());

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("does NOT cache a validation failure", async () => {
    const res = await strict(req("https://example.test/api/thing?season=1901-02"));

    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBeNull();
  });
});

/**
 * `stale-while-revalidate` is what removes the function from the reader's critical path; without
 * it a cold start is a spinner rather than a background refresh. `s-maxage` alone would not have
 * fixed what this was added for, so both halves are pinned.
 */
describe("the cache policies themselves", () => {
  it.each(Object.entries(CACHE))("%s is edge-cacheable and revalidates stale", (_name, policy) => {
    expect(policy).toMatch(/^public,/);
    expect(policy).toMatch(/\bs-maxage=\d+/);
    expect(policy).toMatch(/\bstale-while-revalidate=\d+/);
  });

  it("lets the edge serve stale for longer than it serves fresh", () => {
    for (const policy of Object.values(CACHE)) {
      const fresh = Number(/s-maxage=(\d+)/.exec(policy)![1]);
      const stale = Number(/stale-while-revalidate=(\d+)/.exec(policy)![1]);

      expect(stale).toBeGreaterThan(fresh);
    }
  });

  it("keeps the in-season policy fresher than the historical one", () => {
    const freshness = (policy: string) => Number(/s-maxage=(\d+)/.exec(policy)![1]);

    expect(freshness(CACHE.inSeason)).toBeLessThan(freshness(CACHE.historical));
  });
});
