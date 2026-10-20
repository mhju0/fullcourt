import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';

// These contracts use real PostgreSQL; authenticated old-source replay is a separate unmocked rehearsal gate.
vi.mock('./sources', async importOriginal => {
  const actual = await importOriginal<typeof import('./sources')>();
  return { ...actual, verifyOldCheckout: () => undefined, verifyGeometryOnly: () => undefined,
    verifyClosure: (closure: import('./types').SourceClosure) => {
      for (const [file, digest] of Object.entries(closure.files))
        if (actual.bytesHash(readFileSync(resolve(closure.root, file))) !== digest) throw new Error('Frozen source changed');
    }, loadSourceProof: () => ({ geometrySources: {} }) };
});
import { applyManifest, capture, hash, snapshotTables } from './core';
import { assertLocalDatabase, connectionTarget, targetFingerprint } from './authorization';
import { bytesHash } from './sources';
import { fixtureManifest, fixtureSnapshot } from './test-fixture';
import type { Manifest, Row } from './types';

const url = process.env.ARENA_CONTRACT_DATABASE_URL;
describe.skipIf(!url)('arena correction PostgreSQL transaction protocol (private schema)', () => {
  const schema = `arena_contract_${process.pid}_${Date.now()}`;
  const directory = mkdtempSync(join(tmpdir(), 'arena-pg-'));
  let admin: postgres.Sql, sql: postgres.Sql, blocker: postgres.Sql, manifest: Manifest;
  const open = () => postgres(url!, { max: 1, prepare: false, connection: { search_path: schema } });
  const captureBound = (client: postgres.Sql) => client.begin(async tx => { await tx.unsafe("set local TimeZone='UTC'"); return capture(tx); });
  const digest = () => bytesHash(JSON.stringify(manifest));
  beforeAll(async () => {
    assertLocalDatabase(url!);
    admin = postgres(url!, { max: 1, prepare: false });
    await admin.unsafe(`create schema ${schema}`);
    for (const table of snapshotTables) await admin.unsafe(`create table ${schema}.${table} (like public.${table} including all)`);
    await admin.unsafe(`create sequence ${schema}.predictions_id_seq owned by ${schema}.predictions.id`);
    await admin.unsafe(`alter table ${schema}.predictions alter id set default nextval('${schema}.predictions_id_seq')`);
    sql = open(); blocker = open();
  });
  afterAll(async () => {
    await sql?.end(); await blocker?.end();
    if (admin) { await admin.unsafe(`drop schema if exists ${schema} cascade`); await admin.end(); }
    rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await sql.unsafe(`truncate ${snapshotTables.join(',')} restart identity cascade`);
    const fixture = fixtureSnapshot();
    for (const table of snapshotTables) {
      const [record] = await admin.unsafe(`select to_jsonb(t) as row from public.${table} t order by id limit 1`);
      const template = record.row as Row;
      for (const row of fixture[table]) {
        const merged = Object.fromEntries(Object.keys(template).map(key => [key, key in row ? row[key] : template[key]]));
        if (table === 'teams') { merged.name = `Test ${row.id}`; merged.abbreviation = row.abbreviation; }
        if (table === 'playoff_series_predictions') { merged.series_id = 265; merged.external_series_key = '2002-03_NOP-PHI'; }
        const columns = Object.keys(merged);
        await sql.unsafe(`insert into ${table} (${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_recordset(null::${table},$1::jsonb)`, [sql.json([merged] as postgres.JSONValue)]);
      }
    }
    const before = await captureBound(sql);
    manifest = fixtureManifest(before, directory, targetFingerprint(connectionTarget(sql)));
  });
  it('applies actual changed rows, retains untouched timestamps/history, reconnects and conditionally rolls back', async () => {
    const baseline = await captureBound(sql);
    expect(await applyManifest(sql, manifest, 'apply', digest())).toBe('applied');
    const after = await captureBound(sql);
    expect(hash(after)).toBe(manifest.afterHash);
    expect(after.fatigue_scores[1]).toEqual(baseline.fatigue_scores[1]);
    expect(after.predictions.filter(row => row.actual_winner_id !== null)).toEqual(baseline.predictions.filter(row => row.actual_winner_id !== null));
    expect(after.playoff_series_predictions).toEqual(baseline.playoff_series_predictions);
    expect(await applyManifest(sql, manifest, 'apply', digest())).toBe('already-current');
    const reopened = open(); try { expect(hash(await captureBound(reopened))).toBe(manifest.afterHash); } finally { await reopened.end(); }
    expect(await applyManifest(sql, manifest, 'rollback', digest())).toBe('rolled-back');
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
    expect(await applyManifest(sql, manifest, 'rollback', digest())).toBe('already-current');
  });
  it.each(['insert', 'update'] as const)('executes and reverses an eligible future forecast %s with exact identity/timestamp preservation', async operation => {
    const baseline = await captureBound(sql);
    const team = { ...baseline.teams[0], id: 3, abbreviation: 'CLE', name: 'Test 3' };
    const names = Object.keys(team);
    await sql.unsafe(`insert into teams (${names.join(',')}) select ${names.join(',')} from jsonb_populate_recordset(null::teams,$1::jsonb)`, [sql.json([team] as postgres.JSONValue)]);
    await sql.unsafe("update games set date='2099-10-20',season='2099-00' where id=1");
    await sql.unsafe('update games set home_team_id=3 where id=2');
    await sql.unsafe('update fatigue_scores set team_id=3,score=0 where id=3');
    await sql.unsafe('update fatigue_scores set score=$1 where id=4', [operation === 'insert' ? 0 : 99]);
    if (operation === 'insert') await sql.unsafe('delete from predictions where id=2');
    else await sql.unsafe('update predictions set predicted_advantage_team_id=3,rest_advantage_differential=99 where id=2');
    manifest = fixtureManifest(await captureBound(sql), directory, targetFingerprint(connectionTarget(sql)));
    expect(manifest.report.forecastChanges[operation === 'insert' ? 'inserted' : 'updated']).toHaveLength(1);
    expect(await applyManifest(sql, manifest, 'apply', digest())).toBe('applied');
    const after = await captureBound(sql);
    expect(hash(after)).toBe(manifest.afterHash);
    if (operation === 'update') {
      expect(after.predictions[1].id).toBe(manifest.before.predictions[1].id);
      expect(after.predictions[1].created_at).toBe(manifest.before.predictions[1].created_at);
    } else expect(after.predictions[1].id).toBeGreaterThan(manifest.before.predictions.at(-1)!.id);
    expect(await applyManifest(sql, manifest, 'rollback', digest())).toBe('rolled-back');
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
  it.each(['fatigue_scores', 'predictions', 'playoff_series'] as const)('rolls back all six tables after %s-stage failure', async stage => {
    await expect(applyManifest(sql, manifest, 'apply', digest(), stage)).rejects.toThrow('Injected');
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
  it.each(['teams', 'games', 'fatigue_scores', 'predictions', 'playoff_series', 'playoff_series_predictions'] as const)('full-domain CAS refuses %s drift before writing', async table => {
    await sql.unsafe(`update ${table} set id=id+10000 where id=(select min(id) from ${table})`);
    const drifted = hash(await captureBound(sql));
    await expect(applyManifest(sql, manifest, 'apply', digest())).rejects.toThrow('state drift');
    expect(hash(await captureBound(sql))).toBe(drifted);
  });
  it('refuses stale rollback after later work and refuses modified source bytes', async () => {
    expect(await applyManifest(sql, manifest, 'apply', digest())).toBe('applied');
    await sql.unsafe('update fatigue_scores set score=score+1 where id=1');
    const drift = hash(await captureBound(sql));
    await expect(applyManifest(sql, manifest, 'rollback', digest())).rejects.toThrow('state drift');
    expect(hash(await captureBound(sql))).toBe(drift);
    manifest.toolSources.files['src/lib/fatigue.ts'] = '0'.repeat(64);
    await expect(applyManifest(sql, manifest, 'rollback', digest())).rejects.toThrow('Frozen source');
  });
  it('takes all-six-table writer locks before touching a candidate row', async () => {
    let ready!: () => void, release!: () => void;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const lock = blocker.begin(async tx => { await tx.unsafe('lock table playoff_series_predictions in row exclusive mode'); ready(); await held; });
    await acquired;
    try { await expect(applyManifest(sql, manifest, 'apply', digest())).rejects.toThrow(/lock timeout/); } finally { release(); await lock; }
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
  it('sees a writer that commits while waiting for locks even when the session default is repeatable read', async () => {
    await sql.unsafe("set default_transaction_isolation='repeatable read'");
    const [{ pid }] = await sql.unsafe('select pg_backend_pid() as pid');
    let ready!: () => void, release!: () => void;
    const acquired = new Promise<void>(resolve => { ready = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const writer = blocker.begin(async tx => {
      await tx.unsafe("update teams set city=city||' late writer' where id=1");
      ready(); await held;
    });
    await acquired;
    const applying = applyManifest(sql, manifest, 'apply', digest());
    const refusal = expect(applying).rejects.toThrow('state drift');
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [state] = await admin.unsafe('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
        if (state?.wait_event_type === 'Lock') { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally {
      release(); await writer;
      await refusal;
      await sql.unsafe('reset default_transaction_isolation');
    }
    const current = await captureBound(sql);
    expect(hash(current.fatigue_scores)).toBe(hash(manifest.before.fatigue_scores));
    expect(hash(current.predictions)).toBe(hash(manifest.before.predictions));
    expect(hash(current.playoff_series)).toBe(hash(manifest.before.playoff_series));
    expect(hash(current.teams)).not.toBe(hash(manifest.before.teams));
  });
  it('aborts when a future tip elapses during real PostgreSQL writes', async () => {
    const tip = new Date(Date.now() + 1200).toISOString();
    await sql.unsafe('update games set tip_off_utc=$1 where id=2', [tip]);
    manifest = fixtureManifest(await captureBound(sql), directory, targetFingerprint(connectionTarget(sql)));
    await sql.unsafe(`create or replace function ${schema}.slow_arena_update() returns trigger language plpgsql as $$ begin perform pg_sleep(1.5); return new; end $$`);
    await sql.unsafe(`create trigger slow_arena_update before update on fatigue_scores for each statement execute function ${schema}.slow_arena_update()`);
    try { await expect(applyManifest(sql, manifest, 'apply', digest())).rejects.toThrow('eligibility'); }
    finally { await sql.unsafe('drop trigger slow_arena_update on fatigue_scores'); }
    expect(hash(await captureBound(sql))).toBe(manifest.beforeHash);
  });
});
