"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const ScheduleDisparityContentLazy = dynamic(
  () => import("@/components/schedule-disparity-content").then((m) => m.ScheduleDisparityContent),
  {
    loading: () => (
      <div className="flex flex-col gap-4">
        <div style={termCardStyle}>
          <Skeleton
            className="h-4 w-32 bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
        </div>
        <div style={termCardStyle}>
          <Skeleton
            className="mb-3 h-3 w-48 bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
          <Skeleton
            className="h-72 w-full bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
        </div>
      </div>
    ),
    ssr: false,
  }
)
