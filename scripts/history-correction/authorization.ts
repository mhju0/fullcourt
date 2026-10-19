import { createHash } from 'node:crypto';
import type { Manifest } from './core';
export interface ProductionAuthorization {
  production: true;
  expectedTargetFingerprint: string;
  expectedBeforeHash: string;
  acknowledgement: string;
}
export interface ConnectionTarget { host: string; port: number; user: string; database: string }
export const targetFingerprint = (target: ConnectionTarget): string => createHash('sha256').update(JSON.stringify({database:target.database,host:target.host,port:target.port,user:target.user})).digest('hex');
export const requiredAcknowledgement = (direction: 'apply'|'rollback'): string =>
  direction==='apply'?'APPLY_REVIEWED_HISTORICAL_CORRECTION':'ROLLBACK_REVIEWED_HISTORICAL_CORRECTION';
export function productionTarget(url: string): ConnectionTarget {
  const parsed=new URL(url);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.pathname.slice(1))throw new Error('Explicit PostgreSQL production connection required');
  if(parsed.search || parsed.hash)throw new Error('Production connection URL query/fragment overrides forbidden; TLS is enforced by the tool');
  if(['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('Production mode requires the reviewed nonlocal target');
  return {host:parsed.hostname,port:Number(parsed.port||5432),user:decodeURIComponent(parsed.username),database:decodeURIComponent(parsed.pathname.slice(1))};
}
export function validateProductionAuthorization(target: ConnectionTarget,manifest:Manifest,direction:'apply'|'rollback',authorization:ProductionAuthorization):void {
  if(authorization.production!==true || !/^[a-f0-9]{64}$/.test(authorization.expectedTargetFingerprint) || authorization.expectedTargetFingerprint!==targetFingerprint(target))throw new Error('Reviewed production target fingerprint mismatch');
  const expected=direction==='apply'?manifest.beforeHash:manifest.afterHash;
  if(authorization.expectedBeforeHash!==expected)throw new Error('Explicit production expected-before hash mismatch');
  if(authorization.acknowledgement!==requiredAcknowledgement(direction))throw new Error('Explicit reviewed production acknowledgement required');
}

export function requireReviewedManifestDigest(expected: string, observed: string): void {
  if(!/^[a-f0-9]{64}$/.test(expected))throw new Error('Production requires explicit --expected-manifest-sha from the frozen review/owner approval');
  if(expected!==observed)throw new Error('Reviewed production manifest SHA-256 mismatch');
}
