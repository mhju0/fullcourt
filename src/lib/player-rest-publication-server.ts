import historical from "../../public/data/player-rest.json";
import bundledCurrent from "@/data/shooting-current.json";
import { readDailyDatasetHistory } from "@/lib/daily-publication-server";
import { mergeHistoricalAndCurrent, parseCurrentShooting, selectShootingHistory } from "@/lib/player-rest-publication";
import { defaultNbaSeason } from "@/lib/nba-season";
import type { PlayerRestPayload } from "@/lib/player-rest";
import type { DailyDatasetResult } from "@/lib/daily-publication";

export async function loadPlayerRestPublication(): Promise<PlayerRestPayload> {
  const failed: DailyDatasetResult = { data: null, hash: null, checkedAt: null, publishedAt: null, status: "failed" };
  const history = await readDailyDatasetHistory("shooting").catch(() => [failed]);
  const latest = history.at(-1);
  let rejectedReference = false;
  const publications = history.map(entry => {
    if (entry.data != null && entry.season !== undefined && parseCurrentShooting(entry.data)?.publication?.season !== entry.season) {
      rejectedReference = true;
      return null;
    }
    return entry.data;
  });
  const selected = selectShootingHistory(publications, bundledCurrent, defaultNbaSeason());
  let payload = historical as PlayerRestPayload;
  for (const publication of selected.publications) payload = mergeHistoricalAndCurrent(payload, publication);
  return { ...payload, refresh: {
    checkedAt: latest?.checkedAt ?? null,
    status: selected.rejected || rejectedReference || history.some(entry => entry.status === "failed") ? "failed" : latest?.status ?? "bundled",
    publishedAt: latest?.publishedAt ?? null,
  } };
}
