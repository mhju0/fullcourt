/**
 * The stamp-then-load protocol, tested once instead of once per module that holds a
 * population it cannot re-read per request.
 *
 * These need no `vi.resetModules()` harness: each `createStampedCache` call closes over
 * its own state, so a test can have a fresh cache by asking for one. The two modules that
 * hand-rolled this each carried that harness, and the comment explaining it, verbatim.
 */
import { describe, expect, it, vi } from "vitest";
import { createStampedCache } from "@/lib/stamped-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createStampedCache", () => {
  it("shares an in-flight load for concurrent reads of the same key and stamp", async () => {
    const pending = deferred<object>();
    const load = vi.fn(() => pending.promise);
    const read = createStampedCache({ readStamp: async () => "a", load });
    const reads = Array.from({ length: 4 }, () => read("k"));
    await Promise.resolve();
    const calls = load.mock.calls.length;
    const value = {};
    pending.resolve(value);

    expect(await Promise.all(reads)).toEqual([value, value, value, value]);
    expect(calls).toBe(1);
  });

  it("does not let a late old load replace a newer stamp's value", async () => {
    const old = deferred<number>();
    let stamp = "a";
    const load = vi.fn<() => Promise<number>>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue(2);
    const read = createStampedCache({ readStamp: async () => stamp, load });
    const first = read("k");
    await Promise.resolve();
    stamp = "b";
    expect(await read("k")).toBe(2);
    old.resolve(1);
    expect(await first).toBe(1);

    expect(await read("k")).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the newer value when an older load rejects", async () => {
    const old = deferred<number>();
    let stamp = "a";
    const load = vi.fn<() => Promise<number>>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue(2);
    const read = createStampedCache({ readStamp: async () => stamp, load });
    const first = read("k");
    const rejected = expect(first).rejects.toThrow("old read failed");
    await Promise.resolve();
    stamp = "b";
    expect(await read("k")).toBe(2);
    old.reject(new Error("old read failed"));
    await rejected;

    expect(await read("k")).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares failures without caching them, so the next read can recover", async () => {
    const load = vi.fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(7);
    const read = createStampedCache({ readStamp: async () => "a", load });
    const results = await Promise.allSettled([read("k"), read("k")]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(await read("k")).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("refreshes an existing key at capacity without evicting another key", async () => {
    const stamps: Record<string, string> = { a: "1", b: "1" };
    const load = vi.fn(async () => ({}));
    const read = createStampedCache({
      readStamp: async (key: string) => stamps[key], load, maxEntries: 2,
    });
    await read("a");
    const second = await read("b");
    stamps.a = "2";
    await read("a");

    expect(await read("b")).toBe(second);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("loads once while the stamp is unchanged", async () => {
    const load = vi.fn(async (key: string) => ({ key }));
    const read = createStampedCache({ readStamp: async () => "a", load });

    const first = await read("2025-26");
    const second = await read("2025-26");

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("checks the stamp on every read, so a change is never missed", async () => {
    const readStamp = vi.fn(async () => "a");
    const read = createStampedCache({ readStamp, load: async () => 1 });

    await read("k");
    await read("k");

    expect(readStamp).toHaveBeenCalledTimes(2);
  });

  it("reloads once the stamp moves", async () => {
    const load = vi.fn(async () => ({}));
    const readStamp = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");
    const read = createStampedCache({ readStamp, load });

    await read("k");
    await read("k");

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("holds each key separately rather than serving one key's value for another", async () => {
    const load = vi.fn(async (key: number) => ({ key }));
    const read = createStampedCache({ readStamp: async () => "a", load });

    const zero = await read(0);
    const five = await read(5);

    expect(five).not.toBe(zero);
    expect(await read(0)).toBe(zero);
    expect(load).toHaveBeenCalledTimes(2);
  });

  /**
   * A per-key stamp is the general case: the backtest's stamp ignores its key, so one
   * moved stamp must invalidate every held threshold, not only the one asked for.
   */
  it("invalidates every key when a key-independent stamp moves", async () => {
    let stamp = "a";
    const load = vi.fn(async (key: number) => ({ key }));
    const read = createStampedCache({ readStamp: async () => stamp, load });

    await read(0);
    await read(5);
    expect(load).toHaveBeenCalledTimes(2);

    stamp = "b";
    await read(0);
    await read(5);

    expect(load).toHaveBeenCalledTimes(4);
  });

  /** A per-key stamp moving must leave the other keys held. */
  it("invalidates only the key whose own stamp moved", async () => {
    const stamps: Record<string, string> = { "2025-26": "a", "2026-27": "a" };
    const load = vi.fn(async (season: string) => ({ season }));
    const read = createStampedCache({
      readStamp: async (season: string) => stamps[season],
      load,
    });

    const current = await read("2025-26");
    await read("2026-27");

    stamps["2026-27"] = "b";
    await read("2026-27");

    expect(await read("2025-26")).toBe(current);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("bounds the held keys when a cap is given", async () => {
    const load = vi.fn(async (key: number) => ({ key }));
    const read = createStampedCache({
      readStamp: async () => "a",
      load,
      maxEntries: 4,
    });

    for (let i = 0; i < 5; i++) await read(i);

    // The fifth entry cleared the four before it, so the first is gone and reloads.
    const before = load.mock.calls.length;
    await read(0);

    expect(load.mock.calls.length).toBe(before + 1);
  });

  it("holds every key when no cap is given", async () => {
    const load = vi.fn(async (key: number) => ({ key }));
    const read = createStampedCache({ readStamp: async () => "a", load });

    for (let i = 0; i < 40; i++) await read(i);
    for (let i = 0; i < 40; i++) await read(i);

    expect(load).toHaveBeenCalledTimes(40);
  });

  it("does not hold a value the loader never produced", async () => {
    const load = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("DATABASE_URL is not set"))
      .mockResolvedValueOnce(7);
    const read = createStampedCache({ readStamp: async () => "a", load });

    await expect(read("k")).rejects.toThrow("DATABASE_URL is not set");

    expect(await read("k")).toBe(7);
  });
});
