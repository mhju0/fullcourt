import { afterEach, describe, expect, it, vi } from "vitest"
import { createRouteTransitions, navigateWithViewTransition } from "../route-transition"

function harness(ready: Promise<void> = Promise.resolve()) {
  const transitions = createRouteTransitions()
  const router = { push: vi.fn() }
  const updates: (() => Promise<void>)[] = []
  const start = vi.fn((update: () => Promise<void>) => {
    updates.push(update)
    return { ready }
  })
  const navigate = (href: string) => transitions.navigate(router, href, "https://fullcourt.test/games", start)
  return { transitions, router, updates, start, navigate }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("route transitions", () => {
  it("reports a navigation to another pathname as leaving until it commits", () => {
    const h = harness()
    expect(h.transitions.isLeaving("/games")).toBe(false)
    h.navigate("/games?season=2025-26")
    expect(h.transitions.isLeaving("/games")).toBe(false)
    h.navigate("/season")
    expect(h.transitions.isLeaving("/games")).toBe(true)
    // The destination must not read itself as being left.
    expect(h.transitions.isLeaving("/season")).toBe(false)
    h.transitions.committed("/analysis")
    expect(h.transitions.isLeaving("/games")).toBe(true)
    h.transitions.committed("/season")
    expect(h.transitions.isLeaving("/games")).toBe(false)
  })

  it("stops reporting leaving when the destination never commits", () => {
    vi.useFakeTimers()
    const h = harness()
    h.navigate("/season")
    vi.advanceTimersByTime(15000)
    expect(h.transitions.isLeaving("/games")).toBe(false)
  })

  it("clears leaving when another navigation stays on the current pathname", () => {
    vi.useFakeTimers()
    const h = harness()
    h.navigate("/season")
    h.navigate("/games?season=2024-25")
    expect(h.transitions.isLeaving("/games")).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    h.transitions.dispose()
  })

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
    // The leaving flag outlives the cross-fade on purpose; the destination's commit ends it.
    h.transitions.committed("/analysis")
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

  it.each(["before update", "after update"])("handles a hidden-document animation rejection %s without losing navigation", async (timing) => {
    let reject!: (reason: unknown) => void
    const ready = new Promise<void>((_, fail) => { reject = fail })
    const h = harness(ready)
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      h.navigate("/season")
      const completed = timing === "after update" ? h.updates[0]() : undefined
      reject(new DOMException("Transition was aborted because of invalid state. Document hidden.", "InvalidStateError"))
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
      const update = completed ?? h.updates[0]()
      expect(h.router.push).toHaveBeenCalledExactlyOnceWith("/season")
      expect(h.transitions.isLeaving("/games")).toBe(true)
      h.transitions.committed("/season")
      await update
      expect(h.transitions.isLeaving("/games")).toBe(false)
    } finally {
      process.off("unhandledRejection", unhandled)
      h.transitions.dispose()
    }
  })

  it("handles a superseded animation rejection without pushing its late update", async () => {
    let reject!: (reason: unknown) => void
    const h = harness(new Promise<void>((_, fail) => { reject = fail }))
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      h.navigate("/season")
      h.navigate("/analysis")
      reject(new DOMException("Transition superseded", "AbortError"))
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
      await h.updates[0]()
      expect(h.router.push).not.toHaveBeenCalled()
      const completed = h.updates[1]()
      expect(h.router.push).toHaveBeenCalledExactlyOnceWith("/analysis")
      h.transitions.committed("/analysis")
      await completed
    } finally {
      process.off("unhandledRejection", unhandled)
      h.transitions.dispose()
    }
  })

  it("keeps a failed navigation callback observable through updateCallbackDone", async () => {
    const transitions = createRouteTransitions()
    const failure = new Error("router push failed")
    const router = { push: vi.fn(() => { throw failure }) }
    let updateCallbackDone!: Promise<void>
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      transitions.navigate(router, "/season", "https://fullcourt.test/games", (update) => {
        const result = Promise.resolve().then(update)
        const ready = new Promise<void>((resolve, reject) => { void result.then(resolve, reject) })
        updateCallbackDone = new Promise<void>((resolve, reject) => { void result.then(resolve, reject) })
        return { ready, updateCallbackDone }
      })
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).toHaveBeenCalledExactlyOnceWith(failure, updateCallbackDone)
      expect(router.push).toHaveBeenCalledExactlyOnceWith("/season")
    } finally {
      process.off("unhandledRejection", unhandled)
      transitions.dispose()
    }
  })

  it.each(["reduced motion", "unsupported", "hidden", "instant"])("keeps plain navigation for %s", (mode) => {
    const start = vi.fn()
    vi.stubGlobal("window", {
      location: { href: "https://fullcourt.test/games" },
      matchMedia: () => ({ matches: mode === "reduced motion" }),
    })
    vi.stubGlobal("document", {
      visibilityState: mode === "hidden" ? "hidden" : "visible",
      startViewTransition: mode === "unsupported" ? undefined : start,
    })
    const router = { push: vi.fn() }
    navigateWithViewTransition(router, "/season", { instant: mode === "instant" })
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/season")
    expect(start).not.toHaveBeenCalled()
  })
})
