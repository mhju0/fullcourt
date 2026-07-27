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
            <div key={i} className="bg-[var(--term-surface)] px-[13px] py-[11px]">
              <Skeleton className="h-[52px] w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
            </div>
          ))}
        </div>
        <div style={termCardStyle}>
          <Skeleton
            className="mb-3 h-3 w-48 bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
          {/* Matches the ranked list's row rhythm rather than a single block, so the layout
              does not jump when 30 rows arrive. */}
          <div className="flex flex-col gap-[2px]">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-[15px] w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius-bar)" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    ssr: false,
  }
)
