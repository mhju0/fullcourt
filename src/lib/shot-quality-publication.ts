import { z } from "zod";
import { formatEasternDateKey } from "@/lib/nba-season";
import currentArtifact from "@/data/shot-quality-current.json";
import type { CurrentShotQualitySnapshot, ShotQualityCell, ShotQualityPublication } from "@/types";

const count = z.number().int().nonnegative();
const cellFields = {
  cellX: z.number().int().min(-25).max(24), cellY: z.number().int().min(-5).max(41),
  zoneBasic: z.string().nullable(), zoneRange: z.string().nullable(), zoneArea: z.string().nullable(),
  fga: count.positive(), fgm: count, fg3a: count, fg3m: count,
  gbm: z.null(), baseline: z.null(),
};
const validCellCounts = (c: ShotQualityCell) => c.fgm <= c.fga && c.fg3a <= c.fga && c.fg3m <= c.fgm && c.fg3m <= c.fg3a;
const cellSchema = z.object(cellFields).refine(validCellCounts);
const dateKey = z.iso.date().refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const sourceFields = {
  fetchedAt: z.iso.datetime({ offset: true }),
  firstGameDate: dateKey, lastGameDate: dateKey,
  gameIds: z.array(z.string().regex(/^002\d{7}$/)).min(1), shotCount: count.positive(),
  droppedNoLocation: count, droppedOutsideHalfCourt: count,
};
const snapshotFields = {
  season: z.string().regex(/^\d{4}-\d{2}$/), generatedAt: z.iso.datetime({ offset: true }),
};
const validSnapshot = (s: CurrentShotQualitySnapshot) => s.source.firstGameDate <= s.source.lastGameDate
  && Number(s.season.slice(-2)) === (Number(s.season.slice(0, 4)) + 1) % 100
  && s.source.gameIds.every(id => id.startsWith(`002${s.season.slice(2, 4)}`))
  && s.source.firstGameDate >= `${s.season.slice(0, 4)}-10-01`
  && s.source.lastGameDate < `${Number(s.season.slice(0, 4)) + 1}-10-01`
  && Date.parse(s.generatedAt) <= Date.now() + 300_000
  && Date.parse(s.source.fetchedAt) <= Date.parse(s.generatedAt)
  && s.source.lastGameDate <= formatEasternDateKey(new Date(s.source.fetchedAt))
  && new Set(s.source.gameIds).size === s.source.gameIds.length
  && new Set(s.cells.map(c => `${c.cellX}:${c.cellY}`)).size === s.cells.length
  && s.cells.reduce((n, c) => n + c.fga, 0) + s.source.droppedNoLocation + s.source.droppedOutsideHalfCourt === s.source.shotCount;
const snapshotSchema = z.object({
  ...snapshotFields,
  source: z.object({
    ...sourceFields,
    provider: z.literal("NBA Stats ShotChartDetail"), url: z.url().refine(value => { const url = new URL(value); return url.origin === "https://stats.nba.com" && url.pathname === "/stats/shotchartdetail"; }),
  }),
  cells: z.array(cellSchema).min(1),
}).refine(validSnapshot);
const webSnapshotSchema = z.strictObject({
  ...snapshotFields,
  source: z.strictObject({
    ...sourceFields,
    provider: z.literal("NBA.com play-by-play"), url: z.literal("https://www.nba.com/games"),
    collectionStartedAt: z.iso.datetime({ offset: true }), teamFieldGoalAttempts: count,
    formatGameCounts: z.strictObject({ hanaV3: count, ngss: count }),
  }),
  cells: z.array(z.strictObject({
    ...cellFields, zoneBasic: z.null(), zoneRange: z.null(), zoneArea: z.null(),
  }).refine(validCellCounts)).min(1),
}).refine(validSnapshot).refine(s => Date.parse(s.source.collectionStartedAt) <= Date.parse(s.source.fetchedAt)
  && s.source.teamFieldGoalAttempts <= s.source.droppedNoLocation
  && s.source.formatGameCounts.hanaV3 + s.source.formatGameCounts.ngss === s.source.gameIds.length
  && (s.source.droppedNoLocation + s.source.droppedOutsideHalfCourt) * 100 <= s.source.shotCount * 2);

export function parseCurrentShotQualityArtifact(artifact: unknown): CurrentShotQualitySnapshot | null {
  const parsed = z.union([
    z.object({ schemaVersion: z.literal(1), snapshot: snapshotSchema.nullable() }),
    z.strictObject({ schemaVersion: z.literal(2), snapshot: webSnapshotSchema.nullable() }),
  ]).safeParse(artifact);
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
    source: snapshot ? snapshot.source.provider === "NBA.com play-by-play" ? "nba-web-snapshot" : "nba-stats-snapshot" : "database",
    generatedAt: snapshot?.generatedAt ?? null,
    firstGameDate: snapshot?.source.firstGameDate ?? null,
    lastGameDate: snapshot?.source.lastGameDate ?? null,
    gameCount: snapshot?.source.gameIds.length ?? null,
    sourceShotCount: snapshot?.source.shotCount ?? null,
    droppedShotCount: snapshot ? snapshot.source.droppedNoLocation + snapshot.source.droppedOutsideHalfCourt : null,
    models: { "gbm-v1": coverage("gbm"), "baseline-zone-v1": coverage("baseline") },
  };
}
