import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Primary-source authentication is isolated here; source-closure contracts are tested separately.
vi.mock('./sources', async importOriginal => {
  const actual = await importOriginal<typeof import('./sources')>();
  return { ...actual, verifyOldCheckout: () => undefined, verifyGeometryOnly: () => undefined,
    verifyClosure: (closure: import('./types').SourceClosure) => {
      for (const [file, digest] of Object.entries(closure.files))
        if (actual.bytesHash(readFileSync(resolve(closure.root, file))) !== digest) throw new Error('Frozen source changed');
    }, loadSourceProof: () => ({ geometrySources: {} }) };
});
import { assertForecastClock, assertManifestBytes, deriveTransition, forecastDelta, hash, verifyManifest } from './core';
import { bytesHash } from './sources';
import { fixtureManifest, fixtureSnapshot } from './test-fixture';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() { const directory = mkdtempSync(join(tmpdir(), 'arena-core-')); directories.push(directory); return fixtureManifest(fixtureSnapshot(), directory); }
describe('arena exact-column transition', () => {
  it('derives complete fatigue replay, two metadata cells and only eligible future forecasts', () => {
    const manifest = fixture();
    verifyManifest(manifest);
    expect(manifest.report.fatigueChanges.map(row => row.id)).toEqual([1, 4]);
    expect(manifest.after.fatigue_scores[1]).toEqual(manifest.before.fatigue_scores[1]);
    expect(manifest.report.forecastChanges.deleted.map(row => row.id)).toEqual([2]);
    expect(manifest.report.oldForecastConsistency).toMatchObject({ eligibleGames: 1, existingCalls: 1, expectedCalls: 1, inserted: 0, updated: 0, deleted: 0 });
    expect(manifest.after.predictions).toEqual([manifest.before.predictions[0]]);
    expect(manifest.after.playoff_series.map(row => row.conference)).toEqual(['East', 'East']);
    expect(manifest.after.playoff_series_predictions).toEqual(manifest.before.playoff_series_predictions);
  });
  it.each(['teams', 'games', 'playoff_series_predictions'] as const)('rejects tampered %s even with a refreshed snapshot checksum', table => {
    const manifest = fixture(); manifest.after[table][0].id += 100;
    manifest.afterHash = hash(manifest.after);
    expect(() => verifyManifest(manifest)).toThrow();
  });
  it('refuses metadata model-input edits, timestamp-only churn and a forged report', () => {
    for (const change of ['feature', 'timestamp', 'report'] as const) {
      const manifest = fixture();
      if (change === 'feature') manifest.after.playoff_series[0].seed_diff = 999;
      if (change === 'timestamp') manifest.after.fatigue_scores[1].computed_at = manifest.computedAt;
      if (change === 'report') manifest.report.fatigueChanges = [];
      manifest.afterHash = hash(manifest.after);
      expect(() => verifyManifest(manifest)).toThrow();
    }
  });
  it('refuses resolved/past forecasts, unknown source bytes and unsupported manifest versions', () => {
    const manifest = fixture(); manifest.after.predictions[0].rest_advantage_differential = 99; manifest.afterHash = hash(manifest.after);
    expect(() => verifyManifest(manifest)).toThrow('resolved');
    const source = fixture(); source.newSources.files['src/lib/fatigue.ts'] = '0'.repeat(64);
    expect(() => verifyManifest(source)).toThrow('Frozen source');
    const version = fixture(); (version as unknown as { version: number }).version = 2;
    expect(() => verifyManifest(version)).toThrow('contract');
  });
  it('refuses unrelated old future-call inconsistency rather than silently filling it', () => {
    const before = fixtureSnapshot(); before.predictions[1].rest_advantage_differential = 99;
    expect(() => deriveTransition(before, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00')).toThrow('report-only');
  });
  it('enumerates inserts, updates and deletes; enforces actual clock for every changed game', () => {
    const a = [{ id: 1, game_id: 2 }, { id: 2, game_id: 2, value: 1 }];
    const b = [{ id: 2, game_id: 2, value: 2 }, { id: 3, game_id: 2 }];
    expect(forecastDelta(a, b)).toEqual({ inserted: [b[1]], updated: [{ before: a[1], after: b[0] }], deleted: [a[0]] });
    const manifest = fixture();
    expect(() => assertForecastClock(manifest.before, manifest.report.forecastChanges, Date.parse('2099-10-21T22:59:59Z'))).not.toThrow();
    expect(() => assertForecastClock(manifest.before, manifest.report.forecastChanges, Date.parse('2099-10-21T23:00:00Z'))).toThrow('eligibility');
    manifest.before.games[1].status = 'live';
    expect(() => assertForecastClock(manifest.before, manifest.report.forecastChanges, Date.parse('2099-10-20T00:00:00Z'))).toThrow('eligibility');
  });
  it('requires an externally frozen exact manifest body', () => {
    const bytes = Buffer.from(JSON.stringify(fixture()));
    expect(assertManifestBytes(bytes, bytesHash(bytes)).kind).toBe('arena-correction');
    expect(() => assertManifestBytes(bytes, '')).toThrow('frozen');
    expect(() => assertManifestBytes(Buffer.concat([bytes, Buffer.from(' ')]), bytesHash(bytes))).toThrow('frozen');
  });
});
