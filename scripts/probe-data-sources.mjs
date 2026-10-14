import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20250315';

export function classifyProbe(provider, result) {
  const required = provider === 'espn_node';
  const expectedBlock = (provider === 'nba_cdn' && result.status === 403)
    || (provider.startsWith('nba_stats_') && (result.status === 403 || result.timedOut));
  const healthy = result.status === 200 && (!required || (Number.isInteger(result.events) && result.events > 0));
  return {
    provider, required,
    status: healthy ? 'success' : expectedBlock ? 'expected_block' : required ? 'actionable_failure' : 'diagnostic_failure',
    http_status: Number.isInteger(result.status) ? result.status : null,
    timed_out: Boolean(result.timedOut),
    events: Number.isInteger(result.events) && result.events >= 0 ? result.events : null,
  };
}

export function summarizeProbes(results) {
  const actionable = results.filter(result => result.status === 'actionable_failure').map(result => result.provider);
  return { schema_version: 1, status: actionable.length ? 'failed' : 'success', actionable, providers: results };
}

async function curlProbe(url, ua = CHROME_UA) {
  try {
    const args = ['-sS', '-o', '/dev/null', '-m', '25', '-w', '%{http_code}', url];
    if (ua) args.push('-A', ua);
    const { stdout } = await execute('curl', args, { timeout: 30_000 });
    return { status: Number(stdout) };
  } catch (error) {
    return { timedOut: error.code === 28 || error.killed === true };
  }
}

async function nodeEspn() {
  try {
    const response = await fetch(ESPN, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return { status: response.status };
    const body = await response.json();
    return { status: response.status, events: Array.isArray(body?.events) ? body.events.length : null };
  } catch (error) {
    return { timedOut: error.name === 'TimeoutError' };
  }
}

async function main() {
  const probes = [
    ['nba_stats_schedule', () => curlProbe('https://stats.nba.com/stats/scheduleleaguev2?LeagueID=00&Season=2025-26')],
    ['nba_stats_games', () => curlProbe('https://stats.nba.com/stats/leaguegamefinder?PlayerOrTeam=T&LeagueID=00&Season=2024-25&SeasonType=Regular+Season')],
    ['nba_cdn', () => curlProbe('https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json')],
    ['espn_chrome', () => curlProbe(ESPN)],
    ['espn_default', () => curlProbe(ESPN, null)],
    ['espn_node', nodeEspn],
    ['basketball_reference', () => curlProbe('https://www.basketball-reference.com/leagues/NBA_2025_games-march.html')],
  ];
  const results = await Promise.all(probes.map(async ([name, probe]) => classifyProbe(name, await probe())));
  const summary = { ...summarizeProbes(results), checked_at: new Date().toISOString() };
  const encoded = JSON.stringify(summary, null, 2);
  writeFileSync(process.env.PROBE_SUMMARY_PATH || 'provider-summary.json', `${encoded}\n`);
  console.log(encoded);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Provider diagnostics\n\nStatus: ${summary.status}\n\n\`\`\`json\n${encoded}\n\`\`\`\n`);
  }
  if (summary.status === 'failed') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Provider probe could not complete'); process.exitCode = 1; });
}
