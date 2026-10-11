import { afterEach, describe, expect, it, vi } from "vitest";
import { createSlateRefresh, shouldRefreshSlate } from "@/lib/slate-refresh";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
afterEach(() => vi.useRealTimers());

describe("authoritative selected-slate requests", () => {
  it("debounces events, coalesces in-flight invalidations, and fetches fatigue with scores", async () => {
    vi.useFakeTimers();
    const first = deferred<{ score: number; fatigue: number }>();
    const updated = { score: 108, fatigue: 4.2 };
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(updated);
    const resolved = vi.fn();
    const owner = createSlateRefresh({ load, resolved, rejected: vi.fn() });
    owner.refresh(); owner.refresh(); owner.refresh();
    await vi.advanceTimersByTimeAsync(250);
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve({ score: 0, fatigue: 2.1 });
    await vi.advanceTimersByTimeAsync(250);
    expect(load).toHaveBeenCalledTimes(2);
    expect(resolved).toHaveBeenLastCalledWith(updated);
    owner.dispose();
  });

  it("bounds a hung fetch, retains existing data, and can retry after the timeout", async () => {
    vi.useFakeTimers();
    const hung = deferred<number>();
    const rejected = vi.fn();
    const resolved = vi.fn();
    const load = vi.fn().mockReturnValueOnce(hung.promise).mockResolvedValueOnce(2);
    const owner = createSlateRefresh({ load, resolved, rejected, hasData: true, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ message: "Request timed out. Try again." }), true);
    owner.refresh(); await vi.advanceTimersByTimeAsync(250);
    expect(resolved).toHaveBeenLastCalledWith(2);
    hung.resolve(1); await hung.promise;
    expect(resolved).toHaveBeenCalledOnce();
    owner.dispose();
  });

  it("rejects disposed requests even if their transport ignores AbortSignal", async () => {
    const old = deferred<number>();
    const resolved = vi.fn();
    const owner = createSlateRefresh({ load: () => old.promise, resolved, rejected: vi.fn() });
    owner.dispose();
    old.resolve(1);
    await old.promise;
    expect(resolved).not.toHaveBeenCalled();
  });

  it("distinguishes initial failure from quiet failure after data has been received", async () => {
    vi.useFakeTimers();
    const error = new Error("offline");
    const rejected = vi.fn();
    const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(1).mockRejectedValueOnce(error);
    const owner = createSlateRefresh({ load, resolved: vi.fn(), rejected });
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenLastCalledWith(error, false);
    owner.refresh(); await vi.advanceTimersByTimeAsync(250);
    owner.refresh(); await vi.advanceTimersByTimeAsync(250);
    expect(rejected).toHaveBeenLastCalledWith(error, true);
    owner.dispose();
  });
});


describe("visible Games polling relevance", () => {
  const args = { selectedDate: "2026-10-20", today: "2026-10-20", games: [{ status: "final" }], visible: true, online: true };
  it("refreshes today's completed slate and a future scheduled slate", () => {
    expect(shouldRefreshSlate(args)).toBe(true);
    expect(shouldRefreshSlate({ ...args, selectedDate: "2026-10-21", games: [{ status: "scheduled" }] })).toBe(true);
    expect(shouldRefreshSlate({ ...args, selectedDate: "2026-10-21", games: [] })).toBe(true);
  });
  it("skips hidden, offline, and historical complete slates", () => {
    expect(shouldRefreshSlate({ ...args, visible: false })).toBe(false);
    expect(shouldRefreshSlate({ ...args, online: false })).toBe(false);
    expect(shouldRefreshSlate({ ...args, selectedDate: "2026-10-19" })).toBe(false);
  });
});
