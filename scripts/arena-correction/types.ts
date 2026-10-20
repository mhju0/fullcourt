import type { Row, Snapshot } from '../history-correction/core';
export type { Row, Snapshot };

export interface FileBinding { path: string; sha256: string }
export interface SourceClosure { root: string; entry: string; files: Record<string, string> }
export interface SourceProof {
  kind: 'arena-source-proof'; version: 1;
  baselineCommit: string;
  baselineSnapshotCanonicalHash: string;
  independentReplay: FileBinding;
  followThrough: FileBinding;
  baselineCapture: FileBinding;
  geometrySources: Record<string, string>;
  evidence: FileBinding[];
}
export interface BaselineEvidence {
  kind: 'arena-baseline'; version: 1; capturedAt: string;
  databaseTimeZone: string; sixTableHash: string; semanticInputHash: string;
  sides: number; differences: 0; replayRowsHash: string;
  oldCommit: string; oldSources: SourceClosure;
  sourceProofSha256: string;
  captureTargetFingerprint: string;
  rowCounts: Record<string, number>;
  futureForecastConsistency: ForecastConsistency;
}
export interface ForecastDelta { inserted: Row[]; updated: { before: Row; after: Row }[]; deleted: Row[] }
export interface ForecastConsistency { eligibleGames: number; existingCalls: number; expectedCalls: number; inserted: number; updated: number; deleted: number }
export interface TransitionReport {
  scoredSides: number;
  fatigueChanges: { id: number; gameId: number; fields: string[] }[];
  affectedSeasons: string[];
  conferenceChanges: { id: number; externalSeriesKey: string; before: null; after: 'East' }[];
  forecastChanges: ForecastDelta;
  resolvedPredictionHash: string;
  preservedUnresolvedHash: string;
  preservedPlayoffPredictionHash: string;
  oldForecastConsistency: ForecastConsistency;
}
export interface Manifest {
  kind: 'arena-correction'; version: 1;
  createdAt: string; asOf: string; computedAt: string; databaseTimeZone: string;
  targetFingerprint: string;
  beforeHash: string; afterHash: string;
  before: Snapshot; after: Snapshot;
  baseline: BaselineEvidence; baselineEvidence: FileBinding;
  sourceProof: FileBinding; sourceProofSha256: string;
  newSources: SourceClosure; toolSources: SourceClosure;
  report: TransitionReport;
}
