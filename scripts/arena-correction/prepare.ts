import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';
import { assertLocalDatabase, connectionTarget, targetFingerprint, safeError } from './authorization';
import { capture, hash, snapshotTables, currentSourceClosures, deriveTransition, forecastConsistency, verifyManifest } from './core';
import { semanticInputHash } from '../overtime-correction/semantics';
import { BASELINE_COMMIT, ENGINE_ENTRY, bytesHash, collectSources, loadSourceProof, verifyClosure, toolEntries } from './sources';
import { replayReleasedEngine } from './replay';
import type { BaselineEvidence, Manifest } from './types';

async function main() {
  const [output, oldRoot, proofPath, flag, expectedProof, ...extra] = process.argv.slice(2);
  if (!output || !oldRoot || !proofPath || flag !== '--expected-source-proof-sha' || !/^[a-f0-9]{64}$/.test(expectedProof ?? '') || !(extra.length === 0 || extra.length === 2 && extra[0] === '--target-fingerprint' && /^[a-f0-9]{64}$/.test(extra[1])))
    throw new Error('Usage: tsx scripts/arena-correction/prepare.ts OUTPUT.json OLD_656_CHECKOUT PROOF.json --expected-source-proof-sha SHA256 [--target-fingerprint REVIEWED_DESTINATION_SHA]');
  const proofBinding = { path: resolve(proofPath), sha256: expectedProof };
  loadSourceProof(proofBinding);
  const oldSources = collectSources(oldRoot, [ENGINE_ENTRY]);
  const closures = currentSourceClosures();
  config({ path: '.env.local', quiet: true });
  const url = process.env.ARENA_LOCAL_DATABASE_URL ?? '';
  assertLocalDatabase(url);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const before = await sql.begin(async tx => {
      await tx.unsafe('set transaction isolation level repeatable read read only');
      await tx.unsafe("set local TimeZone='UTC'");
      return capture(tx);
    });
    const asOf = new Date().toISOString();
    const [{ stamp }] = await sql.begin(async tx => { await tx.unsafe("set local TimeZone='UTC'"); return tx`select to_jsonb(localtimestamp) as stamp`; });
    const computedAt = String(stamp);
    const replay = replayReleasedEngine(oldSources, before, computedAt, asOf);
    if (replay.changed.length || hash(replay.rows) !== hash(before.fatigue_scores)) throw new Error('Fresh baseline differs from immutable released engine; prepare refused');
    const oldForecasts = forecastConsistency(before, replay.forecasts, asOf);
    if (oldForecasts.counts.inserted || oldForecasts.counts.updated || oldForecasts.counts.deleted) {
      mkdirSync(dirname(resolve(output)), { recursive: true });
      writeFileSync(`${output}.baseline-forecast-diff.json`, JSON.stringify(oldForecasts, null, 2) + '\n');
      throw new Error('Old-source future forecasts do not already reconcile; independent diff written, no arena manifest produced');
    }
    const baseline: BaselineEvidence = {
      kind: 'arena-baseline', version: 1, capturedAt: asOf, databaseTimeZone: 'UTC',
      sixTableHash: hash(before), semanticInputHash: semanticInputHash(before), sides: before.fatigue_scores.length,
      differences: 0, replayRowsHash: hash(replay.rows), oldCommit: BASELINE_COMMIT, oldSources,
      sourceProofSha256: expectedProof, captureTargetFingerprint: targetFingerprint(connectionTarget(sql)), rowCounts: Object.fromEntries(snapshotTables.map(table => [table, before[table].length])), futureForecastConsistency: oldForecasts.counts,
    };
    const { after, report } = deriveTransition(before, asOf, computedAt);
    const baselinePath = resolve(`${output}.baseline.json`);
    const baselineBytes = JSON.stringify(baseline);
    mkdirSync(dirname(resolve(output)), { recursive: true });
    writeFileSync(baselinePath, baselineBytes);
    const manifest: Manifest = {
      kind: 'arena-correction', version: 1, createdAt: asOf, asOf, computedAt, databaseTimeZone: 'UTC',
      targetFingerprint: extra[1] ?? targetFingerprint(connectionTarget(sql)), beforeHash: hash(before), afterHash: hash(after), before, after,
      baseline, baselineEvidence: { path: baselinePath, sha256: bytesHash(baselineBytes) },
      sourceProof: proofBinding, sourceProofSha256: expectedProof, ...closures, report,
    };
    verifyClosure(closures.toolSources, toolEntries);
    verifyManifest(manifest);
    const encoded = JSON.stringify(manifest);
    writeFileSync(output, encoded);
    writeFileSync(`${output}.sha256`, bytesHash(encoded) + '\n');
    writeFileSync(`${output}.report.json`, JSON.stringify({ manifestSha256: bytesHash(encoded), beforeHash: manifest.beforeHash, afterHash: manifest.afterHash, sourceProofSha256: expectedProof, report }, null, 2) + '\n');
    console.log(JSON.stringify({ output, manifestSha256: bytesHash(encoded), beforeHash: manifest.beforeHash, afterHash: manifest.afterHash, sourceProofSha256: expectedProof, changedFatigueSides: report.fatigueChanges.length, affectedSeasons: report.affectedSeasons, futureForecasts: { inserted: report.forecastChanges.inserted.length, updated: report.forecastChanges.updated.length, deleted: report.forecastChanges.deleted.length } }));
  } finally {
    await sql.end();
  }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
