/**
 * Hold an expensive read until the rows behind it change.
 *
 * The stamp must cover the loader's population, including scheduled games for season
 * reports. Every request checks it; concurrent reads of the same key and stamp share
 * one load. Max age also limits changes the stamp cannot see. Failed or timed-out
 * loads are discarded so the next request can retry.
 */

import { currentDisplaySeason } from "@/lib/nba-season";

export const ORIGIN_CACHE_MAX_AGE = { inSeason: 300_000, historical: 3_600_000 } as const;

export function seasonCacheMaxAgeMs(season: string): number {
  return season >= currentDisplaySeason()
    ? ORIGIN_CACHE_MAX_AGE.inSeason
    : ORIGIN_CACHE_MAX_AGE.historical;
}

export type StampedCacheOptions<Key extends string | number, Value> = {
  /**
   * A cheap stand-in for "have the rows `load` reads changed?" — an index scan, not the
   * read itself. Must cover the same population as `load`, neither wider nor narrower.
   * Ignore the key for a population that is not per-key.
   */
  readStamp: (key: Key) => Promise<string>;

  /** The expensive read, run on a cache miss or a changed stamp. */
  load: (key: Key) => Promise<Value>;

  /**
   * Cap on held keys, evicted wholesale on the entry that would exceed it.
   *
   * Required whenever the key arrives from a query string, where the caller does not
   * choose how many distinct keys exist. Omit only when the key set is closed and small
   * — the season list, not a threshold a reader can type.
   */
  maxEntries?: number;

  /** Absolute lifetime from loader start; hits and completion do not extend it. */
  maxAgeMs?: number | ((key: Key) => number);
  /** Bounds waiting, but cannot cancel a loader that does not support cancellation. */
  loadTimeoutMs?: number;
  now?: () => number;
};

export function createStampedCache<Key extends string | number, Value>({
  readStamp,
  load,
  maxEntries,
  maxAgeMs = ORIGIN_CACHE_MAX_AGE.inSeason,
  loadTimeoutMs = 30_000,
  now = () => performance.now(),
}: StampedCacheOptions<Key, Value>): (key: Key) => Promise<Value> {
  const held = new Map<Key, {
    stamp: string; value: Promise<Value>; startedAt: number; pending: boolean;
  }>();

  return async function read(key: Key): Promise<Value> {
    const stamp = await readStamp(key);
    const hit = held.get(key);
    const maxAge = typeof maxAgeMs === "function" ? maxAgeMs(key) : maxAgeMs;
    if (hit !== undefined && hit.stamp === stamp &&
      (hit.pending || now() - hit.startedAt < maxAge)) return hit.value;

    const startedAt = now();
    let timer: ReturnType<typeof setTimeout>;
    const value = Promise.race([
      load(key),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Stamped cache load timed out")), loadTimeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    const entry = { stamp, value, startedAt, pending: true };
    if (maxEntries !== undefined && !held.has(key) && held.size >= maxEntries) held.clear();
    held.set(key, entry);

    try {
      return await entry.value;
    } catch (error) {
      // An older request must not evict a newer stamp's entry when it finishes late.
      if (held.get(key) === entry) held.delete(key);
      throw error;
    } finally {
      entry.pending = false;
    }
  };
}
