"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const ScheduleDisparityContentLazy = lazyContent(
  () => import("@/components/schedule-disparity-content").then((m) => m.ScheduleDisparityContent),
  () => (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Bar className="h-4 w-32" />
      </div>
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          background: "var(--term-border)",
          border: "1px solid var(--term-border)",
          borderRadius: "var(--term-radius)",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-[var(--term-surface)] px-3 py-3">
            <Bar className="h-[52px] w-full" />
          </div>
        ))}
      </div>
      <div style={termCardStyle}>
        <Bar className="mb-3 h-3 w-48" />
        {/* Matches the ranked list's row rhythm rather than a single block, so the layout
            does not jump when 30 rows arrive. Thirty rows at the list's own height: with
            twelve, the sections below this one were on screen and moved when it filled. */}
        <div className="flex flex-col gap-[2px]">
          {Array.from({ length: 30 }, (_, i) => (
            <Bar key={i} className="h-[18px] w-full" radius="var(--term-radius-bar)" />
          ))}
        </div>
      </div>
    </div>
  )
)
