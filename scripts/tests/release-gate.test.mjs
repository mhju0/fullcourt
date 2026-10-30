import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const aggregate = workflow.slice(workflow.indexOf("\n  verify:\n"));
const root = new URL("../../", import.meta.url);

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

test("browser gate installs only the headless shell used by every smoke project", () => {
  const browser = workflow.split("\n  browser:\n")[1]?.split("\n  postgres:\n")[0];
  assert.ok(browser, "browser gate exists");
  assert.match(browser, /run: pnpm exec playwright install --with-deps --only-shell chromium/);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const imported = await import('./playwright.smoke.config.ts');
    const config = imported.default?.default ?? imported.default;
    console.log(JSON.stringify(config));
  `], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.ok(config.projects?.length, "smoke projects exist");
  for (const project of config.projects) {
    const use = { ...config.use, ...project.use };
    assert.equal(use.browserName, "chromium", project.name);
    assert.notEqual(use.headless, false, project.name);
    assert.equal(use.channel, undefined, project.name);
    assert.equal(use.launchOptions?.channel, undefined, project.name);
    assert.equal(use.launchOptions?.executablePath, undefined, project.name);
    assert.notEqual(use.launchOptions?.headless, false, project.name);
    assert.equal(use.connectOptions, undefined, project.name);
  }
});

test("workflow actions stay SHA-pinned and read-only jobs discard checkout credentials", () => {
  const directory = new URL("../../.github/workflows/", import.meta.url);
  const writers = new Set(["season-publications.yml/publish", "officiating-refresh.yml/propose"]);
  const pins = new Map();
  const seenWriters = new Set();
  for (const filename of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const text = readFileSync(new URL(filename, directory), "utf8");
    for (const [, action, ref] of text.matchAll(/^\s+(?:- )?uses: ([\w-]+\/[\w-]+)@([^\s#]+)/gm)) {
      assert.match(ref, /^[0-9a-f]{40}$/, `${filename}: ${action} must use an immutable commit`);
      if (pins.has(action)) assert.equal(ref, pins.get(action), `${action}: update every workflow together`);
      pins.set(action, ref);
    }
    const jobs = text.slice(text.indexOf("\njobs:\n") + 7).split(/(?=^  [A-Za-z][\w-]*:\s*$)/m);
    for (const job of jobs) {
      const name = job.match(/^  ([\w-]+):/)?.[1];
      const identity = `${filename}/${name}`;
      const checkoutIndex = job.indexOf("uses: actions/checkout@");
      if (checkoutIndex < 0) continue;
      const checkout = job.slice(checkoutIndex).split(/\n      - /)[0];
      if (writers.has(identity)) {
        seenWriters.add(identity);
        assert.match(job, /contents: write/, identity);
      } else {
        assert.match(checkout, /persist-credentials: false/, identity);
      }
    }
  }
  assert.deepEqual(seenWriters, writers, "only the two data publishers retain checkout credentials");
  assert.ok(pins.size >= 6, "scan covers every action in the current workflows");
});
