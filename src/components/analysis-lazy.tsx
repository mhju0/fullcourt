"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const AnalysisContentLazy = dynamic(
  () => import("@/components/analysis-content").then((m) => m.AnalysisContent),
  {
    loading: () => (
      <div className="flex flex-col gap-4">
        <div style={termCardStyle}>
          <Skeleton className="h-12 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="mt-2 h-3 w-52 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
        <div style={termCardStyle}>
          <Skeleton className="mb-1 h-3 w-64 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="mb-4 h-3 w-44 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="h-64 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
      </div>
    ),
    ssr: false,
  }
)
