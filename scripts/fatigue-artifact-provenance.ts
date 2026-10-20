import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function exportSources(root: string): Promise<Record<string, string>> {
  const files: string[] = JSON.parse(await readFile(path.join(root, "scripts/fatigue-artifact-sources.json"), "utf8"));
  const entries = await Promise.all(files.map(async (file) => [file, await sha256File(path.join(root, file))] as const));
  return Object.fromEntries(entries);
}

export async function beginFeatureExport(root: string) {
  const csv = path.join(root, "ml/data/fatigue_features.csv");
  const receipt = `${csv}.provenance.json`;
  await mkdir(path.dirname(csv), { recursive: true });
  await rm(receipt, { force: true });
  return { root, csv, receipt, temporary: `${csv}.${randomUUID()}.tmp`, sources: await exportSources(root) };
}

export async function finishFeatureExport(
  generation: Awaited<ReturnType<typeof beginFeatureExport>>,
  fidelity: { compared: number; mismatches: number; failures: number }
): Promise<void> {
  if (fidelity.mismatches || fidelity.failures || fidelity.compared < 1) {
    throw new Error("Fatigue export fidelity failed; no successful export receipt written");
  }
  if (JSON.stringify(generation.sources) !== JSON.stringify(await exportSources(generation.root))) {
    throw new Error("Fatigue export sources changed during generation; rerun the exporter");
  }
  const receipt = {
    version: 1, kind: "fatigue-features", status: "success",
    sources: generation.sources,
    output: { path: "ml/data/fatigue_features.csv", sha256: await sha256File(generation.temporary) },
    fidelity,
  };
  const temporaryReceipt = `${generation.temporary}.provenance.json`;
  try {
    await writeFile(temporaryReceipt, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    await rename(generation.temporary, generation.csv);
    await rename(temporaryReceipt, generation.receipt);
  } finally {
    await rm(temporaryReceipt, { force: true });
  }
}
