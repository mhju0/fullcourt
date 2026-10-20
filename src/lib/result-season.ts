/** Publication is module-specific; only the current regular season also needs the GP gate. */
export function latestUsableResultSeason(
  publishedSeasons: readonly string[],
  currentSeason: string,
  currentReady: boolean,
): string | null {
  return publishedSeasons
    .filter((season) => season < currentSeason || (season === currentSeason && currentReady))
    .sort()
    .at(-1) ?? null;
}

export interface SeasonReportPublication {
  seasons: string[];
}
