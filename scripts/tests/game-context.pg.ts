import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { integrityTestUrl } from "./integrity-test-url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const url = integrityTestUrl();
const schema = `fc_context_${process.pid}`;
const admin = postgres(url, { max: 1 });
const db = postgres(url, { max: 1, connection: { search_path: schema } });
const tip = "2099-10-21T00:00:00Z";
const date = "2099-10-20";
const preload = `
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.origin !== 'https://site.api.espn.com'
      || url.pathname !== '/apis/site/v2/sports/basketball/nba/scoreboard'
      || url.searchParams.get('dates') !== '${date.replaceAll("-", "")}') {
      throw new Error('Unexpected provider request');
    }
    return new Response(process.env.GAME_CONTEXT_TEST_PAYLOAD);
  };
`;

type Input = { ot: number | null; tip: string | null; neutral: boolean; city: string | null };
function payload(input: Input) {
  return { events: [{ id: "context-contract", date: tip, competitions: [{
    date: input.tip, neutralSite: input.neutral,
    venue: { address: { city: input.city } },
    status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
    competitors: [
      { homeAway: "home", team: { abbreviation: "BOS" } },
      { homeAway: "away", team: { abbreviation: "NYK" } },
    ].map(team => ({ ...team,
      ...(input.ot === null ? {} : { linescores: Array.from({ length: 4 + input.ot }, () => ({ value: 20 })) }),
    })),
  }] }] };
}

async function snapshot() {
  const [row] = await db<{ version: string; ot: number; tip: Date | null; neutral: boolean; city: string | null }[]>`
    select xmin::text as version, overtime_periods as ot,
    tip_off_utc as tip, neutral_site as neutral, neutral_venue_city as city from games where id = 7`;
  return { ...row, tip: row.tip?.toISOString() ?? null };
}

async function main() {
  mkdirSync(join(root, ".local"), { recursive: true });
  const scratch = mkdtempSync(join(root, ".local/context-contract-"));
  const scoped = new URL(url);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  let created = false;
  try {
    await admin.unsafe(`create schema ${schema}`);
    created = true;
    await db.unsafe(readFileSync(join(root, "scripts/tests/ci-integrity-bootstrap.sql"), "utf8"));
    await db`insert into games(id, external_id, date, season, home_team_id, away_team_id,
      status, overtime_periods, tip_off_utc) values(7, 'context-contract', ${date}, '2099-00', 1, 3,
      'final', 2, ${tip})`;
    const cases: Array<{ label: string; input: Input; writes: number; storedOt: number }> = [
      { label: "identical context", input: { ot: 2, tip, neutral: false, city: null }, writes: 0, storedOt: 2 },
      { label: "unknown incoming OT preserves stored OT", input: { ot: null, tip, neutral: false, city: null }, writes: 0, storedOt: 2 },
      { label: "changed OT", input: { ot: 3, tip, neutral: false, city: null }, writes: 1, storedOt: 3 },
      { label: "same tip instant with another offset", input: { ot: 3, tip: "2099-10-20T20:00:00-04:00", neutral: false, city: null }, writes: 0, storedOt: 3 },
      { label: "city null to value and neutral false to true", input: { ot: 3, tip, neutral: true, city: "Las Vegas" }, writes: 1, storedOt: 3 },
      { label: "city value to null", input: { ot: 3, tip, neutral: true, city: null }, writes: 1, storedOt: 3 },
      { label: "neutral true to false", input: { ot: 3, tip, neutral: false, city: null }, writes: 1, storedOt: 3 },
      { label: "known tip to null", input: { ot: 3, tip: null, neutral: false, city: null }, writes: 1, storedOt: 3 },
      { label: "unchanged null tip", input: { ot: 3, tip: null, neutral: false, city: null }, writes: 0, storedOt: 3 },
      { label: "null tip to known instant", input: { ot: 3, tip, neutral: false, city: null }, writes: 1, storedOt: 3 },
    ];
    for (const scenario of cases) {
      const before = await snapshot();
      const child = spawnSync(process.execPath, [
        "--import", join(root, "node_modules/tsx/dist/loader.mjs"),
        "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
        join(root, "scripts/fetch_game_context.ts"), date, date, "--refresh",
      ], { cwd: scratch, encoding: "utf8", timeout: 15_000,
        env: { ...process.env, DATABASE_URL: scoped.toString(),
          DAILY_SCOREBOARD_RUN_ID: "", DAILY_STAGE_SUMMARY_DIR: join(scratch, "summary"),
          GAME_CONTEXT_TEST_PAYLOAD: JSON.stringify(payload(scenario.input)),
          TSX_TSCONFIG_PATH: join(root, "tsconfig.json"), TSX_DISABLE_CACHE: "1", TMPDIR: scratch },
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      const counts = JSON.parse(readFileSync(join(scratch, "summary/context.json"), "utf8"));
      assert.equal(counts.rows_written, scenario.writes, scenario.label);
      const after = await snapshot();
      if (scenario.writes === 0) assert.equal(after.version, before.version, `${scenario.label}: no physical row update`);
      else assert.notEqual(after.version, before.version, `${scenario.label}: one physical row update`);
      assert.equal(after.ot, scenario.storedOt, scenario.label);
      assert.equal(after.tip, scenario.input.tip === null ? null : new Date(scenario.input.tip).toISOString(), scenario.label);
      assert.equal(after.neutral, scenario.input.neutral, scenario.label);
      assert.equal(after.city, scenario.input.city, scenario.label);
      console.log(`PASS ${scenario.label}: rows_written=${counts.rows_written}, row version ${scenario.writes ? "changed" : "preserved"}`);
    }
  } finally {
    await db.end();
    if (created) await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
    rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
