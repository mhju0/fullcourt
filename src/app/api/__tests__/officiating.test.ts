import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "../officiating/[season]/route";
import { CACHE } from "@/lib/api-route";
import data from "@/data/officiating.json";

const req = () => new NextRequest("http://localhost/api/officiating/x");

describe("GET /api/officiating/[season]", () => {
  it("returns the published games for one season", async () => {
    const season = data.seasons[data.seasons.length - 1];
    const res = await GET(req(), { params: Promise.resolve({ season: season.season }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE.historical);
    expect((await res.json()).data).toEqual(season.games);
  });

  it("returns 400 for a season with no published reports", async () => {
    for (const season of ["2013-14", "2099-00", "banana"]) {
      const res = await GET(req(), { params: Promise.resolve({ season }) });
      expect(res.status).toBe(400);
    }
  });
});
