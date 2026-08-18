"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import type { DataAsOf } from "@/lib/data-as-of"
import { termCardStyle } from "@/lib/terminal-styles"

export const AnalysisContentLazy = lazyContent<{ asOf?: DataAsOf | null }>(
  () => import("@/components/analysis-content").then((m) => m.AnalysisContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Bar className="h-12 w-32" />
        <Bar className="mt-2 h-3 w-52" />
      </div>
      <div style={termCardStyle}>
        <Bar className="mb-1 h-3 w-64" />
        <Bar className="mb-4 h-3 w-44" />
        <Bar className="h-64 w-full" />
      </div>
    </div>
  )
)
