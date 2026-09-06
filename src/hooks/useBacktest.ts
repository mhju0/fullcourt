"use client"

import useSWR from "swr"
import { apiFetcher, errMsg } from "@/lib/fetcher"
import type { AnalysisResponse } from "@/types"

/** Shared backtest request for Model Results and the Season Report's all-season baseline. */
export interface Backtest {
  /** The published historical backtest. */
  data: AnalysisResponse | undefined

  /** Non-null only when the backtest failed. */
  error: string | null

  loading: boolean
}

/** Returns failures so each surface can choose how to present missing historical data. */
export function useBacktest(): Backtest {
  const { data, error: swrError, isLoading } = useSWR<AnalysisResponse>(
    "/api/analysis",
    apiFetcher,
    { revalidateOnFocus: false }
  )

  return {
    data,
    error: swrError ? errMsg(swrError) : null,
    loading: isLoading,
  }
}
