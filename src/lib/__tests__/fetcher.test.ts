import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetcher, errMsg } from "@/lib/fetcher";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetcher", () => {
  it("unwraps a successful API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { games: 3 }, error: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(apiFetcher<{ games: number }>("/api/games")).resolves.toEqual({ games: 3 });
  });

  it("surfaces a safe API error message from an error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], error: "Invalid season" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(apiFetcher("/api/games")).rejects.toThrow("Invalid season");
  });

  it("reports the HTTP status instead of leaking a JSON parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Bad Gateway", {
          status: 502,
          headers: { "content-type": "text/plain" },
        })
      )
    );

    await expect(apiFetcher("/api/games")).rejects.toThrow("Request failed (502)");
  });

  it("rejects a successful JSON response without the API envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    await expect(apiFetcher("/api/games")).rejects.toThrow("Invalid API response");
  });
});

/**
 * The eight surfaces that render a failure each carried their own copy of this, with a
 * differently worded fallback — and every fallback was unreachable, because `apiFetcher`
 * only ever throws an `Error` and SWR rethrows it unchanged.
 */
describe("errMsg", () => {
  it("passes an Error's own message through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: null, error: "No games for that date" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
    );

    // The whole path, not a hand-made Error: this is what a surface actually receives.
    const thrown = await apiFetcher("/api/games/2024-12-25").catch((e) => e);
    expect(errMsg(thrown)).toBe("No games for that date");
  });

  it("falls back for a thrown non-Error", () => {
    expect(errMsg("boom")).toBe("Something went wrong");
    expect(errMsg(undefined)).toBe("Something went wrong");
  });
});
