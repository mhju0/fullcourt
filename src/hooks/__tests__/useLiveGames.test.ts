import { describe, expect, it, vi } from "vitest";
import { useLiveGames } from "@/hooks/useLiveGames";

const mocks = vi.hoisted(() => ({ callback: null as null | ((payload: { new: { id: number } }) => void), cleanup: null as null | (() => void), unsubscribe: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effect: () => (() => void) | undefined) => { mocks.cleanup = effect() ?? null; } }));
vi.mock("@/lib/supabase", () => ({ getSupabaseBrowser: () => ({ channel: () => ({ on: (_kind: string, _filter: object, callback: typeof mocks.callback) => { mocks.callback = callback; return { subscribe: () => ({ unsubscribe: mocks.unsubscribe }) }; } }) }) }));

describe("Realtime authoritative slate invalidation", () => {
  it("invalidates only tracked games and rejects callbacks after disposal", () => {
    const invalidate = vi.fn();
    useLiveGames([10, 11], invalidate);
    mocks.callback?.({ new: { id: 99 } });
    expect(invalidate).not.toHaveBeenCalled();
    mocks.callback?.({ new: { id: 10 } });
    expect(invalidate).toHaveBeenCalledOnce();
    mocks.cleanup?.();
    mocks.callback?.({ new: { id: 10 } });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
