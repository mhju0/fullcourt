"use client"

import { lazyContent } from "@/components/lazy-content"
import type { DataAsOf } from "@/lib/data-as-of"
import { AnalysisLoading } from "@/components/analysis-loading"

export const AnalysisContentLazy = lazyContent<{ asOf?: DataAsOf | null }>(
  () => import("@/components/analysis-content").then((m) => m.AnalysisContent),
  () => <AnalysisLoading />
)
