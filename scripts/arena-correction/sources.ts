import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, dirname, extname, sep } from 'node:path';
import ts from 'typescript';
import { hash } from '../history-correction/core';
import type { FileBinding, SourceClosure, SourceProof } from './types';

export const BASELINE_COMMIT = '65605ae972c2df0391d1eee0a9d246dafe29079a';
export const BASELINE_HASH = 'ef953faeb133a329a636653ed017091da17c27639adbb44bf2d8bd4eedf8159b';
export const ENGINE_ENTRY = 'scripts/overtime-correction/semantics.ts';
const trustedDigests = {
  independentReplay: '5c920d4ce4319b51b8a7df52f48d83ed4f994233a98efe7d9bda83af9168c240',
  followThrough: '10c3e3b7998fdf9cf579f55f0881018babde2656006f5eee8ef2fd8c1be89d4a',
  baselineCapture: '9355b8b6162bcb5905c3e3712407d561cbd38a0e44a27f6dda7eb521cf4c1906',
};
export const geometryPaths = new Set([
  'src/data/arena-history.json', 'src/lib/arena-history.ts',
  'src/lib/team-era-coordinates.ts', 'src/data/fixture-venue-corrections.json',
  'src/lib/physical-venue.ts',
]);
export const bytesHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export function validateFile(binding: FileBinding): Buffer {
  if (!binding || !/^[a-f0-9]{64}$/.test(binding.sha256) || bytesHash(readFileSync(binding.path)) !== binding.sha256)
    throw new Error('Frozen evidence/source file digest mismatch');
  return readFileSync(binding.path);
}
export function collectSources(root: string, entries: string[]): SourceClosure {
  root = resolve(root);
  const files: Record<string, string> = {};
  const visit = (name: string) => {
    const absolute = resolve(root, name);
    if (!absolute.startsWith(root + sep)) throw new Error('Local source dependency escaped its root');
    name = relative(root, absolute);
    if (name in files) return;
    const bytes = readFileSync(absolute);
    files[name] = bytesHash(bytes);
    if (!['.ts', '.tsx', '.js', '.mjs'].includes(extname(name))) return;
    for (const imported of ts.preProcessFile(bytes.toString(), true, true).importedFiles) {
      const specifier = imported.fileName;
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const base = specifier.startsWith('@/') ? resolve(root, 'src', specifier.slice(2)) : resolve(dirname(absolute), specifier);
      const found = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, resolve(base, 'index.ts')].find(file => existsSync(file) && statSync(file).isFile());
      if (!found) throw new Error(`Unresolved local computation source ${name}: ${specifier}`);
      visit(relative(root, found));
    }
  };
  for (const entry of [...entries, 'package.json', 'pnpm-lock.yaml', 'tsconfig.json']) visit(entry);
  return { root, entry: entries.join(','), files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
}
export function verifyClosure(closure: SourceClosure, entries: string[]): void {
  if (hash(collectSources(closure.root, entries)) !== hash(closure)) throw new Error('Frozen source closure changed or omitted an imported dependency');
}
export function verifyOldCheckout(closure: SourceClosure): void {
  verifyClosure(closure, [ENGINE_ENTRY]);
  if (execFileSync('git', ['-C', closure.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== BASELINE_COMMIT || execFileSync('git', ['-C', closure.root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim())
    throw new Error('Old engine must remain a clean immutable v1.0.7 checkout');
  for (const [name, digest] of Object.entries(closure.files))
    if (bytesHash(execFileSync('git', ['-C', closure.root, 'show', `${BASELINE_COMMIT}:${name}`], { maxBuffer: 32 * 1024 * 1024 })) !== digest)
      throw new Error(`Old engine file is not the released source: ${name}`);
}
function tokens(text: string): string {
  const file = ts.createSourceFile('protected.ts', text, ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(file);
    if (children.length) children.forEach(visit);
    else if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken && node.kind !== ts.SyntaxKind.EndOfFileToken)
      values.push(`${node.kind}:${node.getText(file)}`);
  };
  visit(file);
  return hash(values);
}
export const approvedCoverageHelper = `export function summarizeHistoricalEvidenceCoverage(rows: readonly HistoricalGameEvidenceRow[]): { games: number; latestEvidenceDate: string | null; } {
  let latestEvidenceDate: string | null = null;
  for (const row of rows) {
    if (latestEvidenceDate === null || row.date > latestEvidenceDate) latestEvidenceDate = row.date;
  }
  return { games: rows.length, latestEvidenceDate };
}`;
function onlyApprovedCoverageAddition(before: string, after: string): boolean {
  const file = ts.createSourceFile('rest-advantage-evidence.ts', after, ts.ScriptTarget.Latest, true);
  const additions = file.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'summarizeHistoricalEvidenceCoverage');
  if (additions.length !== 1 || tokens(additions[0].getText(file)) !== tokens(approvedCoverageHelper)) return false;
  return tokens(before) === tokens(file.statements.filter(statement => statement !== additions[0]).map(statement => statement.getText(file)).join('\n'));
}
export const approvedPhysicalImport = 'import { eraCoordinates, requiresFixtureVenueCorrection } from "./team-era-coordinates";';
export const approvedPhysicalGuard = `if (requiresFixtureVenueCorrection(homeTeam.abbreviation, date)) {
  throw new Error("Mixed-arena home game is missing its physical venue correction");
}`;
function onlyApprovedPhysicalGuard(before: string, after: string): boolean {
  const file = ts.createSourceFile('physical-venue.ts', after, ts.ScriptTarget.Latest, true);
  const imports = file.statements.filter(statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.getText(file) === '"./team-era-coordinates"');
  if (imports.length !== 1 || tokens(imports[0].getText(file)) !== tokens(approvedPhysicalImport)) return false;
  const guards: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && tokens(node.getText(file)) === tokens(approvedPhysicalGuard)) guards.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (guards.length !== 1 || !ts.isBlock(guards[0].parent)) return false;
  const statements = guards[0].parent.statements, position = statements.indexOf(guards[0] as ts.Statement);
  if (!statements[position + 1] || tokens(statements[position + 1].getText(file)) !== tokens('const neutral = input.neutralSite === true;')) return false;
  const replacements = [
    { start: imports[0].getStart(file), end: imports[0].end, text: 'import { eraCoordinates } from "./team-era-coordinates";' },
    { start: guards[0].getStart(file), end: guards[0].end, text: '' },
  ].sort((a, b) => b.start - a.start);
  let stripped = after;
  for (const replacement of replacements) stripped = stripped.slice(0, replacement.start) + replacement.text + stripped.slice(replacement.end);
  return tokens(before) === tokens(stripped);
}
export function verifyGeometryOnly(oldSources: SourceClosure, newSources: SourceClosure): void {
  const names = new Set([...Object.keys(oldSources.files), ...Object.keys(newSources.files)]);
  for (const name of names) {
    if (oldSources.files[name] === newSources.files[name]) continue;
    if (geometryPaths.has(name) && name !== 'src/lib/physical-venue.ts') continue;
    if (!oldSources.files[name] || !newSources.files[name]) throw new Error(`Unapproved engine dependency addition/removal: ${name}`);
    const before = readFileSync(resolve(oldSources.root, name), 'utf8'), after = readFileSync(resolve(newSources.root, name), 'utf8');
    if (name === 'src/lib/physical-venue.ts' && onlyApprovedPhysicalGuard(before, after)) continue;
    if (name === 'package.json') {
      const a = JSON.parse(before), b = JSON.parse(after); delete a.version; delete b.version;
      if (hash(a) === hash(b)) continue;
    }
    if (name !== 'src/lib/fatigue.ts' && ['.ts', '.tsx'].includes(extname(name)) && tokens(before) === tokens(after)) continue;
    if (name === 'src/lib/rest-advantage-evidence.ts' && onlyApprovedCoverageAddition(before, after)) continue;
    throw new Error(`Arena-only transition changed protected engine source: ${name}`);
  }
}
export function loadSourceProof(binding: FileBinding): SourceProof {
  const proof = JSON.parse(validateFile(binding).toString()) as SourceProof;
  if (proof.kind !== 'arena-source-proof' || proof.version !== 1 || proof.baselineCommit !== BASELINE_COMMIT || proof.baselineSnapshotCanonicalHash !== BASELINE_HASH || !proof.geometrySources || typeof proof.geometrySources !== 'object' || Array.isArray(proof.geometrySources) || Object.values(proof.geometrySources).some(value => !/^[a-f0-9]{64}$/.test(value)) || !Array.isArray(proof.evidence) || !proof.evidence.length)
    throw new Error('Invalid arena source proof/baseline anchor');
  for (const field of ['independentReplay', 'followThrough', 'baselineCapture'] as const) {
    if (proof[field]?.sha256 !== trustedDigests[field]) throw new Error('Independent v1.0.7 baseline evidence differs from the trusted receipt');
    validateFile(proof[field]);
  }
  const replay = JSON.parse(validateFile(proof.independentReplay).toString());
  const capture = JSON.parse(validateFile(proof.baselineCapture).toString());
  if (replay.mismatches !== 0 || replay.rows !== 103398 || replay.fieldComparisons !== 1757766 || capture.canonical_hash !== BASELINE_HASH)
    throw new Error('Independent baseline replay/population mismatch');
  for (const evidence of proof.evidence) validateFile(evidence);
  return proof;
}
export const toolEntries = ['scripts/arena-correction/core.ts', 'scripts/arena-correction/prepare.ts', 'scripts/arena-correction/run.ts', 'scripts/arena-correction/replay-worker.ts'];
