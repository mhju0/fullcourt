"use client"

import dynamic from "next/dynamic"
import type { ComponentType, ReactElement } from "react"

/**
 * How every page loads its content component.
 *
 * `ssr: false` is one decision, not seven: these surfaces are client-only state
 * fed by a fetch, so server-rendering them ships markup React immediately
 * replaces. It was previously restated in each `*-lazy` module, along with the
 * same import block, leaving the skeleton — the only part that actually differs
 * — surrounded by scaffolding.
 *
 * The `*-lazy` modules still exist because `dynamic()` with `ssr: false` cannot
 * be called from a server component, and the pages are server components. What
 * they carry now is the skeleton and nothing else.
 */
export function lazyContent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  skeleton: () => ReactElement
) {
  return dynamic(load, { ssr: false, loading: skeleton })
}
