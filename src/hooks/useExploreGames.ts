"use client"

import { useCallback, useReducer } from "react"
import useSWR from "swr"
import {
  exploreReducer,
  exploreSearchKey,
  hasActiveFilters,
  initExplore,
  pageWindow,
  type ExploreIntent,
  type ExploreState,
  type PageWindow,
} from "@/lib/explore-games-machine"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import type { GameSearchResponse, GameSearchResult } from "@/types"

export const EXPLORE_PAGE_SIZE = 20

export type DrillSignal = { threshold: number; token: number } | null

export interface ExploreGames {
  state: ExploreState
  send: (intent: ExploreIntent) => void
  results: readonly GameSearchResult[]
  total: number
  loading: boolean
  /** Non-null only when the search failed. */
  error: string | null
  window: PageWindow
  hasFilters: boolean
}

/**
 * The shell around `explore-games-machine`: one fetch, and the drill signal
 * handed to the reducer.
 *
 * The drill dispatch happens during render on purpose — it is React's pattern
 * for adjusting state when a prop changes, and an effect would render the old
 * filter first. What moved into the machine is the *transition*: which fields a
 * drill click changes, and that it lands on page 1.
 */
export function useExploreGames(drillSignal: DrillSignal): ExploreGames {
  const [state, dispatch] = useReducer(exploreReducer, drillSignal, initExplore)

  if (drillSignal && drillSignal.token !== state.appliedDrillToken) {
    dispatch({
      type: "DRILL_APPLIED",
      threshold: drillSignal.threshold,
      token: drillSignal.token,
    })
  }

  const { data, error: swrError, isLoading } = useSWR<GameSearchResponse>(
    exploreSearchKey(state, EXPLORE_PAGE_SIZE),
    apiFetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  )

  const send = useCallback((intent: ExploreIntent) => dispatch(intent), [])
  const total = data?.total ?? 0

  return {
    state,
    send,
    results: data?.games ?? [],
    total,
    loading: isLoading,
    error: swrError ? errMsg(swrError) : null,
    window: pageWindow(state, total, EXPLORE_PAGE_SIZE),
    hasFilters: hasActiveFilters(state),
  }
}
