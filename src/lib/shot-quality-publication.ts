import { z } from "zod";
import currentArtifact from "@/data/shot-quality-current.json";
import type { CurrentShotQualitySnapshot, ShotQualityCell, ShotQualityPublication } from "@/types";

const count = z.number().int().nonnegative();
const cellSchema = z.object({
  cellX: z.number().int().min(-25).max(24), cellY: z.number().int().min(-5).max(41),
  zoneBasic: z.string().nullable(), zoneRange: z.string().nullable(), zoneArea: z.string().nullable(),
  fga: count.positive(), fgm: count, fg3a: count, fg3m: count,
  gbm: z.null(), baseline: z.null(),
}).refine(c => c.fgm <= c.fga && c.fg3a <= c.fga && c.fg3m <= c.fgm && c.fg3m <= c.fg3a);
const dateKey = z.iso.date();
const snapshotSchema = z.object({
  season: z.string().regex(/^\d{4}-\d{2}$/), generatedAt: z.iso.datetime({ offset: true }),
  source: z.object({
    provider: z.literal("NBA Stats ShotChartDetail"), url: z.url().refine(value => { const url = new URL(value); return url.origin === "https://stats.nba.com" && url.pathname === "/stats/shotchartdetail"; }), fetchedAt: z.iso.datetime({ offset: true }),
    firstGameDate: dateKey, lastGameDate: dateKey,
    gameIds: z.array(z.string().regex(/^002\d{7}$/)).min(1), shotCount: count.positive(),
    droppedNoLocation: count, droppedOutsideHalfCourt: count,
  }),
  cells: z.array(cellSchema).min(1),
}).refine(s => s.source.firstGameDate <= s.source.lastGameDate
  && Number(s.season.slice(-2)) === (Number(s.season.slice(0, 4)) + 1) % 100
  && s.source.gameIds.every(id => id.startsWith(`002${s.season.slice(2, 4)}`))
  && s.source.firstGameDate >= `${s.season.slice(0, 4)}-10-01`
  && s.source.lastGameDate < `${Number(s.season.slice(0, 4)) + 1}-10-01`
  && Date.parse(s.generatedAt) <= Date.now() + 300_000
  && Date.parse(s.source.fetchedAt) <= Date.parse(s.generatedAt)
  && new Set(s.source.gameIds).size === s.source.gameIds.length
  && new Set(s.cells.map(c => `${c.cellX}:${c.cellY}`)).size === s.cells.length
  && s.cells.reduce((n, c) => n + c.fga, 0) + s.source.droppedNoLocation + s.source.droppedOutsideHalfCourt === s.source.shotCount);

export function parseCurrentShotQualityArtifact(artifact: unknown): CurrentShotQualitySnapshot | null {
  const parsed = z.object({ schemaVersion: z.literal(1), snapshot: snapshotSchema.nullable() }).safeParse(artifact);
  return parsed.success ? parsed.data.snapshot : null;
}

export function getCurrentShotQualitySnapshot(): CurrentShotQualitySnapshot | null {
  return parseCurrentShotQualityArtifact(currentArtifact);
}

export function shotQualityPublication(cells: readonly ShotQualityCell[], snapshot?: CurrentShotQualitySnapshot | null): ShotQualityPublication {
  const positiveCells = cells.filter(c => c.fga > 0);
  function coverage(key: "gbm" | "baseline") {
    const coveredCells = positiveCells.filter(c => {
      const v = c[key];
      return v !== null && Number.isFinite(v.pMake) && v.pMake >= 0 && v.pMake <= 1
        && Number.isFinite(v.expectedEfg) && v.expectedEfg >= 0 && v.expectedEfg <= 1.5
        && Number.isFinite(v.xpps) && v.xpps >= 0 && v.xpps <= 3;
    }).length;
    return { coveredCells, totalCells: positiveCells.length, ready: positiveCells.length > 0 && coveredCells === positiveCells.length, trainingPeriod: null };
  }
  return {
    source: snapshot ? "nba-stats-snapshot" : "database",
    generatedAt: snapshot?.generatedAt ?? null,
    firstGameDate: snapshot?.source.firstGameDate ?? null,
    lastGameDate: snapshot?.source.lastGameDate ?? null,
    gameCount: snapshot?.source.gameIds.length ?? null,
    sourceShotCount: snapshot?.source.shotCount ?? null,
    droppedShotCount: snapshot ? snapshot.source.droppedNoLocation + snapshot.source.droppedOutsideHalfCourt : null,
    models: { "gbm-v1": coverage("gbm"), "baseline-zone-v1": coverage("baseline") },
  };
}
