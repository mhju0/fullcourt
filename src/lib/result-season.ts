/** Publication is module-specific; callers may impose a separate model-readiness constraint. */
export function latestUsableResultSeason(
  publishedSeasons: readonly string[],
  currentSeason: string,
  currentReady = true,
): string | null {
  return publishedSeasons
    .filter((season) => season < currentSeason || (season === currentSeason && currentReady))
    .sort()
    .at(-1) ?? null;
}

export interface SeasonReportPublication {
  seasons: string[];
}
