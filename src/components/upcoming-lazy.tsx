"use client"

import { lazyContent } from "@/components/lazy-content"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const UpcomingContentLazy = lazyContent(
  () => import("@/components/upcoming-content").then((m) => m.UpcomingContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Skeleton className="h-4 w-48 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        ))}
      </div>
    </div>
  )
)
