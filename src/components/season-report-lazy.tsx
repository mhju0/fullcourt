"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const SeasonReportContentLazy = lazyContent(
  () => import("@/components/season-report-content").then((m) => m.SeasonReportContent),
  () => (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Bar className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="h-[92px] w-full" />
        ))}
      </div>
    </div>
  )
)
