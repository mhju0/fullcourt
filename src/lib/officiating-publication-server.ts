import bundled from "@/data/officiating.json";
import { readDailyDataset, readDailyDatasetHistory } from "@/lib/daily-publication-server";
import { mergeOfficiatingSeasons, parseOfficiatingSnapshot } from "@/lib/officiating-publication";
import type { ReviewSeason } from "@/lib/officiating";

export async function loadOfficiatingPublication(hash?: string) {
  const results = hash ? [await readDailyDataset("officiating", hash)] : await readDailyDatasetHistory("officiating");
  const publication = results.at(-1)!;
  let seasons: ReviewSeason[] = [...bundled.seasons as ReviewSeason[]];
  const hashes = new Map<string, string>();
  let snapshot: ReturnType<typeof parseOfficiatingSnapshot> = null;
  let rejected = false;
  for (const result of results) {
    const candidate = parseOfficiatingSnapshot(result.data);
    const parsed = candidate &&
      (!result.season || candidate.season.season === result.season) &&
      (result.publishedAt === null || Date.parse(candidate.generatedAt) === Date.parse(result.publishedAt))
      ? candidate : null;
    const next = hash && parsed && result.hash === hash
      ? [...seasons.filter((s) => s.season !== parsed.season.season), parsed.season].sort((a, b) => a.season.localeCompare(b.season))
      : mergeOfficiatingSeasons(seasons, parsed);
    const accepted = parsed && next.some((s) => s === parsed.season);
    if (accepted) {
      seasons = next;
      snapshot = parsed;
      if (result.hash) hashes.set(parsed.season.season, result.hash);
    } else if (result.hash !== null || result.status === "failed") rejected = true;
  }
  const accepted = snapshot !== null;
  return {
    seasons: seasons.map((s) => hashes.has(s.season) ? { ...s, publicationHash: hashes.get(s.season) } : s),
    snapshot: accepted ? snapshot : null,
    publication: { ...publication, data: undefined, status: rejected || publication.hash !== null && !accepted ? "failed" as const : publication.status },
  };
}
