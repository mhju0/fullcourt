import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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


test("Node-only maintenance monitor does not require a package manager cache", () => {
  const maintenance = readFileSync(new URL("../../.github/workflows/maintenance-health.yml", import.meta.url), "utf8");
  const monitor = maintenance.split("\n  monitor:\n")[1]?.split("\n  dependencies:\n")[0];
  assert.ok(monitor, "monitor job exists");
  assert.match(monitor, /package-manager-cache: false/, "setup-node defaults to auto-caching the declared pnpm manager, which is not installed in this Node-only job");
  assert.doesNotMatch(monitor, /cache: pnpm|pnpm\/action-setup|pnpm install/);
});
