import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());

describe("historical correction cutover", () => {
  it("leaves normal traffic unchanged unless the exact maintenance mode is set", () => {
    for (const value of [undefined, "", "false", "1"]) {
      vi.stubEnv("FULLCOURT_MAINTENANCE", value);
      expect(proxy(new NextRequest("https://fullcourt.fyi/api/analysis")).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("blocks pages, data and scheduled writers without cacheable responses", async () => {
    vi.stubEnv("FULLCOURT_MAINTENANCE", "historical-recalculation");
    for (const [hostname, pathname, method] of [
      ["fullcourt.fyi", "/", "GET"],
      ["www.fullcourt.fyi", "/home-court", "GET"],
      ["fullcourt.fyi", "/api/analysis?season=2025-26", "GET"],
      ["fullcourt.fyi", "/api/cron/daily-update", "POST"],
      ["fullcourt.fyi", "/data/player-rest.json", "GET"],
    ]) {
      const result = proxy(new NextRequest(`https://${hostname}${pathname}`, { method }));
      expect(result.status).toBe(503);
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(result.headers.get("vercel-cdn-cache-control")).toBe("no-store");
      expect(result.headers.get("retry-after")).toBe("120");
      expect(await result.text()).not.toContain("DATABASE_URL");
    }
  });

  it("retains the database liveness probe and versioned static assets", () => {
    vi.stubEnv("FULLCOURT_MAINTENANCE", "historical-recalculation");
    for (const pathname of ["/api/health", "/_next/static/chunks/app.js", "/favicon.ico"]) {
      expect(proxy(new NextRequest(`https://fullcourt.fyi${pathname}`)).headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("proxy matcher", () => {
  // Without a matcher the proxy ran on every static chunk and image. The matcher skips only
  // what proxy() already passes through, so maintenance blocks the same set.
  const matches = (pathname: string) =>
    config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));

  it("skips the paths proxy() always lets through", () => {
    for (const pathname of ["/api/health", "/_next/static/chunks/app.js", "/favicon.ico"]) {
      expect(matches(pathname)).toBe(false);
    }
  });

  it("still runs on pages, APIs, data files and images", () => {
    for (const pathname of ["/", "/games", "/api/analysis", "/api/healthz", "/api/cron/update", "/data/player-rest.json", "/_next/image", "/icon.png"]) {
      expect(matches(pathname)).toBe(true);
    }
  });
});
