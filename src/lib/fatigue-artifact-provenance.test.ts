import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { beginFeatureExport, exportSources, finishFeatureExport, sha256File } from "../../scripts/fatigue-artifact-provenance";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fatigue-export-"));
  roots.push(root);
  await mkdir(path.join(root, "scripts"));
  await writeFile(path.join(root, "scripts/fatigue-artifact-sources.json"), JSON.stringify(["scripts/producer.ts"]));
  await writeFile(path.join(root, "scripts/producer.ts"), "original source");
  await mkdir(path.join(root, "ml/data"), { recursive: true });
  const csv = path.join(root, "ml/data/fatigue_features.csv");
  await writeFile(csv, "previous valid CSV\n");
  await writeFile(`${csv}.provenance.json`, "previous receipt");
  return root;
}

describe("fatigue feature export publication", () => {
  it("invalidates old success, preserves old CSV on fidelity failure, then publishes exact bytes on success", async () => {
    const root = await fixture();
    const run = await beginFeatureExport(root);
    await expect(readFile(run.receipt)).rejects.toThrow();
    await writeFile(run.temporary, "new CSV\n");
    for (const fidelity of [{ compared: 2, mismatches: 1, failures: 0 }, { compared: 2, mismatches: 0, failures: 1 }, { compared: 0, mismatches: 0, failures: 0 }]) {
      await expect(finishFeatureExport(run, fidelity)).rejects.toThrow("fidelity failed");
      expect(await readFile(run.csv, "utf8")).toBe("previous valid CSV\n");
      await expect(readFile(run.receipt)).rejects.toThrow();
    }
    await finishFeatureExport(run, { compared: 2, mismatches: 0, failures: 0 });
    expect(await readFile(run.csv, "utf8")).toBe("new CSV\n");
    expect(JSON.parse(await readFile(run.receipt, "utf8"))).toMatchObject({ version: 1, status: "success", output: { sha256: await sha256File(run.csv) }, sources: await exportSources(root) });
  });

  it("refuses source drift during generation before replacing existing output", async () => {
    const root = await fixture();
    const run = await beginFeatureExport(root);
    await writeFile(run.temporary, "new CSV\n");
    await writeFile(path.join(root, "scripts/producer.ts"), "changed source");
    await expect(finishFeatureExport(run, { compared: 2, mismatches: 0, failures: 0 })).rejects.toThrow("sources changed");
    expect(await readFile(run.csv, "utf8")).toBe("previous valid CSV\n");
    await expect(readFile(run.receipt)).rejects.toThrow();
  });

  it("pins every local exporter import, computation registry and dependency lock", async () => {
    const root = process.cwd();
    const files: string[] = JSON.parse(await readFile(path.join(root, "scripts/fatigue-artifact-sources.json"), "utf8"));
    const seen = new Set<string>();
    async function visit(file: string): Promise<void> {
      if (seen.has(file)) return;
      seen.add(file);
      expect(files, `missing exporter dependency ${file}`).toContain(file);
      if (!file.endsWith(".ts")) return;
      const info = ts.preProcessFile(await readFile(path.join(root, file), "utf8"));
      for (const entry of info.importedFiles) {
        const name = entry.fileName;
        if (!name.startsWith(".") && !name.startsWith("@/")) continue;
        const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(root, path.dirname(file), name);
        let resolved: string | undefined;
        for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
          try { await readFile(candidate); resolved = path.relative(root, candidate); break; } catch { /* Try the next TypeScript resolution. */ }
        }
        expect(resolved, `unresolved local import ${name} in ${file}`).toBeDefined();
        await visit(resolved!);
      }
    }
    await visit("scripts/export_fatigue_features.ts");
    expect(files).toContain("scripts/fatigue-artifact-sources.json");
    expect(files).toContain("pnpm-lock.yaml");
    expect(files).toContain("package.json");
  });
});
