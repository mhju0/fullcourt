import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function summarizeAudit(payload, exitCode) {
  if (![0,1].includes(exitCode) || payload?.error || !payload?.metadata?.vulnerabilities) throw new Error('Dependency audit did not complete');
  const counts={};
  for (const level of ['info','low','moderate','high','critical']) {
    const value=payload.metadata.vulnerabilities[level];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid advisory counts');
    counts[level]=value;
  }
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  if ((total===0)!==(exitCode===0)) throw new Error('Audit result and exit status disagree');
  return {scope:'all dependencies',counts,total};
}
async function main() {
  const result=summarizeAudit(JSON.parse(await readFile('dependency-audit.json','utf8')),Number(process.env.AUDIT_EXIT_CODE));
  const text=`## Full dependency audit\n\nCommit: ${process.env.GITHUB_SHA ?? 'local'}\n\npnpm: 11.8.0 (packageManager)\n\nScope: production and development dependencies\n\nAdvisories: ${result.total}; critical ${result.counts.critical}, high ${result.counts.high}, moderate ${result.counts.moderate}, low ${result.counts.low}.\n\nFindings are advisory here; the production audit remains a required gate. Raw JSON is retained separately.\n`;
  console.log(JSON.stringify(result));
  if(result.total) console.log(`::warning::Full dependency audit found ${result.total} advisories`);
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,text);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('::error::Dependency audit failed to produce a valid result');process.exitCode=1});
