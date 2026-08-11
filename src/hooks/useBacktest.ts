"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import {
  toEvidenceSource,
  type RestAdvantageEvidenceSource,
} from "@/lib/rest-advantage-display"
import type { AnalysisResponse } from "@/types"

/**
 * The published backtest, which four surfaces read and none of them own.
 *
 * It is the denominator behind every rest-advantage claim on the site — the home page
 * matchup rows, the upcoming table, the Season Report's all-season baseline and
 * `/analysis` itself — so each of those surfaces was fetching it, and each was choosing
 * its own revalidation policy and its own answer for "what if it never arrives". Two of
 * them then rebuilt the same four-field slice by hand, re-listing the exact keys
 * `RestAdvantageEvidenceSource` already names.
 *
 * The fetch was never the duplication worth removing — SWR dedupes one key across
 * subscribers regardless. The shape and the degradation rule are.
 */
export interface Backtest {
  /** The whole payload, for surfaces that read more than the evidence slice. */
  data: AnalysisResponse | undefined

  /**
   * The slice `buildRestAdvantageEvidence` takes, or null until it arrives.
   *
   * Narrowed here so no caller re-lists the fields. Which fields those are is not
   * arbitrary — `thresholds` and `overallWinRate` describe called (home-rested) games
   * alone, and `homeAwayBreakdown` is the only one that can speak for the other half.
   */
  evidenceSource: RestAdvantageEvidenceSource | null

  /** Non-null only when the backtest failed. */
  error: string | null

  loading: boolean
}

/**
 * A failure is returned, never thrown.
 *
 * Three of the four surfaces render a table or a slate that is worth reading without a
 * hit rate, and drop to "—" in the one column that needs one. A missing denominator must
 * not take the page down with it — only `/analysis`, whose entire subject is the
 * backtest, surfaces the error.
 */
export function useBacktest(): Backtest {
  const { data, error: swrError, isLoading } = useSWR<AnalysisResponse>(
    "/api/analysis",
    apiFetcher,
    { revalidateOnFocus: false }
  )

  // Memoized on the payload: the home page re-renders on the season selector, the view
  // toggle and every Realtime score push, none of which change this. The narrowing itself
  // lives beside the type it produces, where it is unit-tested without a DOM.
  const evidenceSource = useMemo(() => toEvidenceSource(data), [data])

  return {
    data,
    evidenceSource,
    error: swrError ? errMsg(swrError) : null,
    loading: isLoading,
  }
}
