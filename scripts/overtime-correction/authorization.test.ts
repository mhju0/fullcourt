import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertLocalDatabase,authorize,productionTarget,targetFingerprint,requiredAcknowledgement} from './authorization';
describe('separate OT production approval boundary',()=>{
  it('admits only the new exact shadow and refuses every URL override',()=>{
    expect(()=>assertLocalDatabase('postgres://overtime_owner@127.0.0.1:55436/fullcourt_overtime')).not.toThrow();
    for(const url of ['postgres://u@127.0.0.1:55434/fullcourt_recalculation','postgres://u@localhost:55436/fullcourt_overtime','postgres://u@127.0.0.1:55436/postgres','postgres://u@127.0.0.1:55436/fullcourt_overtime?host=remote','postgres://u@127.0.0.1:55436/fullcourt_overtime?sslmode=disable','postgres://u@production/postgres'])expect(()=>assertLocalDatabase(url)).toThrow();
  });
  it('binds the independently supplied target, from-state and direction-specific acknowledgement',()=>{
    const target=productionTarget('postgres://reviewed:private@reviewed.invalid:6543/postgres'),fingerprint=targetFingerprint(target);const binding={targetFingerprint:fingerprint,beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64)};
    const valid={production:true as const,expectedTargetFingerprint:fingerprint,expectedBeforeHash:binding.beforeHash,acknowledgement:requiredAcknowledgement('apply')};
    expect(()=>authorize(target,binding,'apply',valid)).not.toThrow();
    for(const bad of [{...valid,expectedTargetFingerprint:'0'.repeat(64)},{...valid,expectedBeforeHash:binding.afterHash},{...valid,acknowledgement:requiredAcknowledgement('rollback')}])expect(()=>authorize(target,binding,'apply',bad)).toThrow();
    expect(()=>authorize(target,{...binding,targetFingerprint:'0'.repeat(64)},'apply',valid)).toThrow();
  });
  it('rejects missing/different external file digests before JSON parsing or network access',()=>{
    const directory=mkdtempSync(join(tmpdir(),'fullcourt-ot-cli-'));const path=join(directory,'candidate.json');writeFileSync(path,'invalid JSON');
    try{for(const sha of [undefined,'bad','0'.repeat(64)]){
      const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/overtime-correction/run.ts','apply',path,'--production',...(sha?['--expected-manifest-sha',sha]:[])],{encoding:'utf8',timeout:10000,env:{...process.env,OVERTIME_CORRECTION_DATABASE_URL:'postgres://test@must-not-connect.invalid/postgres'}});
      expect(result.status).toBe(1);expect(result.stderr).toMatch(/expected-manifest-sha|manifest SHA-256 mismatch/);expect(result.stderr).not.toMatch(/SyntaxError|ENOTFOUND|ECONNREFUSED/);
    }}finally{rmSync(directory,{recursive:true,force:true});}
  });
});
