import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { DAILY_DATASETS, DAILY_PUBLICATION_BASE, MAX_PUBLICATION_BYTES, dailyManifestSchema, type DailyDataset } from "../src/lib/daily-publication";
import { parseOfficiatingSnapshot } from "../src/lib/officiating-publication";
import { parseCurrentShooting } from "../src/lib/player-rest-publication";
import { parseCurrentShotQualityArtifact } from "../src/lib/shot-quality-publication";

const REPOSITORY = "mhju0/fullcourt";
const DOMAIN = "fullcourt.fyi";
const PROJECT_ID = "prj_RyvHNQJBgEJboa8cgebACWdx00i7";
const fullSha = /^[a-f0-9]{40}$/;
const instant = z.string().datetime({ offset: true });
const workflowRuns = z.object({ workflow_runs: z.array(z.object({
  id: z.number().int().positive(), head_sha: z.string().regex(fullSha), head_branch: z.string().nullable(),
  event: z.string(), path: z.string(), created_at: instant, status: z.string(), conclusion: z.string().nullable(),
  repository: z.object({ full_name: z.literal(REPOSITORY) }),
})) });
const deploymentSchema = z.object({
  id: z.string().regex(/^dpl_[A-Za-z0-9]+$/), name: z.literal("fullcourt"), projectId: z.literal(PROJECT_ID),
  target: z.literal("production"), readyState: z.literal("READY"), alias: z.array(z.string()),
  meta: z.object({ githubCommitSha: z.string().regex(fullSha), githubOrg: z.literal("mhju0"),
    githubRepo: z.literal("fullcourt"), githubCommitRef: z.literal("main") }),
});

type FailureCode = "invalid-arguments" | "git-unavailable" | "ci-unavailable" | "invalid-ci-response" |
  "ci-not-successful" | "deployment-unavailable" | "deployment-mismatch" | "alias-moved" |
  "health-unavailable" | "health-not-ok" | "publication-unavailable" | "response-too-large" |
  "invalid-manifest" | "missing-source-check" | "publication-integrity" | "publication-identity";
class VerificationFailure extends Error {
  constructor(readonly code: FailureCode) { super(code); }
}
type Dependencies = {
  command: (file: string, args: string[]) => Promise<string>;
  request: typeof fetch;
};
type ModuleObservation = {
  name: DailyDataset; sourceState: "published" | "failed" | "unavailable";
  integrity: "verified" | "no-artifact"; season: string | null; hash: string | null;
  checkedAt: string; publishedAt: string | null;
};
type Report = {
  sha: string | null;
  deploymentHealth: "verified" | "failed";
  dataIntegrity: "verified" | "failed";
  coverage: "not-evaluated";
  freshness: "not-evaluated";
  ciRunId: number | null;
  deploymentId: string | null;
  modules: ModuleObservation[];
  failures: { check: "input" | "ci" | "deployment" | "health" | "publications" | "canonical"; code: FailureCode }[];
  exitCode: 0 | 1 | 2;
};

async function command(file: string, args: string[]) {
  const { stdout } = await promisify(execFile)(file, args, {
    encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, CI: "1", GH_PROMPT_DISABLED: "1", VERCEL_TELEMETRY_DISABLED: "1" },
  });
  return stdout;
}

function parseJson(text: string, code: FailureCode): unknown {
  try { return JSON.parse(text); } catch { throw new VerificationFailure(code); }
}

async function jsonCommand(deps: Dependencies, file: string, args: string[], code: FailureCode) {
  let stdout: string;
  try { stdout = await deps.command(file, args); } catch { throw new VerificationFailure(code); }
  return parseJson(stdout, code);
}

async function readBytes(deps: Dependencies, url: string, limit: number, unavailable: FailureCode) {
  try {
    const response = await deps.request(url, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (response.status !== 200 || !response.body) throw new VerificationFailure(unavailable);
    const advertised = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertised) && advertised > limit) {
      await response.body.cancel().catch(() => undefined);
      throw new VerificationFailure("response-too-large");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) throw new VerificationFailure("response-too-large");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    throw error instanceof VerificationFailure ? error : new VerificationFailure(unavailable);
  }
}

function identity(name: DailyDataset, data: unknown) {
  if (name === "officiating") {
    const value = parseOfficiatingSnapshot(data);
    if (value) return { season: value.season.season, generatedAt: value.generatedAt };
  } else if (name === "shooting") {
    const value = parseCurrentShooting(data);
    if (value) return { season: value.publication?.season, generatedAt: value.generated };
  } else {
    const value = parseCurrentShotQualityArtifact(data);
    if (value) return { season: value.season, generatedAt: value.generatedAt };
  }
  throw new VerificationFailure("publication-identity");
}

async function publications(deps: Dependencies): Promise<ModuleObservation[]> {
  // A single manifest keeps checks and retained content hashes on the same publication generation.
  const bytes = await readBytes(deps, `${DAILY_PUBLICATION_BASE}manifest.json`, 32_768, "publication-unavailable");
  const parsed = dailyManifestSchema.safeParse(parseJson(new TextDecoder().decode(bytes), "invalid-manifest"));
  if (!parsed.success || Date.parse(parsed.data.updatedAt) > Date.now() + 300_000) throw new VerificationFailure("invalid-manifest");
  const manifest = parsed.data;
  const modules: ModuleObservation[] = [];
  for (const name of DAILY_DATASETS) {
    const check = manifest.checks[name];
    if (!check) throw new VerificationFailure("missing-source-check");
    const entry = manifest.datasets[name];
    if (!entry) {
      modules.push({ name, sourceState: check.status, integrity: "no-artifact", season: null, hash: null, checkedAt: check.checkedAt, publishedAt: null });
      continue;
    }
    const body = await readBytes(deps, `${DAILY_PUBLICATION_BASE}${entry.path}`, Math.min(entry.bytes, MAX_PUBLICATION_BYTES), "publication-unavailable");
    if (body.byteLength !== entry.bytes || createHash("sha256").update(body).digest("hex") !== entry.sha256) throw new VerificationFailure("publication-integrity");
    const value = identity(name, parseJson(new TextDecoder().decode(body), "publication-integrity"));
    if (!value.season || (entry.season !== undefined && value.season !== entry.season) || Date.parse(value.generatedAt) !== Date.parse(entry.generatedAt)) throw new VerificationFailure("publication-identity");
    modules.push({ name, sourceState: check.status, integrity: "verified", season: value.season, hash: entry.sha256,
      checkedAt: check.checkedAt, publishedAt: entry.generatedAt });
  }
  return modules;
}

async function deployment(deps: Dependencies, sha: string) {
  const raw = await jsonCommand(deps, "corepack", ["pnpm", "dlx", "vercel@65.7.0", "api", `/v13/deployments/${DOMAIN}`, "--method", "GET", "--raw", "--non-interactive"], "deployment-unavailable");
  const parsed = deploymentSchema.safeParse(raw);
  if (!parsed.success || parsed.data.meta.githubCommitSha !== sha || !parsed.data.alias.includes(DOMAIN)) throw new VerificationFailure("deployment-mismatch");
  return parsed.data;
}

export async function verifyRelease(args: string[], overrides: Partial<Dependencies> = {}): Promise<Report> {
  const deps = { command, request: fetch, ...overrides };
  const report: Report = { sha: null, deploymentHealth: "failed", dataIntegrity: "failed", coverage: "not-evaluated", freshness: "not-evaluated", ciRunId: null,
    deploymentId: null, modules: [], failures: [], exitCode: 1 };
  async function check<T>(name: Report["failures"][number]["check"], fallback: FailureCode, work: () => Promise<T>) {
    try { return await work(); } catch (error) {
      report.failures.push({ check: name, code: error instanceof VerificationFailure ? error.code : fallback });
      return null;
    }
  }
  const sha = await check("input", "git-unavailable", async () => {
    if (args.length !== 0 && (args.length !== 2 || args[0] !== "--sha" || !/^[a-fA-F0-9]{40}$/.test(args[1]))) throw new VerificationFailure("invalid-arguments");
    const value = args.length ? args[1].toLowerCase() : (await deps.command("git", ["rev-parse", "HEAD"])).trim();
    if (!fullSha.test(value)) throw new VerificationFailure("invalid-arguments");
    return value;
  });
  if (!sha) return report;
  report.sha = sha;
  await check("ci", "ci-unavailable", async () => {
    const raw = await jsonCommand(deps, "gh", ["api", `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${sha}&per_page=100`, "--method", "GET"], "ci-unavailable");
    const parsed = workflowRuns.safeParse(raw);
    if (!parsed.success) throw new VerificationFailure("invalid-ci-response");
    const latest = parsed.data.workflow_runs.filter(run => run.head_sha === sha && run.head_branch === "main" && run.event === "push" && run.path === ".github/workflows/ci.yml")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
    if (!latest) throw new VerificationFailure("invalid-ci-response");
    report.ciRunId = latest.id;
    if (latest.status !== "completed" || latest.conclusion !== "success") throw new VerificationFailure("ci-not-successful");
  });
  const initial = await check("deployment", "deployment-unavailable", () => deployment(deps, sha));
  if (initial) report.deploymentId = initial.id;
  await check("health", "health-unavailable", async () => {
    const bytes = await readBytes(deps, `https://${DOMAIN}/api/health`, 16_384, "health-unavailable");
    const value = z.object({ status: z.literal("ok"), db: z.literal("up") }).safeParse(parseJson(new TextDecoder().decode(bytes), "health-not-ok"));
    if (!value.success) throw new VerificationFailure("health-not-ok");
  });
  const modules = await check("publications", "publication-unavailable", () => publications(deps));
  if (modules) {
    report.modules = modules;
    report.dataIntegrity = "verified";
  }
  await check("canonical", "deployment-unavailable", async () => {
    const final = await deployment(deps, sha);
    if (!initial || initial.id !== final.id) throw new VerificationFailure("alias-moved");
  });
  report.deploymentHealth = report.failures.some(failure => failure.check !== "publications") ? "failed" : "verified";
  report.exitCode = report.failures.length ? 1 : report.modules.some(module => module.sourceState !== "published") ? 2 : 0;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: pnpm verify:release [--sha <40-hex-commit>]\nRead-only checks. Exit 0: verified; 2: known source degradation; 1: failed or unknown verification.\nTimestamps are observations, not freshness guarantees.");
  } else verifyRelease(args).then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  }).catch(() => {
    console.error("Release verification failed: verifier-error");
    process.exitCode = 1;
  });
}
