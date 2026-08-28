"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Route-level View Transitions (G1, ADR 0010): the cure for "click a tab, teleport".
 * A manual wrapper, NOT Next's experimental `viewTransition` flag — the flag was the
 * escalation path and the wrapper works, so prod carries no experimental surface.
 *
 * The mechanics: `document.startViewTransition` snapshots the page, runs the update
 * callback, and cross-fades to the result — but `router.push` returns before the new
 * route commits, so the callback returns a promise that {@link useSettleRouteTransition}
 * resolves when the pathname actually changes. A 1s guard settles it regardless, so a
 * failed navigation can never freeze the page mid-snapshot (browsers would eventually
 * skip the transition themselves; the guard just makes the bound explicit).
 *
 * Reduced motion and unsupporting browsers take the plain push — the state change is
 * kept, only the travel is removed, the same posture as the retracting header.
 */

let settle: (() => void) | null = null

function resolvePending() {
  settle?.()
  settle = null
}

export function navigateWithViewTransition(
  router: { push: (href: string) => void },
  href: string
): void {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  if (reduceMotion || typeof document.startViewTransition !== "function") {
    router.push(href)
    return
  }

  // A click while a previous navigation is still settling: release the old one first.
  resolvePending()

  document.startViewTransition(() => {
    router.push(href)
    return new Promise<void>((resolve) => {
      settle = resolve
      setTimeout(resolve, 1000)
    })
  })
}

/**
 * Mounted once in the shell (nav-bar). Resolves the pending transition when the route
 * actually lands, which is what lets the cross-fade capture the *new* page rather than
 * a loading frame.
 */
export function useSettleRouteTransition(): void {
  const pathname = usePathname()
  useEffect(() => {
    resolvePending()
  }, [pathname])
}
