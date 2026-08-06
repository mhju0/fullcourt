"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const ShotQualityContentLazy = lazyContent(
  () => import("@/components/shot-quality-content").then((m) => m.ShotQualityContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Bar className="h-4 w-32" />
      </div>
      <div style={termCardStyle}>
        <Bar className="mb-3 h-3 w-40" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Bar className="h-72 w-full" />
          <Bar className="h-72 w-full" />
        </div>
      </div>
    </div>
  )
)
