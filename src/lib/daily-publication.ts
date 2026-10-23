import { z } from "zod";

export const DAILY_DATASETS = ["officiating", "shooting", "shotQuality"] as const;
export type DailyDataset = typeof DAILY_DATASETS[number];
export const DAILY_PUBLICATION_BASE = "https://raw.githubusercontent.com/mhju0/fullcourt/data-publications/";
export const MAX_PUBLICATION_BYTES = 8 * 1024 * 1024;
const instant = z.string().datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const entry = z.object({
  path: z.string(), sha256: digest, bytes: z.number().int().positive().max(MAX_PUBLICATION_BYTES),
  generatedAt: instant,
}).strict();
const check = z.object({ checkedAt: instant, status: z.enum(["published", "unavailable", "failed"]) }).strict();
export const dailyManifestSchema = z.object({
  schemaVersion: z.literal(1), updatedAt: instant,
  datasets: z.object({ officiating: entry.optional(), shooting: entry.optional(), shotQuality: entry.optional() }).strict(),
  checks: z.object({ officiating: check.optional(), shooting: check.optional(), shotQuality: check.optional() }).strict(),
}).strict().superRefine((value, context) => {
  for (const name of DAILY_DATASETS) {
    const row = value.datasets[name];
    if (row && row.path !== `blobs/${name}-${row.sha256}.json`) {
      context.addIssue({ code: "custom", message: "Publication path differs from its content hash" });
    }
    if (row && Date.parse(row.generatedAt) > Date.parse(value.updatedAt)) {
      context.addIssue({ code: "custom", message: "Publication precedes its snapshot" });
    }
    const state = value.checks[name];
    if (state && Date.parse(state.checkedAt) > Date.parse(value.updatedAt)) {
      context.addIssue({ code: "custom", message: "Check instant follows its manifest" });
    }
    if (state?.status === "published" && !row) {
      context.addIssue({ code: "custom", message: "Published check has no snapshot" });
    }
  }
});
export type DailyManifest = z.infer<typeof dailyManifestSchema>;
export interface DailyDatasetResult {
  data: unknown | null;
  hash: string | null;
  checkedAt: string | null;
  publishedAt: string | null;
  status: "published" | "unavailable" | "failed" | "bundled";
}
