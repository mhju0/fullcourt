"use client"

import { useCallback, useEffect, useState } from "react"
import { flushSync } from "react-dom"
import type { SlateDensity } from "@/components/matchup-table"

const URL_PARAM = "view"

const isDensity = (v: unknown): v is SlateDensity => v === "skim" || v === "deep"

/** URL-addressable density; no personal preference storage. */
export function useSlateDensity(): [SlateDensity, (d: SlateDensity, instant?: boolean) => void] {
  const [density, setDensityState] = useState<SlateDensity>("skim")

  useEffect(() => {
    const readUrl = () => {
      const value = new URLSearchParams(window.location.search).get(URL_PARAM)
      setDensityState(isDensity(value) ? value : "skim")
    }
    const frame = requestAnimationFrame(readUrl)
    window.addEventListener("popstate", readUrl)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("popstate", readUrl)
    }
  }, [])

  const setDensity = useCallback((d: SlateDensity, instant = false) => {
    // The dial morph (G moment 3, ADR 0010): a same-document view transition, so the
    // rows visibly grow and the columns fade rather than the layout snapping. flushSync
    // inside the callback is what makes React's update land within the snapshot window.
    // Reduced motion and unsupporting browsers take the plain state change.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (instant || reduceMotion || typeof document.startViewTransition !== "function") {
      setDensityState(d)
    } else {
      document.startViewTransition(() => {
        flushSync(() => setDensityState(d))
      })
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.set(URL_PARAM, d)
      window.history.replaceState(null, "", url)
    } catch {}
  }, [])

  return [density, setDensity]
}
