/**
 * Hold an expensive read until the rows behind it change.
 *
 * The stamp must cover the loader's population, including scheduled games for season
 * reports. Every request checks it; concurrent reads of the same key and stamp share
 * one load. Failed loads are discarded so the next request can retry.
 */

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
};

export function createStampedCache<Key extends string | number, Value>({
  readStamp,
  load,
  maxEntries,
}: StampedCacheOptions<Key, Value>): (key: Key) => Promise<Value> {
  const held = new Map<Key, { stamp: string; value: Promise<Value> }>();

  return async function read(key: Key): Promise<Value> {
    const stamp = await readStamp(key);
    const hit = held.get(key);
    if (hit !== undefined && hit.stamp === stamp) return hit.value;

    const entry = { stamp, value: load(key) };
    if (maxEntries !== undefined && !held.has(key) && held.size >= maxEntries) held.clear();
    held.set(key, entry);

    try {
      return await entry.value;
    } catch (error) {
      // An older request must not evict a newer stamp's entry when it finishes late.
      if (held.get(key) === entry) held.delete(key);
      throw error;
    }
  };
}
