import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAudit } from '../summarize-dependency-audit.mjs';
const audit={metadata:{vulnerabilities:{info:0,low:4,moderate:44,high:22,critical:0}},advisories:{}};
test('known advisories remain a visible finding, not a failed audit execution',()=>assert.equal(summarizeAudit(audit,1).total,70));
test('a clean audit has zero advisories',()=>assert.equal(summarizeAudit({...audit,metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0}}},0).total,0));
test('network errors, malformed counts and inconsistent exit status fail',()=>{assert.throws(()=>summarizeAudit({error:{code:'ECONNRESET'}},1));assert.throws(()=>summarizeAudit(audit,0));assert.throws(()=>summarizeAudit(audit,2));assert.throws(()=>summarizeAudit({...audit,metadata:{vulnerabilities:{...audit.metadata.vulnerabilities,high:-1}}},1))});
