import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function contextExitCode(counts: { dateErrors: number; unmatched: number }): number {
  return counts.dateErrors > 0 || counts.unmatched > 0 ? 2 : 0;
}

export function writeStageSummary(stage: "scores" | "context" | "fatigue" | "predictions", counts: Record<string, number>): void {
  const directory = process.env.DAILY_STAGE_SUMMARY_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const safe = Object.fromEntries(Object.entries(counts).filter(([, value]) => Number.isSafeInteger(value) && value >= 0));
  writeFileSync(join(directory, `${stage}.json`), JSON.stringify(safe));
}
