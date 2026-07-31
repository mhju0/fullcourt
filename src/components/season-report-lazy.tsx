"use client"

import { lazyContent } from "@/components/lazy-content"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const SeasonReportContentLazy = lazyContent(
  () => import("@/components/season-report-content").then((m) => m.SeasonReportContent),
  () => (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Skeleton className="h-4 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-[92px] w-full bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
        ))}
      </div>
    </div>
  )
)
