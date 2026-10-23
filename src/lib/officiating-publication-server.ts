import bundled from "@/data/officiating.json";
import { readDailyDataset } from "@/lib/daily-publication-server";
import { mergeOfficiatingSeasons, parseOfficiatingSnapshot } from "@/lib/officiating-publication";
import type { ReviewSeason } from "@/lib/officiating";

export async function loadOfficiatingPublication(hash?: string) {
  const publication = await readDailyDataset("officiating", hash);
  const snapshot = parseOfficiatingSnapshot(publication.data);
  const seasons: ReviewSeason[] = hash && snapshot && publication.hash === hash
    ? [...(bundled.seasons as ReviewSeason[]).filter((s) => s.season !== snapshot.season.season), snapshot.season].sort((a, b) => a.season.localeCompare(b.season))
    : mergeOfficiatingSeasons(bundled.seasons as ReviewSeason[], snapshot);
  const accepted = snapshot && seasons.some((s) => s === snapshot.season);
  return {
    seasons: seasons.map((s) => accepted && s === snapshot.season ? { ...s, publicationHash: publication.hash ?? undefined } : s),
    snapshot: accepted ? snapshot : null,
    publication: { ...publication, data: undefined, status: publication.hash !== null && !accepted ? "failed" as const : publication.status },
  };
}
