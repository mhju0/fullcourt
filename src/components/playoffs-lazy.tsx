"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const PlayoffsContentLazy = lazyContent(
  () => import("@/components/playoffs-content").then((m) => m.PlayoffsContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Bar className="h-10 w-64" />
      </div>
      <div className="flex flex-col gap-2">
        <Bar className="h-16 w-full" />
        <Bar className="h-16 w-full" />
        <Bar className="h-16 w-full" />
      </div>
    </div>
  )
)
