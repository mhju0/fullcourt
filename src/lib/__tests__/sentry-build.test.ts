import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import config from "../../../next.config";

const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve("@sentry/nextjs/config"));
const { SentryCliAdapter } = require(join(dirname(sdkRequire.resolve("@sentry/bundler-plugins/core")), "cli.js"));
const temporaryDirectories: string[] = [];

function artifacts() {
  const distDir = mkdtempSync(join(tmpdir(), "fullcourt-sentry-build-"));
  temporaryDirectories.push(distDir);
  const client = join(distDir, "static/chunks/client.js");
  const server = join(distDir, "server/chunks/server.js");
  for (const file of [client, server]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "throw new Error('fixture');\n//# sourceMappingURL=client.js.map\n");
    writeFileSync(`${file}.map`, JSON.stringify({ version: 3, sources: ["fixture.ts"], sourcesContent: ["throw new Error('fixture');"], mappings: "AAAA" }));
  }
  return { distDir, client, server };
}

beforeEach(() => {
  vi.stubEnv("TURBOPACK", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("shipping-build Sentry source maps", () => {
  it("keeps local and CI builds usable without producing public source maps", () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "");
    vi.stubEnv("VERCEL_ENV", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = config(PHASE_PRODUCTION_BUILD);
    expect(result.productionBrowserSourceMaps).toBeUndefined();
    expect(result.compiler?.runAfterProductionCompile).toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("upload skipped"));
  });

  it.each(["production", "preview"])("refuses a %s deployment without its build secret", (environment) => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "   ");
    vi.stubEnv("VERCEL_ENV", environment);
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow("SENTRY_AUTH_TOKEN is required");
  });

  it("does not require a build token at runtime or during development", () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "");
    vi.stubEnv("VERCEL_ENV", "production");
    for (const phase of [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER]) {
      expect(config(phase).compiler?.runAfterProductionCompile).toBeUndefined();
    }
  });

  it("preserves security headers, redirects and the cold-build rule without exposing the token", async () => {
    const baseline = config(PHASE_PRODUCTION_SERVER);
    vi.stubEnv("SENTRY_AUTH_TOKEN", "build-token-test-sentinel");
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = config(PHASE_PRODUCTION_BUILD);
    expect(await result.headers?.()).toEqual(await baseline.headers?.());
    expect(await result.redirects?.()).toEqual(await baseline.redirects?.());
    expect(result.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
    expect(result.productionBrowserSourceMaps).toBe(true);
    expect(result.turbopack?.debugIds).toBe(true);
    expect(result.rewrites).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("build-token-test-sentinel");
    expect(JSON.stringify(result.turbopack?.rules)).not.toMatch(/orchestrion|_sentryRouteManifest|_sentryVercelCronsConfig/);
    expect(config(PHASE_PRODUCTION_SERVER).productionBrowserSourceMaps).toBeUndefined();
  });

  it("uploads both artifact families before deleting public maps, keeping private server maps", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "build-token-test-sentinel");
    const files = artifacts();
    const upload = vi.spyOn(SentryCliAdapter.prototype, "uploadSourcemaps").mockImplementation(async () => {
      expect(existsSync(`${files.client}.map`)).toBe(true);
      expect(existsSync(`${files.server}.map`)).toBe(true);
    });
    const result = config(PHASE_PRODUCTION_BUILD);
    await result.compiler?.runAfterProductionCompile?.({ distDir: files.distDir, projectDir: process.cwd() });
    expect(upload.mock.calls).toEqual([
      [expect.any(String), [
        expect.objectContaining({ directory: join(files.distDir, "server") }),
        expect.objectContaining({ directory: join(files.distDir, "static/chunks") }),
      ]],
    ]);
    expect(existsSync(`${files.client}.map`)).toBe(false);
    expect(existsSync(`${files.server}.map`)).toBe(true);
    expect(readFileSync(files.client, "utf8")).not.toContain("sourceMappingURL");
  });

  it("fails the build on upload failure and preserves artifacts for diagnosis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "build-token-test-sentinel");
    const files = artifacts();
    vi.spyOn(SentryCliAdapter.prototype, "uploadSourcemaps").mockRejectedValue(new Error("provider failure"));
    const result = config(PHASE_PRODUCTION_BUILD);
    await expect(result.compiler?.runAfterProductionCompile?.({ distDir: files.distDir, projectDir: process.cwd() })).rejects.toThrow("refusing to ship");
    expect(existsSync(`${files.client}.map`)).toBe(true);
    expect(existsSync(`${files.server}.map`)).toBe(true);
  });

  it("refuses a build missing server maps before attempting upload", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "build-token-test-sentinel");
    const files = artifacts();
    rmSync(`${files.server}.map`);
    const upload = vi.spyOn(SentryCliAdapter.prototype, "uploadSourcemaps").mockResolvedValue(undefined);
    const result = config(PHASE_PRODUCTION_BUILD);
    await expect(result.compiler?.runAfterProductionCompile?.({ distDir: files.distDir, projectDir: process.cwd() })).rejects.toThrow("both client and server maps");
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses to ship when the SDK leaves an uncovered public map", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_AUTH_TOKEN", "build-token-test-sentinel");
    const files = artifacts();
    writeFileSync(join(files.distDir, "static/uncovered.map"), "source contents");
    vi.spyOn(SentryCliAdapter.prototype, "uploadSourcemaps").mockResolvedValue(undefined);
    const result = config(PHASE_PRODUCTION_BUILD);
    await expect(result.compiler?.runAfterProductionCompile?.({ distDir: files.distDir, projectDir: process.cwd() })).rejects.toThrow("Public source maps remain");
  });
});
