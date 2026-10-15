import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const aggregate = workflow.slice(workflow.indexOf("\n  verify:\n"));

test("required verify waits for every gate and runs after non-success results", () => {
  assert.match(aggregate, /needs: \[checks, browser, postgres\]/);
  assert.match(aggregate, /if: always\(\)/);
  assert.doesNotMatch(aggregate, /continue-on-error/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("aggregate shell refuses failed, cancelled, skipped and missing results", () => {
  const body = aggregate.split("        run: |\n")[1];
  assert.ok(body, "required aggregate shell exists");
  const script = body.split("\n").map(line => line.slice(10)).join("\n");
  const states = ["success", "failure", "cancelled", "skipped", ""];
  for (const checks of states) for (const browser of states) for (const postgres of states) {
    const result = spawnSync("bash", ["-c", script], {
      env: { ...process.env, CHECKS_RESULT: checks, BROWSER_RESULT: browser, POSTGRES_RESULT: postgres },
      encoding: "utf8", timeout: 2_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status === 0, [checks, browser, postgres].every(state => state === "success"),
      JSON.stringify({ checks, browser, postgres, output: result.stdout, error: result.stderr }));
  }
});


test("Node-only workflow jobs do not require an uninstalled package manager cache", () => {
  const directory = new URL("../../.github/workflows/", import.meta.url);
  let nodeOnlyJobs = 0;
  for (const filename of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const text = readFileSync(new URL(filename, directory), "utf8");
    const jobs = text.slice(text.indexOf("\njobs:\n") + 7).split(/(?=^  [A-Za-z][\w-]*:\s*$)/m);
    for (const job of jobs) {
      const setup = job.indexOf("actions/setup-node@");
      if (setup < 0 || job.slice(0, setup).includes("pnpm/action-setup@")) continue;
      nodeOnlyJobs += 1;
      const name = job.match(/^  ([\w-]+):/)?.[1];
      assert.match(job, /package-manager-cache: false/, `${filename}/${name}: setup-node auto-cache must not require absent pnpm`);
      assert.doesNotMatch(job, /^\s+cache:\s*["']?(?:pnpm|npm|yarn)/m);
    }
  }
  assert.ok(nodeOnlyJobs >= 2, "scan covers monitor and provider probe jobs");
});
