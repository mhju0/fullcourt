import { resolve } from 'node:path';
import type postgres from 'postgres';
import { capture, canonical, hash, snapshotTables } from '../history-correction/core';
import { components, recomputeFatigue, rebuildForecasts, semanticInputHash, scoreDifferences } from '../overtime-correction/semantics';
import { isNormallyPlayed } from '../../src/lib/season-regime';
import { authorize, connectionTarget, LOCAL_TARGET, type Authorization } from './authorization';
import { BASELINE_COMMIT, ENGINE_ENTRY, collectSources, loadSourceProof, toolEntries, validateFile, verifyClosure, verifyGeometryOnly, verifyOldCheckout, geometryPaths, bytesHash } from './sources';
import type { BaselineEvidence, ForecastConsistency, ForecastDelta, Manifest, Row, Snapshot, TransitionReport } from './types';
export { capture, hash, canonical, snapshotTables };
export type { Manifest, Snapshot, Row };

const conferenceCorrections = [
  { id: 265, key: '2002-03_NOP-PHI' },
  { id: 278, key: '2003-04_MIA-NOP' },
] as const;
const resolved = (snapshot: Snapshot) => snapshot.predictions.filter(row => row.actual_winner_id !== null);
export function forecastDelta(before: Row[], after: Row[]): ForecastDelta {
  const a = new Map(before.map(row => [row.id, row])), b = new Map(after.map(row => [row.id, row]));
  return {
    inserted: after.filter(row => !a.has(row.id)),
    updated: after.filter(row => a.has(row.id) && hash(row) !== hash(a.get(row.id))).map(row => ({ before: a.get(row.id)!, after: row })),
    deleted: before.filter(row => !b.has(row.id)),
  };
}
export function eligibleForecastGame(snapshot: Snapshot, gameId: number, clock: number): boolean {
  return eligibleForecastGames(snapshot, clock).has(gameId);
}
export function eligibleForecastGames(snapshot: Snapshot, clock: number): Set<number> {
  const resolvedGames = new Set(resolved(snapshot).map(row => Number(row.game_id)));
  return new Set(snapshot.games.filter(game => game.status === 'scheduled' && game.game_type === 'regular' && isNormallyPlayed(String(game.season), String(game.date)) && !!game.tip_off_utc && Date.parse(String(game.tip_off_utc)) > clock && !resolvedGames.has(game.id)).map(game => game.id));
}
export function changedForecastGames(delta: ForecastDelta): Set<number> {
  return new Set([...delta.inserted, ...delta.deleted, ...delta.updated.map(row => row.after)].map(row => Number(row.game_id)));
}
export function assertForecastClock(snapshot: Snapshot, delta: ForecastDelta, now = Date.now()): void {
  const eligible = eligibleForecastGames(snapshot, now);
  for (const gameId of changedForecastGames(delta))
    if (!eligible.has(gameId)) throw new Error(`Arena forecast eligibility expired, resolved or not regular/scheduled: ${gameId}`);
}
export function forecastConsistency(snapshot: Snapshot, expected: Row[], asOf: string): { counts: ForecastConsistency; delta: ForecastDelta } {
  const games = eligibleForecastGames(snapshot, Date.parse(asOf));
  const delta = forecastDelta(snapshot.predictions, expected);
  return { counts: { eligibleGames: games.size, existingCalls: snapshot.predictions.filter(row => games.has(Number(row.game_id))).length, expectedCalls: expected.filter(row => games.has(Number(row.game_id))).length, inserted: delta.inserted.length, updated: delta.updated.length, deleted: delta.deleted.length }, delta };
}
function preserveRowStructure(before: Row[], after: Row[], table: string): void {
  if (hash(before.map(row => row.id)) !== hash(after.map(row => row.id))) throw new Error(`${table} row additions/removals/order changes forbidden`);
  for (let index = 0; index < before.length; index++)
    if (hash(Object.keys(before[index]).sort()) !== hash(Object.keys(after[index]).sort())) throw new Error(`${table} column shape changed`);
}
export function deriveTransition(before: Snapshot, asOf: string, computedAt: string): { after: Snapshot; report: TransitionReport } {
  const consistency = forecastConsistency(before, rebuildForecasts(before, asOf, computedAt), asOf);
  if (consistency.counts.inserted || consistency.counts.updated || consistency.counts.deleted) throw new Error(`Old-source future forecast inconsistency is report-only; candidate refused: ${JSON.stringify(consistency.counts)}`);
  const after = structuredClone(before);
  const conferenceChanges: TransitionReport['conferenceChanges'] = [];
  for (const correction of conferenceCorrections) {
    const row = after.playoff_series.find(row => row.id === correction.id);
    if (!row || row.external_series_key !== correction.key || row.conference !== null) throw new Error('Arena conference metadata requires the exact two reviewed NULL-to-East rows');
    row.conference = 'East';
    conferenceChanges.push({ id: row.id, externalSeriesKey: correction.key, before: null, after: 'East' });
  }
  const fatigue = recomputeFatigue(before, computedAt);
  after.fatigue_scores = structuredClone(fatigue.rows);
  after.predictions = structuredClone(rebuildForecasts({ ...before, fatigue_scores: fatigue.rows }, asOf, computedAt));
  const forecastChanges = forecastDelta(before.predictions, after.predictions);
  const oldScores = new Map(before.fatigue_scores.map(row => [`${row.game_id}:${row.team_id}`, Number(row.score)]));
  const changedScoreGames = new Set(after.fatigue_scores.filter(row => Number(row.score) !== oldScores.get(`${row.game_id}:${row.team_id}`)).map(row => Number(row.game_id)));
  const eligible = eligibleForecastGames(before, Date.parse(asOf));
  for (const id of changedForecastGames(forecastChanges)) {
    if (!eligible.has(id)) throw new Error('Deterministic rebuild touched an ineligible forecast');
    if (!changedScoreGames.has(id)) throw new Error('Forecast transition requires an actual two-decimal fatigue score change');
  }
  const gameById = new Map(before.games.map(row => [row.id, row]));
  const changedIds = new Set([...forecastChanges.updated.map(row => row.before.id), ...forecastChanges.deleted.map(row => row.id)]);
  return { after, report: {
    scoredSides: before.fatigue_scores.length,
    fatigueChanges: fatigue.changed,
    affectedSeasons: [...new Set(fatigue.changed.map(row => String(gameById.get(row.gameId)!.season)))].sort(),
    conferenceChanges, forecastChanges,
    resolvedPredictionHash: hash(resolved(before)),
    preservedUnresolvedHash: hash(before.predictions.filter(row => row.actual_winner_id === null && !changedIds.has(row.id))),
    preservedPlayoffPredictionHash: hash(before.playoff_series_predictions),
    oldForecastConsistency: consistency.counts,
  } };
}
export function verifySources(manifest: Manifest): void {
  verifyOldCheckout(manifest.baseline.oldSources);
  verifyClosure(manifest.newSources, [ENGINE_ENTRY]);
  verifyClosure(manifest.toolSources, toolEntries);
  verifyGeometryOnly(manifest.baseline.oldSources, manifest.newSources);
  if (manifest.newSources.root !== resolve(process.cwd()) || manifest.toolSources.root !== resolve(process.cwd())) throw new Error('Arena candidate sources must bind this executing checkout');
  const proof = loadSourceProof(manifest.sourceProof);
  if (manifest.sourceProofSha256 !== manifest.sourceProof.sha256 || manifest.baseline.sourceProofSha256 !== manifest.sourceProof.sha256) throw new Error('Arena source proof binding mismatch');
  const geometry = Object.fromEntries(Object.entries(manifest.newSources.files).filter(([name]) => geometryPaths.has(name)));
  if (hash(proof.geometrySources) !== hash(geometry)) throw new Error('Arena proof does not bind the exact candidate geometry sources');
  const evidence = JSON.parse(validateFile(manifest.baselineEvidence).toString()) as BaselineEvidence;
  if (hash(evidence) !== hash(manifest.baseline)) throw new Error('Frozen old-source baseline receipt mismatch');
}
export function verifyManifest(manifest: Manifest): void {
  verifySources(manifest);
  if (manifest.kind !== 'arena-correction' || manifest.version !== 1 || manifest.createdAt !== manifest.asOf || !Number.isFinite(Date.parse(manifest.asOf)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(manifest.computedAt) || !Number.isFinite(Date.parse(manifest.computedAt + 'Z')) || manifest.databaseTimeZone !== 'UTC' || !/^[a-f0-9]{64}$/.test(manifest.targetFingerprint)) throw new Error('Invalid arena-only manifest contract');
  if (hash(manifest.before) !== manifest.beforeHash || hash(manifest.after) !== manifest.afterHash) throw new Error('Arena snapshot checksum mismatch');
  const baseline = manifest.baseline;
  if (baseline.kind !== 'arena-baseline' || baseline.version !== 1 || baseline.oldCommit !== BASELINE_COMMIT || baseline.differences !== 0 || baseline.sixTableHash !== manifest.beforeHash || baseline.semanticInputHash !== semanticInputHash(manifest.before) || baseline.replayRowsHash !== hash(manifest.before.fatigue_scores) || baseline.databaseTimeZone !== manifest.databaseTimeZone || baseline.sides !== manifest.before.fatigue_scores.length) throw new Error('Old-source fresh-baseline evidence mismatch');
  for (const table of snapshotTables) {
    for (const snapshot of [manifest.before, manifest.after]) {
      const ids = snapshot[table].map(row => row.id);
      if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && id <= ids[index - 1])) throw new Error(`Invalid/duplicate/unsorted ${table} row identity`);
    }
    if (baseline.rowCounts[table] !== manifest.before[table].length) throw new Error('Old-source baseline population mismatch');
    if (table !== 'predictions') preserveRowStructure(manifest.before[table], manifest.after[table], table);
  }
  for (const table of ['teams', 'games', 'playoff_series_predictions'] as const)
    if (hash(manifest.before[table]) !== hash(manifest.after[table])) throw new Error(`Arena immutable table changed: ${table}`);
  if (hash(resolved(manifest.before)) !== hash(resolved(manifest.after))) throw new Error('Arena correction must preserve all resolved prediction history');
  for (let index = 0; index < manifest.before.fatigue_scores.length; index++) {
    const old = manifest.before.fatigue_scores[index], next = manifest.after.fatigue_scores[index];
    if (old.game_id !== next.game_id || old.team_id !== next.team_id) throw new Error('Arena fatigue side identity changed');
    const mutable = new Set<string>([...Object.values(components), 'computed_at']);
    for (const field of Object.keys(old))
      if (!mutable.has(field) && canonical(old[field]) !== canonical(next[field])) throw new Error('Arena fatigue immutable field changed');
    if (!scoreDifferences(old, next).length && hash(old) !== hash(next)) throw new Error('Unchanged fatigue side/timestamp must remain byte-identical');
  }
  const expected = deriveTransition(manifest.before, manifest.asOf, manifest.computedAt);
  if (hash(baseline.futureForecastConsistency) !== hash(expected.report.oldForecastConsistency)) throw new Error('Old-source future forecast consistency counts mismatch');
  if (hash(expected.after) !== hash(manifest.after)) throw new Error('Arena candidate differs from exact complete replay/column transition');
  if (hash(expected.report) !== hash(manifest.report)) throw new Error('Arena report does not reconcile to actual replay/forecast transition');
}
export async function applyManifest(sql: postgres.Sql, manifest: Manifest, direction: 'apply' | 'rollback', expectedManifestDigest: string, failAfterTable?: 'fatigue_scores' | 'predictions' | 'playoff_series', authorization?: Authorization): Promise<string> {
  if (bytesHash(JSON.stringify(manifest)) !== expectedManifestDigest) throw new Error('Arena manifest object differs from externally frozen bytes');
  const target = connectionTarget(sql);
  if (authorization) {
    if (sql.options.ssl !== 'verify-full') throw new Error('Arena production requires certificate-verified TLS');
    authorize(target, manifest, direction, expectedManifestDigest, authorization);
  } else if (target.host !== LOCAL_TARGET.host || target.port !== LOCAL_TARGET.port || target.database !== LOCAL_TARGET.database) throw new Error('Arena mutation requires the exact local shadow or reviewed production bindings');
  verifyManifest(manifest);
  const from = direction === 'apply' ? manifest.before : manifest.after, to = direction === 'apply' ? manifest.after : manifest.before;
  return sql.begin(async tx => {
    await tx.unsafe('set transaction isolation level read committed');
    await tx.unsafe("set local lock_timeout='2s'");
    await tx.unsafe("set local statement_timeout='180s'");
    if (authorization) await tx.unsafe('set local search_path=public');
    await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;
    await tx.unsafe('lock table teams, games, fatigue_scores, predictions, playoff_series, playoff_series_predictions in share row exclusive mode');
    const current = await capture(tx), currentHash = hash(current);
    if (currentHash === hash(to)) return 'already-current';
    if (currentHash !== hash(from)) throw new Error('Frozen complete six-table state drift; no writes performed');
    assertForecastClock(current, manifest.report.forecastChanges);
    const oldScores = new Map(from.fatigue_scores.map(row => [row.id, row]));
    const scores = to.fatigue_scores.filter(row => hash(row) !== hash(oldScores.get(row.id)));
    const columns = [...Object.values(components), 'computed_at'];
    for (let index = 0; index < scores.length; index += 500)
      await tx.unsafe(`update fatigue_scores target set ${columns.map(name => `${name}=source.${name}`).join(',')} from jsonb_populate_recordset(null::fatigue_scores,$1::jsonb) source where target.id=source.id`, [tx.json(scores.slice(index, index + 500) as postgres.JSONValue)]);
    if (failAfterTable === 'fatigue_scores') throw new Error('Injected arena transaction failure after fatigue_scores');
    const predictions = forecastDelta(from.predictions, to.predictions);
    if (predictions.deleted.length) await tx.unsafe('delete from predictions where id=any($1::int[])', [predictions.deleted.map(row => row.id)]);
    const updates = predictions.updated.map(row => row.after);
    for (let index = 0; index < updates.length; index += 500)
      await tx.unsafe('update predictions target set predicted_advantage_team_id=source.predicted_advantage_team_id,rest_advantage_differential=source.rest_advantage_differential from jsonb_populate_recordset(null::predictions,$1::jsonb) source where target.id=source.id', [tx.json(updates.slice(index, index + 500) as postgres.JSONValue)]);
    for (const row of predictions.inserted) {
      const names = Object.keys(row);
      if (names.some(name => !/^[a-z][a-z0-9_]*$/.test(name))) throw new Error('Unsafe forecast column identifier');
      await tx.unsafe(`insert into predictions (${names.join(',')}) select ${names.join(',')} from jsonb_populate_recordset(null::predictions,$1::jsonb)`, [tx.json([row] as postgres.JSONValue)]);
    }
    if (failAfterTable === 'predictions') throw new Error('Injected arena transaction failure after predictions');
    const oldSeries = new Map(from.playoff_series.map(row => [row.id, row]));
    const series = to.playoff_series.filter(row => hash(row) !== hash(oldSeries.get(row.id)));
    for (const row of series) await tx.unsafe('update playoff_series set conference=$1 where id=$2', [row.conference as string | null, row.id]);
    if (failAfterTable === 'playoff_series') throw new Error('Injected arena transaction failure after playoff_series');
    const observed = await capture(tx);
    if (hash(observed) !== hash(to)) throw new Error('Post-write complete six-table hash mismatch; arena transaction rolled back');
    verifySources(manifest);
    if (predictions.inserted.length) await tx.unsafe("select setval(pg_get_serial_sequence('predictions','id'),greatest((select last_value from predictions_id_seq),(select coalesce(max(id),1) from predictions)),true)");
    assertForecastClock(observed, manifest.report.forecastChanges);
    return direction === 'apply' ? 'applied' : 'rolled-back';
  });
}

export function assertManifestBytes(bytes: Buffer, expected: string): Manifest {
  if (!/^[a-f0-9]{64}$/.test(expected) || bytesHash(bytes) !== expected) throw new Error('Externally frozen arena manifest digest mismatch');
  return JSON.parse(bytes.toString()) as Manifest;
}
export function currentSourceClosures() {
  return { newSources: collectSources(process.cwd(), [ENGINE_ENTRY]), toolSources: collectSources(process.cwd(), toolEntries) };
}
