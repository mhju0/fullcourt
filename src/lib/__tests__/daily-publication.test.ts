import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_PUBLICATION_BASE, MAX_PUBLICATION_BYTES, dailyManifestSchema,
  type DailyDataset, type DailyManifest,
} from "@/lib/daily-publication";
import { readDailyDataset } from "@/lib/daily-publication-server";

const NOW = "2026-10-23T12:00:00Z";
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
function publication(data: unknown = { reports: ["old"] }) {
  const body = bytes(data);
  const digest = hash(body);
  const path = `blobs/officiating-${digest}.json`;
  const manifest: DailyManifest = {
    schemaVersion: 1, updatedAt: NOW,
    datasets: { officiating: { path, sha256: digest, bytes: body.byteLength, generatedAt: NOW } },
    checks: { officiating: { checkedAt: NOW, status: "published" } },
  };
  return { body, digest, path, manifest };
}
function serve(manifest: unknown, blobs: Map<string, Uint8Array> = new Map()) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `${DAILY_PUBLICATION_BASE}manifest.json`) return new Response(bytes(manifest));
    const body = blobs.get(url.slice(DAILY_PUBLICATION_BASE.length));
    return body ? new Response(new Uint8Array(body)) : new Response("Missing", { status: 404 });
  }));
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("daily publication manifest boundaries", () => {
  it("requires dataset names and content-addressed paths to match the exact allowlist", () => {
    const { manifest } = publication();
    expect(dailyManifestSchema.safeParse(manifest).success).toBe(true);
    for (const path of ["../secrets.json", "https://example.com/payload.json", "blobs/officiating-deadbeef.json", `blobs/shooting-${manifest.datasets.officiating!.sha256}.json`]) {
      expect(dailyManifestSchema.safeParse({ ...manifest, datasets: { officiating: { ...manifest.datasets.officiating, path } } }).success).toBe(false);
    }
    expect(dailyManifestSchema.safeParse({ ...manifest, datasets: { unknown: manifest.datasets.officiating } }).success).toBe(false);
    expect(dailyManifestSchema.safeParse({ ...manifest, checks: { unknown: { checkedAt: NOW, status: "published" } } }).success).toBe(false);
  });
  it("rejects impossible published status, snapshot ordering and excessive declared bytes", () => {
    const { manifest } = publication();
    expect(dailyManifestSchema.safeParse({ ...manifest, datasets: {} }).success).toBe(false);
    expect(dailyManifestSchema.safeParse({ ...manifest, datasets: { officiating: { ...manifest.datasets.officiating, generatedAt: "2026-10-24T00:00:00Z" } } }).success).toBe(false);
    expect(dailyManifestSchema.safeParse({ ...manifest, datasets: { officiating: { ...manifest.datasets.officiating, bytes: MAX_PUBLICATION_BYTES + 1 } } }).success).toBe(false);
  });
  it.each(["published", "unavailable", "failed"] as const)("rejects %s checks dated after the manifest rather than accepting false freshness", (status) => {
    const { manifest } = publication();
    manifest.checks.officiating = { status, checkedAt: "2026-10-23T12:00:01Z" };
    expect(dailyManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("daily publication runtime reads", () => {
  it("verifies byte length and SHA before exposing a snapshot", async () => {
    const p = publication();
    serve(p.manifest, new Map([[p.path, p.body]]));
    await expect(readDailyDataset("officiating")).resolves.toEqual({ data: { reports: ["old"] }, hash: p.digest,
      checkedAt: NOW, publishedAt: NOW, status: "published" });
    expect(fetch).toHaveBeenCalledWith(`${DAILY_PUBLICATION_BASE}${p.path}`, expect.objectContaining({ redirect: "error" }));
  });
  it("rejects a same-size altered blob rather than trusting its path or metadata", async () => {
    const p = publication({ label: "old" });
    const altered = bytes({ label: "new" });
    expect(altered.byteLength).toBe(p.body.byteLength);
    serve(p.manifest, new Map([[p.path, altered]]));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, hash: null, status: "failed" });
  });
  it("rejects a shorter body even if a manifest declares its actual hash", async () => {
    const p = publication();
    p.manifest.datasets.officiating!.bytes++;
    serve(p.manifest, new Map([[p.path, p.body]]));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, status: "failed" });
  });
  it("enforces the streaming byte limit when Content-Length falsely claims a tiny body", async () => {
    const p = publication();
    const canceled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(p.body.byteLength + 1)); },
      cancel: canceled,
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("manifest.json")
      ? new Response(bytes(p.manifest)) : new Response(stream, { headers: { "content-length": "1" } })));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, hash: null, status: "failed" });
    expect(canceled).toHaveBeenCalledOnce();
  });
  it("limits the manifest stream too, before fetching any blob", async () => {
    const canceled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(32_769)); }, cancel: canceled,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { headers: { "content-length": "2" } })));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, status: "failed" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(canceled).toHaveBeenCalledOnce();
  });
  it("enforces the absolute pinned-blob limit across multiple streamed chunks without a length header", async () => {
    const canceled = vi.fn();
    const chunk = new Uint8Array(MAX_PUBLICATION_BYTES / 8);
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(emitted++ < 8 ? chunk : new Uint8Array(1));
      },
      cancel: canceled,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));
    await expect(readDailyDataset("officiating", "a".repeat(64))).resolves.toMatchObject({ data: null, status: "failed" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(canceled).toHaveBeenCalledOnce();
  });
  it("rejects oversized advertised bodies without consuming the body", async () => {
    const p = publication();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("manifest.json")
      ? new Response(bytes(p.manifest)) : new Response(p.body, { headers: { "content-length": String(p.body.byteLength + 1) } })));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, status: "failed" });
  });
  it("never fetches paths from a hostile or future manifest", async () => {
    const p = publication();
    for (const manifest of [
      { ...p.manifest, updatedAt: "2026-10-24T12:00:00Z" },
      { ...p.manifest, datasets: { officiating: { ...p.manifest.datasets.officiating, path: "../package.json" } } },
    ]) {
      serve(manifest);
      expect((await readDailyDataset("officiating")).data).toBeNull();
      expect(fetch).toHaveBeenCalledOnce();
    }
  });
  it("does not expose a valid blob behind a falsely future-dated source check", async () => {
    const p = publication();
    p.manifest.checks.officiating!.checkedAt = "2026-10-24T12:00:00Z";
    serve(p.manifest, new Map([[p.path, p.body]]));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, hash: null, checkedAt: null, status: "failed" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("returns an explicit failed state for network failures or invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, hash: null, status: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: null, status: "failed" });
  });
  it("preserves the last published blob when the latest check failed", async () => {
    const p = publication();
    p.manifest.checks.officiating = { checkedAt: NOW, status: "failed" };
    serve(p.manifest, new Map([[p.path, p.body]]));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: { reports: ["old"] }, hash: p.digest, status: "failed" });
  });
  it("reports unavailable independently for an unpublished dataset without fetching another dataset", async () => {
    const p = publication();
    p.manifest.checks.shooting = { checkedAt: NOW, status: "unavailable" };
    serve(p.manifest, new Map([[p.path, p.body]]));
    await expect(readDailyDataset("shooting")).resolves.toMatchObject({ data: null, checkedAt: NOW, status: "unavailable" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("pins an older retained blob even after the manifest advances to a new generation", async () => {
    const old = publication({ revision: "old" });
    const next = publication({ revision: "new" });
    serve(next.manifest, new Map([[old.path, old.body], [next.path, next.body]]));
    await expect(readDailyDataset("officiating", old.digest)).resolves.toMatchObject({ data: { revision: "old" }, hash: old.digest });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalledWith(`${DAILY_PUBLICATION_BASE}manifest.json`, expect.anything());
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: { revision: "new" }, hash: next.digest });
  });
  it("stays coherent when the branch advances between reading the manifest and its immutable blob", async () => {
    const old = publication({ revision: "old" });
    const next = publication({ revision: "new" });
    let advanced = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) {
        const manifest = advanced ? next.manifest : old.manifest;
        advanced = true;
        return new Response(bytes(manifest));
      }
      return new Response(url.endsWith(old.path) ? old.body : next.body);
    }));
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: { revision: "old" }, hash: old.digest });
    await expect(readDailyDataset("officiating")).resolves.toMatchObject({ data: { revision: "new" }, hash: next.digest });
  });
  it("rejects malformed pins and unknown runtime dataset names before making requests", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(readDailyDataset("officiating", "../secret")).resolves.toMatchObject({ data: null });
    await expect(readDailyDataset("../secret" as DailyDataset, "a".repeat(64))).resolves.toMatchObject({ data: null });
    expect(fetch).not.toHaveBeenCalled();
  });
});
