import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const { auditPredictions } = await tsImport("../verify_predictions.ts", import.meta.url);
const { dbPoolConfig } = await tsImport("../../src/lib/db/pool.ts", import.meta.url);

const root = fileURLToPath(new URL("../../", import.meta.url));
const game = (id, extra = {}) => ({ id, date: "2025-01-10", season: "2024-25", status: "final",
  gameType: "regular", homeTeamId: 1, awayTeamId: 2, homeScore: 100, awayScore: 90,
  tipOffUtc: null, neutralSite: false, ...extra });
const prediction = (id, gameId, extra = {}) => ({ id, gameId, predictedTeamId: 1,
  actualWinnerId: 1, gap: "1.00", ...extra });
const scores = (gameId, home = 1, away = 2) => [
  { gameId, teamId: 1, score: home }, { gameId, teamId: 2, score: away },
];
const snapshot = (games, predictions, scoreRows) => ({ asOf: "2026-10-20T12:00:00Z", readOnly: "on",
  games, predictions, scores: scoreRows });

test("historical missing, withdrawn, away, neutral and gap differences stay report-only", () => {
  const report = auditPredictions(snapshot(
    [game(1), game(2), game(3, { neutralSite: true })],
    [prediction(2, 2, { predictedTeamId: 2, gap: -2 }), prediction(3, 3)],
    [...scores(1), ...scores(2, 2, 1), ...scores(3)],
  ));
  assert.equal(report.ok, true);
  assert.equal(report.integrity.status, "PASS");
  assert.equal(report.preservedHistoricalDiagnostics.status, "REPORT_ONLY");
  assert.deepEqual(report.preservedHistoricalDiagnostics.rows.calledButMissing, [1]);
  assert.deepEqual(report.preservedHistoricalDiagnostics.rows.storedButNoLongerCalled, [2, 3]);
  assert.deepEqual(report.preservedHistoricalDiagnostics.rows.gapDifferences, [2]);
  assert.deepEqual(report.preservedHistoricalDiagnostics.rows.awayTeamPicks, [2]);
  assert.deepEqual(report.preservedHistoricalDiagnostics.rows.neutralPredictions, [3]);
});

test("duplicate IDs/games, orphans, nonparticipant teams and invalid gaps fail integrity", () => {
  const report = auditPredictions(snapshot([game(1)], [
    prediction(1, 1), prediction(1, 1, { predictedTeamId: 3, actualWinnerId: 4, gap: "NaN" }),
    prediction(3, 999), prediction(4, 1, { gap: "" }),
  ], scores(1)));
  assert.equal(report.ok, false);
  for (const message of ["duplicate prediction id", "duplicate predictions for game", "orphan prediction",
    "predicted team is not in fixture", "actual team is not in fixture", "invalid gap"]) {
    assert.ok(report.integrity.issues.some((issue) => issue.includes(message)), message);
  }
});

test("future current-rule drift fails, while elapsed, abnormal and resolved rows remain preserved", () => {
  const future = { status: "scheduled", date: "2026-10-21", season: "2026-27",
    homeScore: null, awayScore: null, tipOffUtc: "2026-10-22T00:00:00Z" };
  const report = auditPredictions(snapshot([
    game(1, future), game(2, future), game(3, { ...future, neutralSite: true }),
    game(4, { ...future, tipOffUtc: "2026-10-20T11:00:00Z" }),
    game(5, future), game(6, { ...future, date: "2020-08-01", season: "2019-20" }),
  ], [prediction(2, 2, { actualWinnerId: null, gap: 2 }),
    prediction(3, 3, { actualWinnerId: null }), prediction(4, 4, { actualWinnerId: null }),
    prediction(5, 5), prediction(6, 6, { actualWinnerId: null })],
  [1, 2, 3, 4, 5, 6].flatMap((id) => scores(id))));
  assert.equal(report.ok, false);
  assert.equal(report.counts.futureEligible, 3);
  assert.deepEqual(report.eligibleFutureConsistency.rows.calledButMissing, [1]);
  assert.deepEqual(report.eligibleFutureConsistency.rows.gapDifferences, [2]);
  assert.deepEqual(report.eligibleFutureConsistency.rows.storedButNoLongerCalled, [3]);
  assert.equal(report.integrity.status, "PASS");
});

test("canonical two-decimal boundary and absent future score context", () => {
  const extra = { status: "scheduled", date: "2026-10-21", season: "2026-27",
    tipOffUtc: "2026-10-22T00:00:00Z" };
  const report = auditPredictions(snapshot([game(1, extra), game(2, extra)],
    [prediction(1, 1, { actualWinnerId: null, gap: "0.50" })], scores(1, 3.85, 4.35)));
  assert.equal(report.counts.futureCalled, 1);
  assert.deepEqual(report.eligibleFutureConsistency.rows.gapDifferences, []);
  assert.deepEqual(report.eligibleFutureConsistency.rows.missingScoreContext, [2]);
});

test("future wrong-side pick is actionable without changing or grading the input snapshot", () => {
  const input = snapshot([game(1, { status: "scheduled", date: "2026-10-20", season: "2026-27",
    tipOffUtc: "2026-10-20T13:00:00Z" })],
  [prediction(1, 1, { predictedTeamId: 2, actualWinnerId: null })], scores(1));
  const before = JSON.stringify(input);
  const report = auditPredictions(input);
  assert.equal(report.integrity.status, "PASS");
  assert.equal(report.eligibleFutureConsistency.status, "FAIL");
  assert.deepEqual(report.eligibleFutureConsistency.rows.differentCalledTeam, [1]);
  assert.equal(JSON.stringify(input), before);
});

test("actual reset --apply refuses before env-file access or database connection", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "fullcourt-prediction-policy-"));
  try {
    // A directory at the env-file path would throw EISDIR if loadEnvLocal ran.
    mkdirSync(path.join(cwd, ".env.local"));
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig", path.join(root, "tsconfig.json"), path.join(root, "scripts/reset_predictions.ts"), "--apply"],
    { cwd, env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Preservation policy: --apply is disabled/);
    assert.doesNotMatch(result.stderr, /EISDIR|DATABASE_URL|ECONNREFUSED/);
    assert.equal(result.stdout, "");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("report sources contain no SQL mutation, backup or artifact write path", () => {
  for (const filename of ["verify_predictions.ts", "reset_predictions.ts"]) {
    const source = readFileSync(path.join(root, "scripts", filename), "utf8");
    assert.doesNotMatch(source, /\b(?:DELETE\s+FROM|UPDATE\s+predictions|INSERT\s+INTO|TRUNCATE|writeFile|mkdir|BACKUP_PATH)\b/i);
  }
  assert.match(readFileSync(path.join(root, "scripts/verify_predictions.ts"), "utf8"),
    /isolationLevel: "repeatable read", accessMode: "read only"/);
});


test("report retains shared bounded pool and verified-CA transaction-pool configuration", () => {
  const config = dbPoolConfig("postgresql://reader@example.invalid:6543/database", { DATABASE_SSL_CA: "test-ca" });
  assert.deepEqual(config.ssl, { ca: "test-ca", rejectUnauthorized: true });
  assert.equal(config.pipeline, false);
  assert.equal(config.connectionTimeoutMillis, 5000);
  assert.throws(() => dbPoolConfig("postgresql://reader@example.invalid/db?sslmode=disable", {
    DATABASE_SSL_CA: "test-ca",
  }), /without SSL query parameters/);
  const source = readFileSync(path.join(root, "scripts/verify_predictions.ts"), "utf8");
  assert.match(source, /createDbPool\(\{ \.\.\.dbPoolConfig\(process.env.DATABASE_URL\), max: 1 \}\)/);
  assert.match(source, /await pool.end\(\)/);
  assert.match(source, /SELECT DISTINCT ON \(game_id, team_id\)/);
  assert.match(source, /ORDER BY game_id, team_id, computed_at DESC, id DESC/);
});
