import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { getPlayoffSeriesWithPredictions } from "@/lib/db/queries";
import { PLAYOFF_MODEL_VERSION } from "@/lib/playoff-model-version";

const databaseUrl = process.env.DATABASE_URL ?? "";
const target = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hostname !== "127.0.0.1" || target.port !== "55434" || target.pathname !== "/fullcourt_recalculation" || target.search) {
  throw new Error("Explicit local recalculation database required");
}
type Prediction = { series_id: number; prediction_method: string; predicted_home_court_win_prob: number; predicted_winner_team_id: number; model_version: string };
const inputPath = "docs/audit/history-recalculation/analytics/playoff-prediction-revision.json";
const payload = JSON.parse(readFileSync(inputPath, "utf8")) as { modelVersion: string; rows: Prediction[] };
assert.equal(payload.modelVersion, PLAYOFF_MODEL_VERSION);
const expected = new Map(payload.rows.map((row) => [`${row.series_id}:${row.prediction_method}`, row]));
const client = postgres(databaseUrl, { max: 1, prepare: false });
type Runtime = { dbInstance?: ReturnType<typeof drizzle<typeof schema>>; sqlClient?: postgres.Sql };
const runtime = globalThis as typeof globalThis & { __nbaRestAdvantageDb?: Runtime };
const previous = runtime.__nbaRestAdvantageDb;

async function main() {
  const connection = await client.reserve();
  try {
    await connection`begin read only`;
    runtime.__nbaRestAdvantageDb = { sqlClient: client, dbInstance: drizzle(Object.assign(connection, { options: client.options }), { schema }) };
    const seasons = await connection`select distinct season from playoff_series order by season`;
    const counts = { series: 0, full_insample: 0, walk_forward_oos: 0, missingEarlyOos: 0 };
    for (const { season } of seasons) {
      for (const row of await getPlayoffSeriesWithPredictions(String(season))) {
        counts.series++;
        for (const [method, prediction] of [["full_insample", row.predictions.fullInsample], ["walk_forward_oos", row.predictions.walkForwardOos]] as const) {
          const source = expected.get(`${row.seriesId}:${method}`);
          if (!source) {
            assert.equal(prediction, null, `${row.seriesId}:${method} must remain missing`);
            assert.equal(method, "walk_forward_oos");
            counts.missingEarlyOos++;
            continue;
          }
          assert(prediction, `${row.seriesId}:${method} missing selected revision`);
          assert.equal(prediction.modelVersion, PLAYOFF_MODEL_VERSION);
          assert.equal(prediction.predictedWinnerTeam.id, source.predicted_winner_team_id);
          assert(Math.abs(prediction.predictedHomeCourtWinProb - source.predicted_home_court_win_prob) < 1e-12);
          counts[method]++;
          expected.delete(`${row.seriesId}:${method}`);
        }
      }
    }
    assert.equal(expected.size, 0, "Every generated prediction must be exposed by the actual loader");
    await connection`rollback`;
    const output = "docs/audit/history-recalculation/analytics/playoff-reader-verification.json";
    writeFileSync(output, JSON.stringify({ modelVersion: PLAYOFF_MODEL_VERSION, inputSha256: createHash("sha256").update(readFileSync(inputPath)).digest("hex"), counts, writes: 0 }, null, 2) + "\n");
    console.log(JSON.stringify({ output, counts }));
  } finally {
    runtime.__nbaRestAdvantageDb = previous;
    await connection.release();
    await client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
