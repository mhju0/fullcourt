import historical from "../../public/data/player-rest.json";
import bundledCurrent from "@/data/shooting-current.json";
import { readDailyDataset } from "@/lib/daily-publication-server";
import { mergeHistoricalAndCurrent, selectCurrentShooting } from "@/lib/player-rest-publication";
import { defaultNbaSeason } from "@/lib/nba-season";
import type { PlayerRestPayload } from "@/lib/player-rest";

export async function loadPlayerRestPublication(): Promise<PlayerRestPayload> {
  const daily = await readDailyDataset("shooting");
  const { current, rejected } = selectCurrentShooting(daily.data, bundledCurrent, defaultNbaSeason());
  const baseline = historical as PlayerRestPayload;
  const payload = current ? mergeHistoricalAndCurrent(baseline, current) : baseline;
  return { ...payload, refresh: { checkedAt: daily.checkedAt, status: rejected ? "failed" : daily.status, publishedAt: daily.publishedAt } };
}
