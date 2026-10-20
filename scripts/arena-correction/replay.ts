import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { verifyOldCheckout } from './sources';
import type { SourceClosure, Snapshot, Row } from './types';

export function replayReleasedEngine(oldSources: SourceClosure, snapshot: Snapshot, computedAt: string, asOf: string) {
  verifyOldCheckout(oldSources);
  const directory = mkdtempSync(join(tmpdir(), 'fullcourt-arena-replay-'));
  try {
    const input = join(directory, 'input.json.gz'), output = join(directory, 'replay.json.gz');
    writeFileSync(input, gzipSync(JSON.stringify(snapshot)));
    const environment = { ...process.env };
    for (const key of ['DATABASE_URL', 'ARENA_CORRECTION_DATABASE_URL', 'ARENA_LOCAL_DATABASE_URL']) delete environment[key];
    execFileSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), '--tsconfig', resolve(oldSources.root, 'tsconfig.json'), resolve('scripts/arena-correction/replay-worker.ts'), oldSources.root, input, output, computedAt, asOf], { cwd: oldSources.root, env: environment, timeout: 300000, maxBuffer: 1024 * 1024 });
    const replay = JSON.parse(gunzipSync(readFileSync(output)).toString()) as { rows: Row[]; forecasts: Row[]; changed: { id: number; gameId: number; fields: string[] }[] };
    verifyOldCheckout(oldSources);
    return replay;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
