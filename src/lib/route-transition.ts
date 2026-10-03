"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/** Route cross-fades own their completion, replacement and fail-open lifecycle. */
export function createRouteTransitions() {
  let pending: {
    pathname: string
    resolve: () => void
    timer?: ReturnType<typeof setTimeout>
  } | null = null

  // A push to another pathname that has not committed yet. A history write made by the page
  // being left would land on top of it and cancel it, so pages ask before writing their URL.
  let leaving: { from: string; pathname: string; timer: ReturnType<typeof setTimeout> } | null = null

  function arrived() {
    if (leaving) clearTimeout(leaving.timer)
    leaving = null
  }

  function release() {
    const previous = pending
    pending = null
    if (previous) {
      clearTimeout(previous.timer)
      previous.resolve()
    }
  }

  return {
    navigate(
      router: { push: (href: string) => void },
      href: string,
      currentUrl: string,
      startTransition?: (update: () => Promise<void>) => unknown
    ) {
      // Even a plain navigation supersedes an outstanding animated one.
      release()
      const current = new URL(currentUrl)
      const destination = new URL(href, current)
      if (destination.origin === current.origin && destination.pathname !== current.pathname) {
        arrived()
        // Fail open: a navigation that never commits must not silence the page for good.
        leaving = { from: current.pathname, pathname: destination.pathname, timer: setTimeout(arrived, 15000) }
      }
      if (!startTransition || destination.origin !== current.origin || destination.pathname === current.pathname) {
        router.push(href)
        return
      }

      let resolve!: () => void
      const completed = new Promise<void>((done) => { resolve = done })
      const entry = { pathname: destination.pathname, resolve, timer: undefined as ReturnType<typeof setTimeout> | undefined }
      pending = entry
      startTransition(() => {
        // The browser may invoke an old update after a newer navigation began.
        if (pending !== entry) return completed
        entry.timer = setTimeout(() => {
          if (pending === entry) release()
        }, 1000)
        try {
          router.push(href)
        } catch (error) {
          if (pending === entry) release()
          throw error
        }
        return completed
      })
    },
    committed(pathname: string) {
      // A late commit from a superseded destination cannot release the current one.
      if (pending?.pathname === pathname) release()
      if (leaving?.pathname === pathname) arrived()
    },
    // Asked with the current pathname: the destination's own effects run before the commit
    // is reported here, and the page arrived at is not the page being left.
    isLeaving: (pathname: string) => leaving?.from === pathname,
    dispose() {
      arrived()
      release()
    },
  }
}

const transitions = createRouteTransitions()

/** Chrome navigation only; reduced motion and unsupported browsers keep plain navigation. */
export function navigateWithViewTransition(
  router: { push: (href: string) => void },
  href: string,
  options: { instant?: boolean } = {}
): void {
  const animate = !options.instant && !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    typeof document.startViewTransition === "function"
  transitions.navigate(router, href, window.location.href,
    animate ? (update) => document.startViewTransition(update) : undefined)
}

/** True between a tab or palette navigation starting and its destination committing. */
export function isLeavingPage(): boolean {
  return transitions.isLeaving(window.location.pathname)
}

/** Mounted explicitly in the persistent root shell, independent of any navigation display. */
export function RouteTransitionLifecycle(): null {
  const pathname = usePathname()
  useEffect(() => { transitions.committed(pathname) }, [pathname])
  useEffect(() => () => transitions.dispose(), [])
  return null
}
