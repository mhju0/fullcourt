import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { recomputeFatigue, semanticInputHash } from '../overtime-correction/semantics';
import { deriveTransition, forecastConsistency, hash, snapshotTables } from './core';
import { rebuildForecasts } from '../overtime-correction/semantics';
import { BASELINE_COMMIT, bytesHash, ENGINE_ENTRY } from './sources';
import type { Manifest, Snapshot, Row, BaselineEvidence } from './types';

export function fixtureSnapshot(): Snapshot {
  const teams: Row[] = [
    { id: 1, abbreviation: 'CHI', latitude: '41.8807', longitude: '-87.6742', altitude_flag: false },
    { id: 2, abbreviation: 'DET', latitude: '42.341', longitude: '-83.055', altitude_flag: false },
  ];
  const games: Row[] = [
    { id: 1, external_id: 'test-final', date: '2020-01-01', season: '2019-20', status: 'final', game_type: 'regular', home_team_id: 1, away_team_id: 2, home_score: 110, away_score: 100, overtime_periods: 0, tip_off_utc: null, neutral_site: false, neutral_venue_city: null },
    { id: 2, external_id: 'test-future', date: '2099-10-21', season: '2099-00', status: 'scheduled', game_type: 'regular', home_team_id: 1, away_team_id: 2, home_score: null, away_score: null, overtime_periods: 0, tip_off_utc: '2099-10-21T23:00:00+00:00', neutral_site: false, neutral_venue_city: null },
  ];
  const snapshot: Snapshot = { teams, games, fatigue_scores: games.flatMap((game, index) => [1, 2].map((team, side) => ({ id: index * 2 + side + 1, game_id: game.id, team_id: team, computed_at: '2000-01-01T00:00:00', score: 0 }))), predictions: [
    { id: 1, game_id: 1, actual_winner_id: 1, predicted_advantage_team_id: 1, rest_advantage_differential: 2, created_at: '2000-01-01T00:00:00', spread_covered: null },
    { id: 2, game_id: 2, actual_winner_id: null, predicted_advantage_team_id: 1, rest_advantage_differential: 3, created_at: '2000-01-01T00:00:00', spread_covered: null },
  ], playoff_series: [
    { id: 265, external_series_key: '2002-03_NOP-PHI', conference: null, seed_diff: 2, computed_at: '2000-01-01T00:00:00' },
    { id: 278, external_series_key: '2003-04_MIA-NOP', conference: null, seed_diff: 3, computed_at: '2000-01-01T00:00:00' },
  ], playoff_series_predictions: [{ id: 1, series_id: 265, probability: 0.6 }] };
  snapshot.fatigue_scores = recomputeFatigue(snapshot, '2000-01-01T00:00:00').rows;
  snapshot.fatigue_scores[0].travel_distance_miles = 1;
  snapshot.fatigue_scores[3].score = 3;
  return snapshot;
}
export function fixtureManifest(before: Snapshot, directory: string, fingerprint = 'f'.repeat(64)): Manifest {
  const computedAt = '2026-10-20T00:00:00', asOf = '2026-10-20T00:00:00Z';
  const { after, report } = deriveTransition(before, asOf, computedAt);
  const root = resolve(process.cwd());
  const oldSources = { root, entry: ENGINE_ENTRY, files: {} };
  const sourceProofSha256 = 'a'.repeat(64);
  const baseline: BaselineEvidence = { kind: 'arena-baseline', version: 1, capturedAt: asOf, databaseTimeZone: 'UTC', sixTableHash: hash(before), semanticInputHash: semanticInputHash(before), sides: before.fatigue_scores.length, differences: 0, replayRowsHash: hash(before.fatigue_scores), oldCommit: BASELINE_COMMIT, oldSources, sourceProofSha256, captureTargetFingerprint: fingerprint, rowCounts: Object.fromEntries(snapshotTables.map(table => [table, before[table].length])), futureForecastConsistency: forecastConsistency(before, rebuildForecasts(before, asOf, computedAt), asOf).counts };
  const filename = join(directory, 'baseline.json');
  writeFileSync(filename, JSON.stringify(baseline));
  const frozen = { 'src/lib/fatigue.ts': bytesHash(readFileSync(resolve(root, 'src/lib/fatigue.ts'))) };
  return { kind: 'arena-correction', version: 1, createdAt: asOf, asOf, computedAt, databaseTimeZone: 'UTC', targetFingerprint: fingerprint, beforeHash: hash(before), afterHash: hash(after), before, after, baseline, baselineEvidence: { path: filename, sha256: bytesHash(readFileSync(filename)) }, sourceProof: { path: join(directory, 'source-boundary-isolated.json'), sha256: sourceProofSha256 }, sourceProofSha256, newSources: { root, entry: ENGINE_ENTRY, files: frozen }, toolSources: { root, entry: '', files: frozen }, report };
}
