import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Snapshot } from './types';

async function main() {
  const [root, input, output, computedAt, asOf, ...extra] = process.argv.slice(2);
  if (!root || !input || !output || !computedAt || !asOf || extra.length) throw new Error('Old replay worker requires root, input, output, computed-at and as-of');
  const semantics = await import(pathToFileURL(resolve(root, 'scripts/overtime-correction/semantics.ts')).href);
  const snapshot = JSON.parse(gunzipSync(readFileSync(input)).toString()) as Snapshot;
  const result = semantics.recomputeFatigue(snapshot, computedAt);
  writeFileSync(output, gzipSync(JSON.stringify({ ...result, forecasts: semantics.rebuildForecasts(snapshot, asOf, computedAt) })));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Old-source replay failed'); process.exitCode = 1; });
