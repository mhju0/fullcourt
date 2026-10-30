import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRelease } from "../../../scripts/verify_release";
import shooting from "@/data/shooting-current.json";
import { DAILY_DATASETS, DAILY_PUBLICATION_BASE, MAX_PUBLICATION_BYTES, type DailyDataset, type DailyManifest } from "@/lib/daily-publication";
import type { OfficiatingSnapshot } from "@/lib/officiating-publication";
import { parseCurrentShooting } from "@/lib/player-rest-publication";

const SHA = "225d6bae72b6fdd27a4645142cf651fa851011f5";
const NOW = "2026-10-31T12:00:00Z";
const SENSITIVE = "private-token postgres://private-host/database?credential=hidden";
function deployment() {
  return { id: "dpl_CC8bKokHgLbhjehctFXpCZFX4y9U", name: "fullcourt", projectId: "prj_RyvHNQJBgEJboa8cgebACWdx00i7",
    target: "production", readyState: "READY", alias: ["fullcourt.fyi"],
    meta: { githubCommitSha: SHA, githubOrg: "mhju0", githubRepo: "fullcourt", githubCommitRef: "main" } };
}
function run(id = 1, createdAt = "2026-10-30T14:00:00Z") {
  return { id, head_sha: SHA, head_branch: "main", event: "push", path: ".github/workflows/ci.yml", created_at: createdAt,
    status: "completed", conclusion: "success" as string | null, repository: { full_name: "mhju0/fullcourt" } };
}
function artifacts() {
  const id = "0022600001", sha256 = "a".repeat(64);
  const source = `https://official.nba.com/l2m/L2MReport.html?gameId=${id}`;
  const officiating: OfficiatingSnapshot = { schemaVersion: 1, generatedAt: NOW,
    season: { season: "2026-27", refreshedAt: NOW, through: "2026-10-21", indexSource: "https://official.nba.com/2026-27-nba-officiating-last-two-minute-reports/",
      indexSha256: sha256, missed: 0, wrong: 0, categories: {}, games: [{ id, date: "2026-10-21", home: "BOS", away: "NYK",
        homeName: "Boston Celtics", awayName: "New York Knicks", missed: 0, wrong: 0, ungraded: 0, categories: {}, source, sha256 }] },
    details: { [`${id}-${sha256.slice(0, 16)}`]: { id, sha256, crew: [], source, events: [] } } };
  const shotQuality = { schemaVersion: 1, snapshot: { season: "2026-27", generatedAt: NOW,
    source: { provider: "NBA Stats ShotChartDetail", url: "https://stats.nba.com/stats/shotchartdetail", fetchedAt: NOW,
      firstGameDate: "2026-10-20", lastGameDate: "2026-10-20", gameIds: [id], shotCount: 2, droppedNoLocation: 0, droppedOutsideHalfCourt: 0 },
    cells: [{ cellX: 0, cellY: 0, zoneBasic: null, zoneRange: null, zoneArea: null, fga: 2, fgm: 0, fg3a: 0, fg3m: 0, gbm: null, baseline: null }] } };
  return { officiating, shooting: structuredClone(shooting), shotQuality };
}
function fixture() {
  const values = artifacts();
  const manifest: DailyManifest = { schemaVersion: 1, updatedAt: NOW, datasets: {}, checks: {} };
  const blobs = new Map<string, string>();
  const state = { runs: [run()], initial: deployment(), final: deployment(), manifest, blobs };
  function replaceBody(name: DailyDataset, body: string) {
    const digest = createHash("sha256").update(body).digest("hex");
    const path = `blobs/${name}-${digest}.json`;
    manifest.datasets[name] = { ...manifest.datasets[name]!, path, sha256: digest, bytes: Buffer.byteLength(body) };
    blobs.set(path, body);
  }
  for (const name of DAILY_DATASETS) {
    manifest.checks[name] = { checkedAt: NOW, status: "published" };
    manifest.datasets[name] = { path: "", sha256: "", bytes: 1, season: "2026-27", generatedAt: name === "shooting" ? shooting.generated : NOW };
    replaceBody(name, JSON.stringify(values[name]));
  }
  let deploymentReads = 0;
  const command = vi.fn<(file: string, args: string[]) => Promise<string>>(async file => {
    if (file === "git") return SHA + "\n";
    if (file === "gh") return JSON.stringify({ workflow_runs: state.runs });
    if (file === "corepack") return JSON.stringify(deploymentReads++ === 0 ? state.initial : state.final);
    throw new Error(SENSITIVE);
  });
  const request = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    if (url === "https://fullcourt.fyi/api/health") return new Response(JSON.stringify({ status: "ok", db: "up", timestamp: NOW }));
    if (url === `${DAILY_PUBLICATION_BASE}manifest.json`) return new Response(JSON.stringify(manifest));
    const body = blobs.get(url.slice(DAILY_PUBLICATION_BASE.length));
    if (url.startsWith(DAILY_PUBLICATION_BASE) && body !== undefined) return new Response(body);
    throw new Error(SENSITIVE);
  });
  return { state, values, replaceBody, command, request, verify: (args = ["--sha", SHA]) => verifyRelease(args, { command, request }) };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse(NOW)); });
afterEach(() => { vi.restoreAllMocks(); });

describe("read-only release verification", () => {
  it("verifies authentic provider field names and real domain parsers, without asserting freshness or coverage", async () => {
    const f = fixture();
    const result = await f.verify();
    expect(result).toMatchObject({ sha: SHA, exitCode: 0, deploymentHealth: "verified", dataIntegrity: "verified",
      coverage: "not-evaluated", freshness: "not-evaluated", ciRunId: 1, deploymentId: f.state.initial.id, failures: [] });
    expect(result.modules).toHaveLength(3);
    expect(result.modules.every(module => module.sourceState === "published" && module.integrity === "verified")).toBe(true);
    expect(f.request.mock.calls.filter(([url]) => url === `${DAILY_PUBLICATION_BASE}manifest.json`)).toHaveLength(1);
    expect(f.command.mock.calls.filter(([file]) => file === "corepack")).toHaveLength(2);
  });

  it("uses safe fixed GET argument vectors and defaults to the full git HEAD", async () => {
    const f = fixture();
    expect((await f.verify([])).exitCode).toBe(0);
    expect(f.command).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"]);
    expect(f.command).toHaveBeenCalledWith("gh", ["api", `repos/mhju0/fullcourt/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${SHA}&per_page=100`, "--method", "GET"]);
    expect(f.command).toHaveBeenCalledWith("corepack", ["pnpm", "dlx", "vercel@65.7.0", "api", "/v13/deployments/fullcourt.fyi", "--method", "GET", "--raw", "--non-interactive"]);
    for (const [, options] of f.request.mock.calls) expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
  });

  it.each([["--sha", "225d6bae"], ["--sha", `$(echo ${SHA})`], ["--sha", SHA, "--deploy"], ["--url", "https://example.com"], ["--sha"]])("rejects invalid arguments before invoking tools: %j", async (...args) => {
    const f = fixture();
    expect(await f.verify(args)).toMatchObject({ exitCode: 1, failures: [{ check: "input", code: "invalid-arguments" }] });
    expect(f.command).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("accepts a full uppercase hexadecimal argument and normalizes it", async () => {
    expect((await fixture().verify(["--sha", SHA.toUpperCase()])).exitCode).toBe(0);
  });

  it.each(["failure", "in-progress"])("selects the latest matching run before testing success: %s", async fault => {
    const f = fixture();
    const latest = run(2, "2026-10-30T15:00:00Z");
    latest.status = fault === "failure" ? "completed" : "in_progress";
    latest.conclusion = fault === "failure" ? "failure" : null;
    f.state.runs = [run(), latest];
    expect(await f.verify()).toMatchObject({ exitCode: 1, ciRunId: 2, failures: [{ check: "ci", code: "ci-not-successful" }] });
  });

  it.each(["head_sha", "head_branch", "event", "path"] as const)("does not trust server-side filtering of %s", async key => {
    const f = fixture();
    f.state.runs[0][key] = key === "head_sha" ? "f".repeat(40) : "other";
    expect(await f.verify()).toMatchObject({ exitCode: 1, failures: [{ check: "ci", code: "invalid-ci-response" }] });
  });

  it.each(["id", "name", "projectId", "target", "readyState"] as const)("rejects a mismatched deployment %s", async key => {
    const f = fixture(); f.state.initial[key] = "other";
    expect((await f.verify()).failures).toContainEqual({ check: "deployment", code: "deployment-mismatch" });
  });

  it.each(["githubCommitSha", "githubOrg", "githubRepo", "githubCommitRef"] as const)("validates deployment metadata %s", async key => {
    const f = fixture(); f.state.initial.meta[key] = "other";
    expect((await f.verify()).exitCode).toBe(1);
  });

  it("requires the canonical alias and catches a deployment moving during checks", async () => {
    const missing = fixture(); missing.state.initial.alias = [];
    expect((await missing.verify()).exitCode).toBe(1);
    const moved = fixture(); moved.state.final.id = "dpl_Moved";
    expect(await moved.verify()).toMatchObject({ exitCode: 1, failures: [{ check: "canonical", code: "alias-moved" }] });
  });

  it.each(["http", "db", "json"])("fails an unhealthy public health response: %s", async fault => {
    const f = fixture();
    f.request.mockResolvedValueOnce(fault === "http" ? new Response('{"status":"ok","db":"up"}', { status: 503 })
      : new Response(fault === "db" ? '{"status":"ok","db":"down"}' : "not JSON"));
    expect(await f.verify()).toMatchObject({ exitCode: 1, deploymentHealth: "failed", dataIntegrity: "verified" });
  });

  it.each(DAILY_DATASETS)("reports known %s failure as source degradation while retaining verified content", async name => {
    const f = fixture(); f.state.manifest.checks[name]!.status = "failed";
    const result = await f.verify();
    expect(result).toMatchObject({ exitCode: 2, deploymentHealth: "verified", dataIntegrity: "verified", failures: [] });
    expect(result.modules.find(module => module.name === name)).toMatchObject({ sourceState: "failed", integrity: "verified", hash: f.state.manifest.datasets[name]!.sha256 });
  });

  it("distinguishes valid unavailable/no-entry state from unknown missing checks", async () => {
    const f = fixture(); delete f.state.manifest.datasets.shotQuality;
    f.state.manifest.checks.shotQuality!.status = "unavailable";
    expect(await f.verify()).toMatchObject({ exitCode: 2, dataIntegrity: "verified" });
    delete f.state.manifest.checks.shotQuality;
    expect(await f.verify()).toMatchObject({ exitCode: 1, failures: [{ check: "publications", code: "missing-source-check" }] });
  });

  it("accepts a legacy entry without a declared season but still validates its domain identity", async () => {
    const f = fixture(); delete f.state.manifest.datasets.shooting!.season;
    const result = await f.verify();
    expect(result.exitCode).toBe(0);
    expect(result.modules.find(module => module.name === "shooting")?.season).toBe(shooting.publication.season);
  });

  it.each(["bytes", "hash", "json", "domain", "season", "generatedAt"])("fails publication %s even when a source check is already failed", async fault => {
    const f = fixture(); f.state.manifest.checks.shooting!.status = "failed";
    const entry = f.state.manifest.datasets.shooting!;
    if (fault === "bytes") entry.bytes++;
    if (fault === "hash") {
      const original = f.state.blobs.get(entry.path)!;
      const [first, ...rest] = Object.entries(JSON.parse(original));
      const reordered = JSON.stringify(Object.fromEntries([...rest, first]));
      const originalParsed = parseCurrentShooting(JSON.parse(original));
      expect(originalParsed).not.toBeNull();
      expect(parseCurrentShooting(JSON.parse(reordered))).toEqual(originalParsed);
      expect(Buffer.byteLength(reordered)).toBe(entry.bytes);
      expect(createHash("sha256").update(reordered).digest("hex")).not.toBe(entry.sha256);
      f.state.blobs.set(entry.path, reordered);
    }
    if (fault === "json") f.replaceBody("shooting", "{");
    if (fault === "domain") f.replaceBody("shooting", "{}");
    if (fault === "season") entry.season = "2025-26";
    if (fault === "generatedAt") entry.generatedAt = NOW;
    const result = await f.verify();
    expect(result).toMatchObject({ exitCode: 1, dataIntegrity: "failed", deploymentHealth: "verified" });
    if (fault === "hash") expect(result.failures).toContainEqual({ check: "publications", code: "publication-integrity" });
  });

  it.each(["path", "future", "schema", "limit"])("rejects an invalid manifest before requesting its blobs: %s", async fault => {
    const f = fixture();
    if (fault === "path") f.state.manifest.datasets.officiating!.path = "https://untrusted.example/private";
    if (fault === "future") f.state.manifest.updatedAt = "2099-01-01T00:00:00Z";
    if (fault === "schema") f.request.mockResolvedValueOnce(new Response('{"status":"ok","db":"up"}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...f.state.manifest, schemaVersion: 2 })));
    if (fault === "limit") f.state.manifest.datasets.officiating!.bytes = MAX_PUBLICATION_BYTES + 1;
    expect((await f.verify()).exitCode).toBe(1);
    expect(f.request.mock.calls).toHaveLength(2);
  });

  it("bounds an unadvertised manifest stream and cancels it before parsing", async () => {
    const f = fixture(), cancel = vi.fn();
    f.request.mockResolvedValueOnce(new Response('{"status":"ok","db":"up"}'))
      .mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32_769)); }, cancel })));
    expect((await f.verify()).failures).toContainEqual({ check: "publications", code: "response-too-large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a response whose advertised size exceeds its limit", async () => {
    const f = fixture(), cancel = vi.fn();
    f.request.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "content-length": "16385" } }));
    expect((await f.verify()).failures).toContainEqual({ check: "health", code: "response-too-large" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("uses only fixed safe failure codes when command or transport errors contain secrets", async () => {
    const f = fixture(); f.command.mockRejectedValue(new Error(SENSITIVE)); f.request.mockRejectedValue(new Error(SENSITIVE));
    const result = await f.verify();
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result)).not.toContain(SENSITIVE);
    expect(result.failures).toContainEqual({ check: "ci", code: "ci-unavailable" });
    expect(result.failures).toContainEqual({ check: "health", code: "health-unavailable" });
  });
});

describe("actual pnpm CLI entrypoint without remote requests", () => {
  function cli(args: string[]) {
    return new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve, reject) => {
      execFile("corepack", ["pnpm", "--silent", "verify:release", ...args], {
        cwd: process.cwd(), timeout: 20_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", VERCEL_TOKEN: "", CI: "1" },
      }, (error, stdout, stderr) => {
        if (error?.killed || error?.signal) reject(new Error("CLI smoke timed out"));
        else resolve({ code: error?.code ?? 0, stdout, stderr });
      });
    });
  }
  it("runs the installed package command and returns safe JSON for invalid SHA", async () => {
    const result = await cli(["--sha", "invalid"]);
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ sha: null, exitCode: 1, ciRunId: null, deploymentId: null, modules: [],
      failures: [{ check: "input", code: "invalid-arguments" }] });
    expect(result.stderr).not.toContain("Error:");
  }, 25_000);
  it("prints help without claiming verification or contacting providers", async () => {
    const result = await cli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: pnpm verify:release");
    expect(result.stdout).toContain("2: known source degradation");
    expect(result.stdout).not.toContain('"deploymentHealth"');
  }, 25_000);
});
