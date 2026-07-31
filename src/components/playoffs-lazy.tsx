"use client"

import { lazyContent } from "@/components/lazy-content"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const PlayoffsContentLazy = lazyContent(
  () => import("@/components/playoffs-content").then((m) => m.PlayoffsContent),
  () => (
    <div className="flex flex-col gap-4">
      <div style={termCardStyle}>
        <Skeleton className="h-10 w-64 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
    </div>
  )
)
