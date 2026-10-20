import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { approvedCoverageHelper, approvedPhysicalGuard, approvedPhysicalImport, BASELINE_COMMIT, bytesHash, collectSources, verifyClosure, verifyGeometryOnly } from './sources';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() {
  const directory = mkdtempSync(join(tmpdir(), 'arena-sources-')); roots.push(directory);
  for (const path of ['src/lib', 'src/data', 'scripts']) mkdirSync(join(directory, path), { recursive: true });
  for (const [name, text] of Object.entries({ 'package.json': '{"version":"1"}', 'pnpm-lock.yaml': 'locked', 'tsconfig.json': '{}' })) writeFileSync(join(directory, name), text);
  return directory;
}
describe('arena computation source closure', () => {
  it('discovers relative, alias, JSON, re-export and dynamic-import dependencies and rejects drift/omissions', () => {
    const directory = root();
    writeFileSync(join(directory, 'scripts/entry.ts'), "import { value } from '@/lib/value'; export { value }; import('../src/lib/dynamic');");
    writeFileSync(join(directory, 'src/lib/value.ts'), "import values from '../data/values.json'; export const value = values.n;");
    writeFileSync(join(directory, 'src/lib/dynamic.ts'), 'export const flag = true;');
    writeFileSync(join(directory, 'src/data/values.json'), '{"n":1}');
    const closure = collectSources(directory, ['scripts/entry.ts']);
    expect(Object.keys(closure.files)).toEqual(expect.arrayContaining(['src/lib/dynamic.ts', 'src/lib/value.ts', 'src/data/values.json', 'pnpm-lock.yaml', 'tsconfig.json']));
    verifyClosure(closure, ['scripts/entry.ts']);
    const omitted = structuredClone(closure); delete omitted.files['src/lib/dynamic.ts'];
    expect(() => verifyClosure(omitted, ['scripts/entry.ts'])).toThrow('closure');
    writeFileSync(join(directory, 'src/data/values.json'), '{"n":2}');
    expect(() => verifyClosure(closure, ['scripts/entry.ts'])).toThrow('closure');
  });
  it('allows only approved geometry, nonsemantic comments and package-version changes; fatigue source is exact', () => {
    const a = root(), b = root();
    const files = { 'src/lib/fatigue.ts': 'export const coefficient=1;', 'src/lib/other.ts': 'export const policy=1;', 'src/lib/team-era-coordinates.ts': 'export const lat=1;', 'package.json': '{"version":"1","dependencies":{"x":"1"}}' };
    for (const directory of [a, b]) for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), value);
    const closure = (directory: string) => ({ root: directory, entry: '', files: Object.fromEntries(Object.keys(files).map(name => [name, bytesHash(requireText(directory, name))])) });
    writeFileSync(join(b, 'src/lib/other.ts'), '// corrected count\nexport const policy=1;');
    writeFileSync(join(b, 'src/lib/team-era-coordinates.ts'), 'export const lat=2;');
    writeFileSync(join(b, 'package.json'), '{"version":"2","dependencies":{"x":"1"}}');
    expect(() => verifyGeometryOnly(closure(a), closure(b))).not.toThrow();
    writeFileSync(join(b, 'src/lib/fatigue.ts'), '// even a comment is prohibited here\nexport const coefficient=1;');
    expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('fatigue.ts');
    writeFileSync(join(b, 'src/lib/fatigue.ts'), files['src/lib/fatigue.ts']);
    writeFileSync(join(b, 'src/lib/other.ts'), 'export const policy=2;');
    expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('other.ts');
  });
  it('permits the exact independent coverage helper while protecting every existing prediction-rule token', () => {
    const a = root(), b = root(), name = 'src/lib/rest-advantage-evidence.ts';
    const original = 'export function classifyRestAdvantage(x:number) { return x; }';
    writeFileSync(join(a, name), original);
    writeFileSync(join(b, name), original + '\n' + approvedCoverageHelper);
    const closure = (directory: string) => ({ root: directory, entry: '', files: { [name]: bytesHash(requireText(directory, name)) } });
    expect(() => verifyGeometryOnly(closure(a), closure(b))).not.toThrow();
    writeFileSync(join(b, name), original.replace('return x', 'return x+1') + '\n' + approvedCoverageHelper);
    expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('protected engine');
    writeFileSync(join(b, name), original + '\n' + approvedCoverageHelper.replace('rows.length', 'rows.length+1'));
    expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('protected engine');
  });
  it('accepts the actual released module plus approved helper/comments, including template tails, while rejecting existing-rule changes', () => {
    const a = root(), b = root(), name = 'src/lib/rest-advantage-evidence.ts';
    const released = execFileSync('git', ['show', `${BASELINE_COMMIT}:${name}`], { encoding: 'utf8' });
    const candidate = readFileSync(name, 'utf8');
    writeFileSync(join(a, name), released);
    writeFileSync(join(b, name), candidate);
    const closure = (directory: string) => ({ root: directory, entry: '', files: { [name]: bytesHash(requireText(directory, name)) } });
    expect(() => verifyGeometryOnly(closure(a), closure(b))).not.toThrow();
    const changes = [
      candidate.replace('Math.abs(differential) < NEUTRAL_REST_ADVANTAGE_THRESHOLD', 'Math.abs(differential) <= NEUTRAL_REST_ADVANTAGE_THRESHOLD'),
      candidate.replace('winPct(overallWins, called.length)', 'winPct(overallWins + 1, called.length)'),
      candidate.replace('`${range.min}–${range.max}`', '`${range.min}–${range.min}`'),
      candidate.replace('return { games: rows.length, latestEvidenceDate };', 'return { games: rows.length + 1, latestEvidenceDate };'),
    ];
    for (const changed of changes) {
      expect(changed).not.toBe(candidate);
      writeFileSync(join(b, name), changed);
      expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('protected engine');
    }
  });
  it('allows only the exact mixed-arena guard immediately before neutral fallback, retaining the prior physical algorithm', () => {
    const a = root(), b = root(), name = 'src/lib/physical-venue.ts';
    const oldImport = 'import { eraCoordinates } from "./team-era-coordinates";';
    const body = 'export function resolvePhysicalVenue(input:any) { const homeTeam=input.homeTeam,date=input.date; const neutral = input.neutralSite === true; return neutral; }';
    const original = oldImport + body;
    const candidate = approvedPhysicalImport + body.replace('const neutral', approvedPhysicalGuard + ' const neutral');
    const closure = (directory: string) => ({ root: directory, entry: '', files: { [name]: bytesHash(requireText(directory, name)) } });
    writeFileSync(join(a, name), original);
    writeFileSync(join(b, name), candidate);
    expect(() => verifyGeometryOnly(closure(a), closure(b))).not.toThrow();
    for (const changed of [candidate.replace('return neutral', 'return !neutral'), candidate.replace('throw new Error', 'console.error'), approvedPhysicalImport + body.replace('return neutral;', 'return neutral;' + approvedPhysicalGuard)]) {
      writeFileSync(join(b, name), changed);
      expect(() => verifyGeometryOnly(closure(a), closure(b))).toThrow('protected engine');
    }
  });
});

import { readFileSync } from 'node:fs';
function requireText(directory: string, name: string) { return readFileSync(join(directory, name)); }
