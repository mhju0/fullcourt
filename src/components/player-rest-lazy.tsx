"use client"

import { lazyContent } from "@/components/lazy-content"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

/**
 * `ssr: false` for the same reason the other content surfaces use it: the table
 * is client-only state (sort, filter, which player is open) fed by a fetch, so
 * rendering it on the server would only ship markup React immediately replaces.
 */
export const PlayerRestContentLazy = lazyContent(
  () => import("@/components/player-rest-content").then((m) => m.PlayerRestContent),
  () => (
    <div style={termCardStyle}>
      <Skeleton
        className="mb-3 h-3 w-48 bg-[var(--term-surface-2)]"
        style={{ borderRadius: "var(--term-radius)" }}
      />
      <Skeleton
        className="h-96 w-full bg-[var(--term-surface-2)]"
        style={{ borderRadius: "var(--term-radius)" }}
      />
    </div>
  )
)
