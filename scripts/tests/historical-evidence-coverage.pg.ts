import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { integrityTestUrl } from "./integrity-test-url";
import { summarizeHistoricalEvidenceCoverage } from "../../src/lib/rest-advantage-evidence";

async function main() {
  const url = integrityTestUrl();
  const schema = `fc_evidence_coverage_${process.pid}`;
  const admin = postgres(url, { max: 1, prepare: false, connection: { search_path: schema } });
  const previousUrl = process.env.DATABASE_URL;
  const previousMax = process.env.DB_POOL_MAX;
  let passed = 0;
  let created = false;
  try {
    await admin.unsafe(`create schema ${schema}`);
    created = true;
    await admin.unsafe(readFileSync(new URL("./ci-integrity-bootstrap.sql", import.meta.url), "utf8"));
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = scoped.toString();
    process.env.DB_POOL_MAX = "1";
    const { getCompletedGamesWithFatigue, getCompletedGamesWithFatigueCoverage } = await import("../../src/lib/db/queries");
    async function check(label: string, expected: { games: number; latestEvidenceDate: string | null }) {
      const rows = await getCompletedGamesWithFatigue();
      const actual = await getCompletedGamesWithFatigueCoverage();
      assert.deepEqual(actual, summarizeHistoricalEvidenceCoverage(rows), `${label}: row-loader parity`);
      assert.deepEqual(actual, expected, label);
      console.log(`PASS ${++passed} ${label}`);
      return rows;
    }
    async function game(id: number, date: string, options: {
      season?: string; type?: string; status?: string; homeScore?: number | null;
      awayScore?: number | null; neutral?: boolean;
    } = {}) {
      const value = { season: "2024-25", type: "regular", status: "final", homeScore: 110, awayScore: 100, neutral: false, ...options };
      await admin`insert into games(id,external_id,date,season,home_team_id,away_team_id,home_score,away_score,status,game_type,neutral_site)
        values(${id},${`coverage-${id}`},${date},${value.season},1,2,${value.homeScore},${value.awayScore},${value.status},${value.type},${value.neutral})`;
    }
    async function fatigue(gameId: number, teamId: number, score = 0, computedAt = "2026-10-30 00:00:00") {
      await admin`insert into fatigue_scores(game_id,team_id,score,decay_load_score,travel_load_score,b2b_multiplier,
        altitude_multiplier,density_multiplier,freshness_bonus,games_in_last_7_days,travel_distance_miles,is_back_to_back,computed_at)
        values(${gameId},${teamId},${score},0,0,1,1,1,0,0,0,false,${computedAt})`;
    }
    await check("empty population has zero games and no date", { games: 0, latestEvidenceDate: null });
    await game(1, "2024-12-01");
    await fatigue(1, 1, 10, "2026-10-29 00:00:00");
    await fatigue(1, 1, 5);
    await fatigue(1, 1, 3);
    await fatigue(1, 1, 99, "2026-10-28 00:00:00");
    await fatigue(1, 2, 7);
    await fatigue(1, 2, 6);
    const revisions = await check("multiple revisions and equal timestamp ties count one game", { games: 1, latestEvidenceDate: "2024-12-01" });
    assert.equal(revisions[0].homeFatigueScore, "3");
    assert.equal(revisions[0].awayFatigueScore, "6");
    await game(2, "2024-12-05", { neutral: true, homeScore: 100, awayScore: 100 });
    await fatigue(2, 1); await fatigue(2, 2);
    await check("neutral sites, tied results and zero fatigue gaps remain eligible", { games: 2, latestEvidenceDate: "2024-12-05" });
    await game(3, "2024-12-06");
    await fatigue(3, 1, 2.99); await fatigue(3, 2, 3);
    await check("coverage has no rest-advantage threshold", { games: 3, latestEvidenceDate: "2024-12-06" });
    await game(4, "2025-04-01");
    await fatigue(4, 1); await fatigue(4, 3);
    await check("a missing away side cannot be filled by another team's fatigue", { games: 3, latestEvidenceDate: "2024-12-06" });
    await fatigue(4, 2);
    await check("the correct away side adds the game and advances the date", { games: 4, latestEvidenceDate: "2025-04-01" });
    await admin`delete from fatigue_scores where game_id=4 and team_id=2`;
    await check("losing a fatigue side removes coverage without a stale cached answer", { games: 3, latestEvidenceDate: "2024-12-06" });
    await fatigue(4, 2);
    await check("recovering the side restores coverage", { games: 4, latestEvidenceDate: "2025-04-01" });
    const excluded = [
      { type: "playoff" }, { type: "cup_final" }, { type: "preseason" },
      { status: "scheduled" }, { status: "live" }, { status: "postponed" },
      { homeScore: null }, { awayScore: null },
    ];
    for (const [index, options] of excluded.entries()) {
      const id = index + 10;
      await game(id, `2026-04-${String(index + 1).padStart(2, "0")}`, { season: "2025-26", ...options });
      await fatigue(id, 1); await fatigue(id, 2);
    }
    await check("nonpublished competitions, nonfinals and either missing score cannot affect count or latest date", { games: 4, latestEvidenceDate: "2025-04-01" });
    for (const [index, date] of ["2020-07-29", "2020-07-30", "2020-10-11", "2020-10-12"].entries()) {
      const id = index + 20;
      await game(id, date, { season: "2019-20", neutral: true });
      await fatigue(id, 1); await fatigue(id, 2);
    }
    await check("only the inclusive abnormal stretch is excluded, with other neutral dates retained", { games: 6, latestEvidenceDate: "2025-04-01" });
    await admin`delete from fatigue_scores`;
    await check("no eligible fatigue pairs returns zero even when completed games remain", { games: 0, latestEvidenceDate: null });
    console.log(`${passed} historical evidence coverage contracts passed`);
  } finally {
    await (globalThis as typeof globalThis & { __nbaRestAdvantageDb?: { sqlClient?: { end(): Promise<void> } } }).__nbaRestAdvantageDb?.sqlClient?.end();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousMax === undefined) delete process.env.DB_POOL_MAX; else process.env.DB_POOL_MAX = previousMax;
    if (created) await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
