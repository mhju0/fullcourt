"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const UpcomingContentLazy = lazyContent(
  () => import("@/components/upcoming-content").then((m) => m.UpcomingContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Bar className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
)
