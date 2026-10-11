import { NextRequest } from "next/server";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicApiError } from "@/lib/api-errors";
import { CACHE, jsonRoute, seasonCachePolicy } from "@/lib/api-route";

/**
 * The cache policy is the reason this file exists. Fresh and stale edge lifetimes compose,
 * so a response that is cached when it should not be stays
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

  it("bounds both edge freshness and stale revalidation", () => {
    expect(CACHE.inSeason).toBe("public, s-maxage=60, stale-while-revalidate=60");
    expect(CACHE.historical).toBe("public, s-maxage=3600, stale-while-revalidate=300");
  });

  it("selects a shorter policy for current and upcoming seasons per request", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
      expect(seasonCachePolicy("2025-26")).toBe(CACHE.historical);
      expect(seasonCachePolicy("2026-27")).toBe(CACHE.inSeason);
      expect(seasonCachePolicy("2027-28")).toBe(CACHE.inSeason);
      const route = jsonRoute("test/per-season", z.object({ season: z.string() }),
        async () => 1, ({ season }) => seasonCachePolicy(season));
      expect((await route(req("https://example.test/api?season=2026-27")))
        .headers.get("cache-control")).toBe(CACHE.inSeason);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the in-season policy fresher than the historical one", () => {
    const freshness = (policy: string) => Number(/s-maxage=(\d+)/.exec(policy)![1]);

    expect(freshness(CACHE.inSeason)).toBeLessThan(freshness(CACHE.historical));
  });
});
