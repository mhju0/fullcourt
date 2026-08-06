"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
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
      <Bar className="mb-3 h-3 w-48" />
      <Bar className="h-96 w-full" />
    </div>
  )
)
