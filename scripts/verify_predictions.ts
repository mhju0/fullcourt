/** Read-only audit: historical rule differences are preserved diagnostics, never rebuild instructions. */
import { pathToFileURL } from "node:url";
import { classifyRestAdvantage, isCalledSide } from "@/lib/rest-advantage-evidence";
import { isNormallyPlayed } from "@/lib/season-regime";
import { formatEasternDateKey } from "@/lib/nba-season";

export type AuditGame = {
  id: number;
  date: string;
  season: string;
  status: string;
  gameType: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  tipOffUtc: string | null;
  neutralSite: boolean;
};
export type AuditPrediction = {
  id: number;
  gameId: number;
  predictedTeamId: number;
  actualWinnerId: number | null;
  gap: string | number | null;
};
export type AuditScore = { gameId: number; teamId: number; score: string | number | null };
export interface PredictionSnapshot {
  asOf: string;
  readOnly: string;
  games: AuditGame[];
  predictions: AuditPrediction[];
  scores: AuditScore[];
}

function finiteNumeric(value: string | number | null | undefined): value is string | number {
  return value != null && String(value).trim() !== "" && Number.isFinite(Number(value));
}

export function auditPredictions(snapshot: PredictionSnapshot) {
  const asOf = new Date(snapshot.asOf);
  if (!Number.isFinite(asOf.getTime())) throw new Error("Invalid audit asOf");
  const games = new Map(snapshot.games.map((game) => [game.id, game]));
  const byGame = new Map<number, AuditPrediction[]>();
  const scores = new Map(snapshot.scores.map((row) => [`${row.gameId}:${row.teamId}`, row.score]));
  const integrity: string[] = [];
  const ids = new Set<number>();
  const historical = {
    calledButMissing: [] as number[],
    storedButNoLongerCalled: [] as number[],
    gapDifferences: [] as number[],
    differentCalledTeam: [] as number[],
    awayTeamPicks: [] as number[],
    neutralPredictions: [] as number[],
    outsideCurrentFinalPopulation: [] as number[],
    missingScoreContext: [] as number[],
  };
  const future = {
    calledButMissing: [] as number[],
    storedButNoLongerCalled: [] as number[],
    gapDifferences: [] as number[],
    differentCalledTeam: [] as number[],
    missingScoreContext: [] as number[],
  };
  for (const prediction of snapshot.predictions) {
    if (ids.has(prediction.id)) integrity.push(`duplicate prediction id ${prediction.id}`);
    ids.add(prediction.id);
    const rows = byGame.get(prediction.gameId) ?? [];
    rows.push(prediction);
    byGame.set(prediction.gameId, rows);
    const game = games.get(prediction.gameId);
    if (!game) integrity.push(`orphan prediction ${prediction.id}: game ${prediction.gameId}`);
    else {
      const participants = [game.homeTeamId, game.awayTeamId];
      if (!participants.includes(prediction.predictedTeamId)) integrity.push(`prediction ${prediction.id}: predicted team is not in fixture`);
      if (prediction.actualWinnerId !== null && !participants.includes(prediction.actualWinnerId)) integrity.push(`prediction ${prediction.id}: actual team is not in fixture`);
    }
    if (!finiteNumeric(prediction.gap)) integrity.push(`prediction ${prediction.id}: invalid gap`);
  }
  for (const [gameId, rows] of byGame) {
    if (rows.length > 1) integrity.push(`duplicate predictions for game ${gameId}: ${rows.map((row) => row.id).join(",")}`);
  }

  let finalInScope = 0;
  let finalCalled = 0;
  let futureEligible = 0;
  let futureCalled = 0;
  const eligibleFuture = new Set<number>();
  const finalPopulation = new Set<number>();
  for (const game of snapshot.games) {
    const rows = byGame.get(game.id) ?? [];
    const regular = game.gameType === "regular" && isNormallyPlayed(game.season, game.date);
    const final = regular && game.status === "final" && game.homeScore !== null && game.awayScore !== null;
    const upcoming = regular && game.status === "scheduled" && game.tipOffUtc !== null &&
      new Date(game.tipOffUtc).getTime() > asOf.getTime() && rows.every((row) => row.actualWinnerId === null);
    if (!final && !upcoming) continue;
    if (final) { finalInScope++; finalPopulation.add(game.id); }
    else { futureEligible++; eligibleFuture.add(game.id); }
    const group = final ? historical : future;
    const home = scores.get(`${game.id}:${game.homeTeamId}`);
    const away = scores.get(`${game.id}:${game.awayTeamId}`);
    if (!finiteNumeric(home) || !finiteNumeric(away)) {
      group.missingScoreContext.push(game.id);
      continue;
    }
    const rest = classifyRestAdvantage(Number(home), Number(away));
    const called = isCalledSide(rest.advantageTeam, game.neutralSite);
    if (called) {
      if (final) finalCalled++; else futureCalled++;
      if (rows.length === 0) group.calledButMissing.push(game.id);
    } else if (rows.length > 0) group.storedButNoLongerCalled.push(game.id);
    for (const row of rows) {
      if (finiteNumeric(row.gap) && Math.abs(Number(row.gap) - rest.differential) > 0.000001) group.gapDifferences.push(row.id);
      if (called && row.predictedTeamId !== game.homeTeamId) group.differentCalledTeam.push(row.id);
    }
  }
  for (const prediction of snapshot.predictions) {
    const game = games.get(prediction.gameId);
    if (!game || eligibleFuture.has(game.id)) continue;
    if (prediction.predictedTeamId === game.awayTeamId) historical.awayTeamPicks.push(prediction.id);
    if (game.neutralSite) historical.neutralPredictions.push(prediction.id);
    if (!finalPopulation.has(game.id)) historical.outsideCurrentFinalPopulation.push(prediction.id);
  }
  const futureIssues = Object.values(future).reduce((sum, rows) => sum + rows.length, 0);
  return {
    policy: "Report only. Preserve historical predictions; no deletion, backfill, or grading.",
    asOf: snapshot.asOf,
    easternDate: formatEasternDateKey(asOf),
    transactionReadOnly: snapshot.readOnly,
    counts: {
      predictionRows: snapshot.predictions.length,
      distinctGames: byGame.size,
      graded: snapshot.predictions.filter((row) => row.actualWinnerId !== null).length,
      ungraded: snapshot.predictions.filter((row) => row.actualWinnerId === null).length,
      finalInScope, finalCalled, futureEligible, futureCalled,
    },
    integrity: { status: integrity.length ? "FAIL" : "PASS", issues: integrity },
    preservedHistoricalDiagnostics: {
      status: "REPORT_ONLY",
      counts: Object.fromEntries(Object.entries(historical).map(([key, rows]) => [key, rows.length])),
      rows: historical,
    },
    eligibleFutureConsistency: {
      status: futureIssues ? "FAIL" : "PASS",
      counts: Object.fromEntries(Object.entries(future).map(([key, rows]) => [key, rows.length])),
      rows: future,
    },
    ok: integrity.length === 0 && futureIssues === 0,
  };
}

export async function readPredictionSnapshot(): Promise<PredictionSnapshot> {
  const { loadEnvLocal } = await import("@/lib/load-env-local");
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the read-only report");
  const { createDatabase, createDbPool, dbPoolConfig } = await import("@/lib/db/pool");
  const { sql } = await import("drizzle-orm");
  const pool = createDbPool({ ...dbPoolConfig(process.env.DATABASE_URL), max: 1 });
  try {
    return await createDatabase(pool).transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL TIME ZONE 'UTC'`);
      const { rows: [context] } = await tx.execute<{ asOf: string; readOnly: string }>(sql`
        SELECT current_timestamp::text AS "asOf", current_setting('transaction_read_only') AS "readOnly"
      `);
      const { rows: games } = await tx.execute<AuditGame>(sql`SELECT id, date::text, season, status,
        game_type AS "gameType", home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
        home_score AS "homeScore", away_score AS "awayScore", tip_off_utc::text AS "tipOffUtc",
        neutral_site AS "neutralSite" FROM games ORDER BY id`);
      const { rows: predictions } = await tx.execute<AuditPrediction>(sql`SELECT id, game_id AS "gameId",
        predicted_advantage_team_id AS "predictedTeamId", actual_winner_id AS "actualWinnerId",
        rest_advantage_differential AS gap FROM predictions ORDER BY id`);
      const { rows: scores } = await tx.execute<AuditScore>(sql`SELECT DISTINCT ON (game_id, team_id) game_id AS "gameId", team_id AS "teamId", score
        FROM fatigue_scores ORDER BY game_id, team_id, computed_at DESC, id DESC`);
      return { ...context, games, predictions, scores };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("Usage: verify_predictions.ts (read-only report; no flags)");
  const report = auditPredictions(await readPredictionSnapshot());
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
