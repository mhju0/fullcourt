/**
 * Hold an expensive read until the rows behind it change.
 *
 * Several modules read a whole population with no LIMIT — every final game for the
 * backtest, every game in a season for the Season Report — and reduce it in JS. None
 * of them can be re-read per request, and none of them can be held forever. The shape
 * that solves it is always the same: read a cheap stamp of the population, compare it
 * to the stamp the held value was built from, and reload only on a mismatch.
 *
 * That shape was written out per module, and the one invariant it carries did not
 * survive the copying: **a stamp must cover exactly the population its loader reads.**
 * The Season Report was keyed on a stamp that counted only final games while its query
 * read scheduled ones too, so from the 1 October season-list rollover until opening
 * night the stamp could not move and `/season` served `0 / 0` off a cache that could
 * not invalidate. Fixed in `1700181`, by adding a second stamp rather than a seam.
 *
 * Here `readStamp` and `load` are supplied together, at one call site, as one argument.
 * They can still disagree — no type can know what SQL a function runs — but they can no
 * longer drift apart unnoticed, because pairing them is now the only way to build a cache.
 *
 * The stamp is read per key, which covers both existing policies. A stamp that ignores
 * its key is global, and a moved global stamp invalidates every entry, one at a time as
 * each is next asked for. A stamp computed from its key invalidates that entry alone.
 */

export type StampedCacheOptions<Key extends string | number, Value> = {
  /**
   * A cheap stand-in for "have the rows `load` reads changed?" — an index scan, not the
   * read itself. Must cover the same population as `load`, neither wider nor narrower.
   * Ignore the key for a population that is not per-key.
   */
  readStamp: (key: Key) => Promise<string>;

  /** The expensive read, run only when the stamp has moved. */
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

/**
 * Returns the read function. The cache is closed over, so one call per module at import
 * time gives that module its own state — the same lifetime the hand-written caches had.
 */
export function createStampedCache<Key extends string | number, Value>({
  readStamp,
  load,
  maxEntries,
}: StampedCacheOptions<Key, Value>): (key: Key) => Promise<Value> {
  const held = new Map<Key, { stamp: string; value: Value }>();

  return async function read(key: Key): Promise<Value> {
    const stamp = await readStamp(key);
    const hit = held.get(key);
    if (hit !== undefined && hit.stamp === stamp) return hit.value;

    const value = await load(key);

    // Cleared rather than evicted one-by-one: there is no recency to rank entries by that
    // is cheaper than the read they save, and a global stamp moving makes every held entry
    // stale at once anyway. The cost of being wrong is one extra read.
    if (maxEntries !== undefined && held.size >= maxEntries) held.clear();
    held.set(key, { stamp, value });

    return value;
  };
}
