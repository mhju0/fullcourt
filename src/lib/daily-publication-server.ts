import { createHash } from "node:crypto";
import {
  DAILY_PUBLICATION_BASE, DAILY_DATASETS, MAX_PUBLICATION_BYTES, dailyManifestSchema,
  type DailyDataset, type DailyDatasetResult,
} from "@/lib/daily-publication";

async function limitedBody(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error("Publication unavailable");
  const advertised = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertised) && advertised > limit) throw new Error("Publication too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Publication too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function readPath(path: string, limit: number) {
  const response = await fetch(`${DAILY_PUBLICATION_BASE}${path}`, {
    signal: AbortSignal.timeout(8_000), cache: "force-cache", next: { revalidate: 300 },
    redirect: "error",
  });
  return limitedBody(response, limit);
}

/** The manifest points to append-only blobs; an older cached manifest remains coherent. */
export async function readDailyDataset(name: DailyDataset, pinnedHash?: string): Promise<DailyDatasetResult> {
  const fallback: DailyDatasetResult = { data: null, hash: null, checkedAt: null, publishedAt: null, status: "bundled" };
  if (!DAILY_DATASETS.includes(name)) return fallback;
  try {
    if (pinnedHash) {
      if (!/^[a-f0-9]{64}$/.test(pinnedHash)) return fallback;
      const bytes = await readPath(`blobs/${name}-${pinnedHash}.json`, MAX_PUBLICATION_BYTES);
      if (createHash("sha256").update(bytes).digest("hex") !== pinnedHash) return fallback;
      return { ...fallback, data: JSON.parse(new TextDecoder().decode(bytes)), hash: pinnedHash, status: "published" };
    }
    const raw = await readPath("manifest.json", 32_768);
    const manifest = dailyManifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
    if (Date.parse(manifest.updatedAt) > Date.now() + 300_000) return fallback;
    const entry = manifest.datasets[name];
    const state = manifest.checks[name];
    const status = state?.status ?? (entry ? "published" : "unavailable");
    const result: DailyDatasetResult = { ...fallback, checkedAt: state?.checkedAt ?? null, publishedAt: entry?.generatedAt ?? null, status };
    if (!entry) return result;
    const bytes = await readPath(entry.path, entry.bytes);
    if (bytes.byteLength !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) return { ...result, status: "failed" };
    return { ...result, data: JSON.parse(new TextDecoder().decode(bytes)), hash: entry.sha256 };
  } catch {
    return { ...fallback, status: "failed" };
  }
}
