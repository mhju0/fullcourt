"use client"

import { useCallback, useEffect, useState } from "react"
import { flushSync } from "react-dom"
import type { SlateDensity } from "@/components/matchup-table"

const STORAGE_KEY = "fc-slate-density"
const URL_PARAM = "view"

const isDensity = (v: unknown): v is SlateDensity => v === "skim" || v === "deep"

/**
 * The slate's density dial (2026-08-28 redesign, C5): SKIM by default — "games show up
 * easily, as if on any other schedule-checking website" was the brief — with DEEP DIVE
 * one click away. The choice is remembered per viewer and the URL stays addressable
 * (`?view=deep`), with the URL winning over memory so a shared link shows what its
 * sender saw.
 *
 * Everything client-side happens after mount: the server renders SKIM, and correcting
 * in an effect avoids both a hydration mismatch and Next's Suspense requirement around
 * `useSearchParams`. Storage reads and writes are best-effort — a private window or
 * blocked site data must never break the board.
 */
export function useSlateDensity(): [SlateDensity, (d: SlateDensity) => void] {
  const [density, setDensityState] = useState<SlateDensity>("skim")

  useEffect(() => {
    // One scheduled frame, not a synchronous setState — the same
    // `react-hooks/set-state-in-effect` discipline useRetractingHeader documents.
    const frame = requestAnimationFrame(() => {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM)
        if (isDensity(fromUrl)) {
          setDensityState(fromUrl)
          return
        }
      } catch {}
      try {
        const remembered = localStorage.getItem(STORAGE_KEY)
        if (isDensity(remembered)) setDensityState(remembered)
      } catch {}
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const setDensity = useCallback((d: SlateDensity) => {
    // The dial morph (G moment 3, ADR 0010): a same-document view transition, so the
    // rows visibly grow and the columns fade rather than the layout snapping. flushSync
    // inside the callback is what makes React's update land within the snapshot window.
    // Reduced motion and unsupporting browsers take the plain state change.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion || typeof document.startViewTransition !== "function") {
      setDensityState(d)
    } else {
      document.startViewTransition(() => {
        flushSync(() => setDensityState(d))
      })
    }
    try {
      localStorage.setItem(STORAGE_KEY, d)
    } catch {}
    try {
      const url = new URL(window.location.href)
      url.searchParams.set(URL_PARAM, d)
      window.history.replaceState(null, "", url)
    } catch {}
  }, [])

  return [density, setDensity]
}
