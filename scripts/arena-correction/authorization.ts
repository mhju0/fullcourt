import type postgres from 'postgres';
import { productionTarget, targetFingerprint, type ConnectionTarget } from '../history-correction/authorization';
export { productionTarget, targetFingerprint };

export const LOCAL_TARGET = { host: '127.0.0.1', port: 55437, database: 'fullcourt_arena_correction' } as const;
export interface Authorization {
  production: true;
  expectedManifestSha256: string;
  expectedSourceProofSha256: string;
  expectedTargetFingerprint: string;
  expectedBeforeHash: string;
  acknowledgement: string;
}
export const acknowledgement = (direction: 'apply' | 'rollback') => direction === 'apply'
  ? 'APPLY_REVIEWED_ARENA_CORRECTION' : 'ROLLBACK_REVIEWED_ARENA_CORRECTION';
export function assertLocalDatabase(url: string): void {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.hostname !== LOCAL_TARGET.host || parsed.port !== String(LOCAL_TARGET.port) || parsed.pathname !== `/${LOCAL_TARGET.database}` || parsed.search || parsed.hash)
    throw new Error('Arena tools require exactly 127.0.0.1:55437/fullcourt_arena_correction without URL overrides');
}
export function connectionTarget(sql: postgres.Sql): ConnectionTarget {
  if (sql.options.host.length !== 1 || sql.options.port.length !== 1)
    throw new Error('Single explicit database target required');
  return { host: sql.options.host[0], port: sql.options.port[0], database: sql.options.database, user: sql.options.user };
}
export function authorize(target: ConnectionTarget, binding: { targetFingerprint: string; beforeHash: string; afterHash: string; sourceProofSha256: string }, direction: 'apply' | 'rollback', digest: string, auth: Authorization): void {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Production TLS certificate verification cannot be disabled');
  for (const value of [auth.expectedManifestSha256, auth.expectedSourceProofSha256, auth.expectedTargetFingerprint, auth.expectedBeforeHash])
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('All four externally reviewed SHA-256 production bindings are required');
  if (auth.production !== true || auth.expectedManifestSha256 !== digest) throw new Error('Reviewed arena manifest digest mismatch');
  if (auth.expectedSourceProofSha256 !== binding.sourceProofSha256) throw new Error('Reviewed arena source proof digest mismatch');
  if (auth.expectedTargetFingerprint !== targetFingerprint(target) || auth.expectedTargetFingerprint !== binding.targetFingerprint) throw new Error('Reviewed arena target fingerprint mismatch');
  if (auth.expectedBeforeHash !== (direction === 'apply' ? binding.beforeHash : binding.afterHash)) throw new Error('Reviewed arena expected-before hash mismatch');
  if (auth.acknowledgement !== acknowledgement(direction)) throw new Error('Literal reviewed arena acknowledgement required');
}
export function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : 'Arena correction failed';
  for (const value of [process.env.ARENA_CORRECTION_DATABASE_URL, process.env.ARENA_LOCAL_DATABASE_URL, process.env.DATABASE_URL]) {
    if (!value) continue;
    message = message.replaceAll(value, '[database URL redacted]');
    try {
      const password = new URL(value).password;
      if (password) message = message.replaceAll(password, '[password redacted]').replaceAll(decodeURIComponent(password), '[password redacted]');
    } catch { /* Invalid connection text is already redacted. */ }
  }
  return message.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[database URL redacted]');
}
