import { afterEach, describe, expect, it } from 'vitest';
import { acknowledgement, assertLocalDatabase, authorize, productionTarget, safeError, targetFingerprint, type Authorization } from './authorization';

afterEach(() => { delete process.env.ARENA_CORRECTION_DATABASE_URL; delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; });
describe('arena production authorization', () => {
  const target = { host: 'reviewed.example', port: 6543, user: 'writer', database: 'postgres' };
  const binding = { targetFingerprint: targetFingerprint(target), beforeHash: 'b'.repeat(64), afterHash: 'c'.repeat(64), sourceProofSha256: 'd'.repeat(64) };
  const digest = 'a'.repeat(64);
  const auth = (): Authorization => ({ production: true, expectedManifestSha256: digest, expectedSourceProofSha256: binding.sourceProofSha256, expectedTargetFingerprint: binding.targetFingerprint, expectedBeforeHash: binding.beforeHash, acknowledgement: acknowledgement('apply') });
  it('binds manifest, proof, exact target, exact source state and literal direction', () => {
    expect(() => authorize(target, binding, 'apply', digest, auth())).not.toThrow();
    expect(() => authorize(target, binding, 'rollback', digest, { ...auth(), expectedBeforeHash: binding.afterHash, acknowledgement: acknowledgement('rollback') })).not.toThrow();
    for (const key of ['expectedManifestSha256', 'expectedSourceProofSha256', 'expectedTargetFingerprint', 'expectedBeforeHash', 'acknowledgement'] as const)
      expect(() => authorize(target, binding, 'apply', digest, { ...auth(), [key]: '' })).toThrow();
    expect(() => authorize({ ...target, user: 'other' }, binding, 'apply', digest, auth())).toThrow('target');
    expect(() => authorize(target, binding, 'rollback', digest, auth())).toThrow('expected-before');
  });
  it('refuses every URL override and alternate local target', () => {
    expect(() => assertLocalDatabase('postgres://test:test@127.0.0.1:55437/fullcourt_arena_correction')).not.toThrow();
    for (const url of ['postgres://t:t@localhost:55437/fullcourt_arena_correction', 'postgres://t:t@127.0.0.1:55436/fullcourt_arena_correction', 'postgres://t:t@127.0.0.1:55437/other', 'postgres://t:t@127.0.0.1:55437/fullcourt_arena_correction?host=evil', 'postgres://t:t@127.0.0.1:55437/fullcourt_arena_correction#fragment']) expect(() => assertLocalDatabase(url)).toThrow();
    for (const url of ['postgres://t:t@reviewed.example/postgres?sslmode=disable', 'postgres://t:t@reviewed.example/postgres?host=other', 'postgres://t:t@127.0.0.1/postgres']) expect(() => productionTarget(url)).toThrow();
  });
  it('redacts the new dedicated secret and encoded password', () => {
    process.env.ARENA_CORRECTION_DATABASE_URL = 'postgres://writer:s%40fe@reviewed.example/postgres';
    const result = safeError(new Error(`${process.env.ARENA_CORRECTION_DATABASE_URL} s%40fe s@fe`));
    expect(result).not.toContain('s@fe'); expect(result).not.toContain('s%40fe'); expect(result).not.toContain('postgres://');
  });
  it('refuses process-wide TLS verification bypass', () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    expect(() => authorize(target, binding, 'apply', digest, auth())).toThrow('TLS');
  });
});
