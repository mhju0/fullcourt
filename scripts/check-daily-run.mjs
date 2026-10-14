import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HOUR = 3600000;
const DEADLINE_HOURS = 6;
function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Missing or invalid execution timestamp');
  return parsed;
}
function selectDueRun(payload, nowValue) {
  if (!Array.isArray(payload?.workflow_runs)) throw new Error('Invalid Actions response');
  const now = timestamp(nowValue);
  const due = new Date(now - DEADLINE_HOURS * HOUR);
  due.setUTCHours(21, 17, 0, 0);
  if (+due > now - DEADLINE_HOURS * HOUR) due.setUTCDate(due.getUTCDate() - 1);
  const expected = +due;
  const deadline = expected + DEADLINE_HOURS * HOUR;
  const candidates = payload.workflow_runs.filter(r => r.event === 'schedule' && r.head_branch === 'main' && timestamp(r.created_at) >= expected && timestamp(r.created_at) < expected + 24 * HOUR);
  candidates.sort((a,b) => timestamp(a.created_at) - timestamp(b.created_at));
  const run = candidates[0];
  return {run, now, deadline, due, expected};
}
export function checkDailyRun(payload, jobs, nowValue) {
  if (!Array.isArray(jobs)) throw new Error('Invalid Actions jobs response');
  const {run, now, deadline, due, expected} = selectDueRun(payload, nowValue);
  const result = {expected:due.toISOString(),deadline:new Date(deadline).toISOString(),checkedAt:new Date(now).toISOString(),status:'missing'};
  if (!run) return result;
  if (!Number.isSafeInteger(run.id) || run.id < 1) throw new Error('Invalid run identifier');
  Object.assign(result,{runId:run.id,createdAt:new Date(timestamp(run.created_at)).toISOString(),startedAt:run.run_started_at ? new Date(timestamp(run.run_started_at)).toISOString() : null});
  if (run.status !== 'completed') return {...result,status:'unfinished'};
  if (run.conclusion !== 'success') return {...result,status:'failed'};
  if (!jobs.length || jobs.some(j => j.conclusion !== 'success')) throw new Error('Successful run lacks successful job completion evidence');
  const completed = Math.max(...jobs.map(j => timestamp(j.completed_at)));
  if (completed > now || completed < timestamp(run.created_at)) throw new Error('Inconsistent completion timestamp');
  return {...result,completedAt:new Date(completed).toISOString(),delayMinutes:Math.round((timestamp(run.created_at)-expected)/60000),status:completed > deadline ? 'late':'success'};
}
async function getJson(url, token) {
  const response = await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if (!response.ok) throw new Error(`Actions API returned HTTP ${response.status}`);
  return response.json();
}
async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (repo !== 'mhju0/fullcourt' || !token) throw new Error('Expected FullCourt repository and scoped Actions token');
  const root = `https://api.github.com/repos/${repo}/actions`;
  const payload = await getJson(`${root}/workflows/daily-update.yml/runs?branch=main&event=schedule&per_page=20`,token);
  const now = new Date().toISOString();
  // Select the due run before fetching its completed jobs; metadata alone is not completion proof.
  const selection = selectDueRun(payload,now);
  let result;
  if (selection.run) {
    if (!Number.isSafeInteger(selection.run.id) || selection.run.id < 1) throw new Error('Invalid run identifier');
    const jobs = await getJson(`${root}/runs/${selection.run.id}/jobs?per_page=100`,token);
    if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error('Incomplete Actions jobs response');
    result = checkDailyRun(payload,jobs.jobs,now);
  } else { result = checkDailyRun(payload,[],now); }
  console.log(JSON.stringify(result));
  await writeFile('daily-watchdog.json',JSON.stringify(result,null,2)+'\n');
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,`## Daily scheduled-run monitor\n\nStatus: **${result.status}**\n\nExpected: ${result.expected}\n\nCompletion deadline: ${result.deadline}\n\nThis checks workflow completion, not database freshness. It shares GitHub's scheduler and does not prove email delivery.\n`);
  if (result.status !== 'success') { console.error(`::error::Daily scheduled run is ${result.status}`);process.exitCode=1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('::error::Daily monitoring failed to obtain valid completion evidence');process.exitCode=1;});
