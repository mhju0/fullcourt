import { and, between, eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { games } from "@/lib/db/schema";

/**
 * Which games backfill_fatigue.ts may score. Final games only: its prior-game basis is "played",
 * so an unplayed game would come back as a measured 0.0 (scripts/project_fatigue.ts owns those).
 * Without --force, a game is a gap when either side's row is missing.
 */
export function backfillGameFilter(opts: {
  force: boolean;
  start?: string;
  end?: string;
  homeFatigueId: AnyPgColumn;
  awayFatigueId: AnyPgColumn;
}): SQL {
  const final = eq(games.status, "final");
  if (opts.force) return final;
  const gap = or(isNull(opts.homeFatigueId), isNull(opts.awayFatigueId));
  const range = opts.start && opts.end ? between(games.date, opts.start, opts.end) : undefined;
  return and(final, gap, range)!;
}
