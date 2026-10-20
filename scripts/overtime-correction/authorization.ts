import type postgres from 'postgres';
import { targetFingerprint, productionTarget, requireReviewedManifestDigest, type ConnectionTarget } from '../history-correction/authorization';
export { targetFingerprint, productionTarget, requireReviewedManifestDigest };
export const LOCAL_TARGET={host:'127.0.0.1',port:55436,database:'fullcourt_overtime'} as const;
export interface Authorization {production:true;expectedTargetFingerprint:string;expectedBeforeHash:string;acknowledgement:string}
export const requiredAcknowledgement=(direction:'apply'|'rollback'):string=>direction==='apply'?'APPLY_REVIEWED_OVERTIME_CORRECTION':'ROLLBACK_REVIEWED_OVERTIME_CORRECTION';
export function assertLocalDatabase(url:string):void {
  const u=new URL(url);
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==LOCAL_TARGET.host||u.port!==String(LOCAL_TARGET.port)||u.pathname!==`/${LOCAL_TARGET.database}`||u.search||u.hash)throw new Error('OT tooling requires exactly 127.0.0.1:55436/fullcourt_overtime without URL overrides');
}
export function connectionTarget(sql:postgres.Sql):ConnectionTarget {
  if(sql.options.host.length!==1||sql.options.port.length!==1)throw new Error('Single explicit database target required');
  return {host:sql.options.host[0],port:sql.options.port[0],user:sql.options.user,database:sql.options.database};
}
export function authorize(target:ConnectionTarget,binding:{targetFingerprint:string;beforeHash:string;afterHash:string},direction:'apply'|'rollback',authorization:Authorization):void {
  if(authorization.production!==true||authorization.expectedTargetFingerprint!==targetFingerprint(target)||authorization.expectedTargetFingerprint!==binding.targetFingerprint)throw new Error('Reviewed OT production target mismatch');
  if(authorization.expectedBeforeHash!==(direction==='apply'?binding.beforeHash:binding.afterHash))throw new Error('Reviewed OT expected-before hash mismatch');
  if(authorization.acknowledgement!==requiredAcknowledgement(direction))throw new Error('Literal reviewed OT acknowledgement required');
}
