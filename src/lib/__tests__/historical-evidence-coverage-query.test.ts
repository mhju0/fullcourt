import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompletedGamesWithFatigueCoverage } from "@/lib/db/queries";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool();
  pool.query = query;
  return { db: drizzle(pool) };
});

beforeEach(() => { query.mockReset(); });

describe("historical fatigue coverage SQL", () => {
  it("aggregates the completed loader's exact population and latest side revisions", async () => {
    query.mockResolvedValue({ rows: [["47143", "2026-04-12"]] });
    expect(await getCompletedGamesWithFatigueCoverage()).toEqual({ games: 47_143, latestEvidenceDate: "2026-04-12" });
    expect(query).toHaveBeenCalledOnce();
    const text: string = query.mock.calls[0][0].text;
    expect(text.split(' from "games"')[0]).toBe('select count(*), max("games"."date")');
    expect(text.match(/select distinct on/g)).toHaveLength(2);
    expect(text.match(/"fatigue_scores"\."computed_at" desc, "fatigue_scores"\."id" desc/g)).toHaveLength(2);
    expect(text).toContain('"coverage_home_latest"."game_id" = "games"."id"');
    expect(text).toContain('"coverage_home_latest"."team_id" = "games"."home_team_id"');
    expect(text).toContain('"coverage_away_latest"."game_id" = "games"."id"');
    expect(text).toContain('"coverage_away_latest"."team_id" = "games"."away_team_id"');
    expect(text).toContain('"games"."home_score" is not null');
    expect(text).toContain('"games"."away_score" is not null');
    expect(text).toContain('"games"."game_type" = $1');
    expect(text).toContain('"games"."status" = $5');
    expect(query.mock.calls[0][1]).toEqual(["regular", "2019-20", "2020-07-30", "2020-10-11", "final"]);
    expect(text).not.toContain("neutral_site");
    expect(text).not.toContain("predictions");
    expect(text).not.toContain("md5");
  });

  it("returns zero and no date for an empty population", async () => {
    query.mockResolvedValue({ rows: [["0", null]] });
    expect(await getCompletedGamesWithFatigueCoverage()).toEqual({ games: 0, latestEvidenceDate: null });
  });

  it("propagates a failed read so the page can show unavailable coverage", async () => {
    const error = new Error("coverage timeout");
    query.mockRejectedValue(error);
    await expect(getCompletedGamesWithFatigueCoverage()).rejects.toMatchObject({ cause: error });
  });
});
