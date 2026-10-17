"use client"

import { Bar, lazyContent } from "@/components/lazy-content"
import { termCardStyle } from "@/lib/terminal-styles"

export const TeamScheduleContentLazy = lazyContent(
  () => import("@/components/team-schedule-content").then((m) => m.TeamScheduleContent),
  () => (
    <div className="flex flex-col gap-2 sm:gap-6">
      <div style={termCardStyle}>
        <Bar className="h-[68px] w-full max-w-md" />
      </div>
    </div>
  )
)
