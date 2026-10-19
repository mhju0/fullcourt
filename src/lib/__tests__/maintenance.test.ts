import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

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
