import { afterEach, describe, expect, it, vi } from "vitest"
import { createRouteTransitions, navigateWithViewTransition } from "../route-transition"

function harness() {
  const transitions = createRouteTransitions()
  const router = { push: vi.fn() }
  const updates: (() => Promise<void>)[] = []
  const start = vi.fn((update: () => Promise<void>) => { updates.push(update) })
  const navigate = (href: string) => transitions.navigate(router, href, "https://fullcourt.test/games", start)
  return { transitions, router, updates, start, navigate }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("route transitions", () => {
  it.each(["/games", "/games?season=2025-26", "/games#main"])("pushes %s normally without waiting for a pathname change", (href) => {
    const h = harness()
    h.navigate(href)
    expect(h.router.push).toHaveBeenCalledWith(href)
    expect(h.start).not.toHaveBeenCalled()
  })

  it("waits for the destination commit, not an unrelated pathname", async () => {
    const h = harness()
    h.navigate("/season?year=2025-26")
    const settled = vi.fn()
    const finished = h.updates[0]().then(settled)
    expect(h.router.push).toHaveBeenCalledWith("/season?year=2025-26")
    h.transitions.committed("/analysis")
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    h.transitions.committed("/season")
    await finished
    expect(settled).toHaveBeenCalledOnce()
  })

  it("releases a replaced transition and ignores its late destination commit", async () => {
    const h = harness()
    h.navigate("/season")
    const first = h.updates[0]()
    h.navigate("/analysis")
    await first
    const settled = vi.fn()
    const second = h.updates[1]().then(settled)
    h.transitions.committed("/season")
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    h.transitions.committed("/analysis")
    await second
    expect(settled).toHaveBeenCalledOnce()
  })

  it("does not push a superseded browser update invoked late", async () => {
    const h = harness()
    h.navigate("/season")
    h.navigate("/analysis")
    await h.updates[0]()
    expect(h.router.push).not.toHaveBeenCalled()
    const latest = h.updates[1]()
    expect(h.router.push).toHaveBeenCalledExactlyOnceWith("/analysis")
    h.transitions.committed("/analysis")
    await latest
  })

  it("fails open after one second and cancels old timers on replacement", async () => {
    vi.useFakeTimers()
    const h = harness()
    h.navigate("/season")
    const first = h.updates[0]()
    await vi.advanceTimersByTimeAsync(500)
    h.navigate("/analysis")
    await first
    const settled = vi.fn()
    const second = h.updates[1]().then(settled)
    await vi.advanceTimersByTimeAsync(500)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    await second
    expect(settled).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("releases pending work on a same-path navigation or disposal", async () => {
    const h = harness()
    h.navigate("/season")
    const first = h.updates[0]()
    h.navigate("/games#main")
    await first
    h.navigate("/analysis")
    const second = h.updates[1]()
    h.transitions.dispose()
    await second
  })

  it.each(["reduced motion", "unsupported"])("keeps plain navigation for %s", (mode) => {
    const start = vi.fn()
    vi.stubGlobal("window", {
      location: { href: "https://fullcourt.test/games" },
      matchMedia: () => ({ matches: mode === "reduced motion" }),
    })
    vi.stubGlobal("document", { startViewTransition: mode === "unsupported" ? undefined : start })
    const router = { push: vi.fn() }
    navigateWithViewTransition(router, "/season")
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/season")
    expect(start).not.toHaveBeenCalled()
  })
})
