import {describe,it,expect} from 'vitest';
import {safeError} from './cli-errors';
describe('CLI error redaction',()=>{
  it('does not print connection URIs, encoded/decoded passwords, driver objects or stacks',()=>{
    const previous=process.env.OVERTIME_CORRECTION_DATABASE_URL;
    process.env.OVERTIME_CORRECTION_DATABASE_URL='postgres://reviewed:p%40ssw0rd@private.example:6543/postgres';
    try{
      const error=Object.assign(new Error('Failed postgres://reviewed:p%40ssw0rd@private.example:6543/postgres password p@ssw0rd encoded p%40ssw0rd'),{connection:{password:'separate-private-value'}});
      const output=safeError(error);expect(output).not.toMatch(/postgres:\/\/|p@ssw0rd|p%40ssw0rd|private\.example|separate-private-value| at /);expect(output).toContain('redacted');
      expect(safeError({message:'unknown-private-object',password:'private'})).toBe('Overtime correction failed');
    }finally{if(previous===undefined)delete process.env.OVERTIME_CORRECTION_DATABASE_URL;else process.env.OVERTIME_CORRECTION_DATABASE_URL=previous;}
  });
});
