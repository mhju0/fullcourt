import { describe, expect, it, vi } from "vitest";
import { useLiveGames } from "@/hooks/useLiveGames";

const mocks = vi.hoisted(() => ({ callback: null as null | ((payload: { new: { id: number } }) => void), filter: null as null | object, cleanup: null as null | (() => void), unsubscribe: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effect: () => (() => void) | undefined) => { mocks.cleanup = effect() ?? null; } }));
vi.mock("@/lib/supabase", () => ({ getSupabaseBrowser: async () => ({ channel: () => ({ on: (_kind: string, filter: object, callback: typeof mocks.callback) => { mocks.filter = filter; mocks.callback = callback; return { subscribe: () => ({ unsubscribe: mocks.unsubscribe }) }; } }) }) }));

describe("Realtime authoritative slate invalidation", () => {
  it("invalidates only tracked games and rejects callbacks after disposal", async () => {
    const invalidate = vi.fn();
    useLiveGames([10, 11], invalidate);
    await vi.waitFor(() => expect(mocks.callback).not.toBeNull());
    // The server filters to the slate, so other games' updates never reach the browser.
    expect(mocks.filter).toEqual({ event: "UPDATE", schema: "public", table: "games", filter: "id=in.(10,11)" });
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
