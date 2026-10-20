import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';
import { applyManifest, assertManifestBytes, capture, hash, verifyManifest } from './core';
import { assertLocalDatabase, authorize, productionTarget, safeError, type Authorization } from './authorization';

export function parseFlags(flags: string[]): Map<string, string> {
  const values = new Map<string, string>();
  const allowed = new Set(['--production', '--expected-manifest-sha', '--expected-source-proof-sha', '--expected-target', '--expected-before', '--ack']);
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (!allowed.has(flag) || values.has(flag)) throw new Error('Unknown/duplicate arena guard flag');
    if (flag === '--production') values.set(flag, 'true');
    else {
      const value = flags[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing arena guard value');
      values.set(flag, value);
    }
  }
  return values;
}
async function main() {
  const [action, filename, ...flags] = process.argv.slice(2);
  if (!['apply', 'rollback', 'check'].includes(action) || !filename) throw new Error('Usage: tsx scripts/arena-correction/run.ts apply|rollback|check MANIFEST.json --expected-manifest-sha SHA [--production --expected-source-proof-sha SHA --expected-target SHA --expected-before SHA --ack LITERAL]');
  const values = parseFlags(flags), production = values.has('--production');
  if (action === 'check' && production) throw new Error('Arena check is local/read-only; production writes require explicit reviewed bindings');
  if (!production && [...values.keys()].some(key => key !== '--expected-manifest-sha')) throw new Error('Production guards require --production');
  const digest = values.get('--expected-manifest-sha') ?? '';
  const bytes = readFileSync(filename), manifest = assertManifestBytes(bytes, digest);
  if (JSON.stringify(manifest) !== bytes.toString()) throw new Error('Arena manifest must retain its exact generated compact bytes');
  const direction = action as 'apply' | 'rollback';
  if (!production) config({ path: '.env.local', quiet: true });
  const url = production ? process.env.ARENA_CORRECTION_DATABASE_URL ?? '' : process.env.ARENA_LOCAL_DATABASE_URL ?? '';
  const authorization: Authorization | undefined = production ? {
    production: true, expectedManifestSha256: digest,
    expectedSourceProofSha256: values.get('--expected-source-proof-sha') ?? '',
    expectedTargetFingerprint: values.get('--expected-target') ?? '',
    expectedBeforeHash: values.get('--expected-before') ?? '', acknowledgement: values.get('--ack') ?? '',
  } : undefined;
  if (authorization) authorize(productionTarget(url), manifest, direction, digest, authorization);
  else assertLocalDatabase(url);
  const sql = postgres(url, { max: 1, prepare: false, ...(production ? { ssl: 'verify-full' as const } : {}) });
  try {
    if (action === 'check') {
      verifyManifest(manifest);
      const snapshot = await sql.begin(async tx => {
        await tx.unsafe('set transaction isolation level repeatable read read only');
        await tx`select set_config('TimeZone',${manifest.databaseTimeZone},true)`;
        return capture(tx);
      });
      const observed = hash(snapshot);
      if (observed !== manifest.beforeHash && observed !== manifest.afterHash) throw new Error('Arena frozen six-table state drift; read-only check performed no writes');
      console.log(JSON.stringify({ state: observed === manifest.beforeHash ? 'before' : 'after', hash: observed, manifestSha256: digest, sourceProofSha256: manifest.sourceProofSha256 }));
    } else console.log(await applyManifest(sql, manifest, direction, digest, undefined, authorization));
  } finally {
    await sql.end();
  }
}
main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
