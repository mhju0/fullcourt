"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const termCard: React.CSSProperties = {
  background: "var(--term-surface)",
  border: "1px solid var(--term-border)",
  borderRadius: "var(--term-radius)",
  padding: 16,
}

export const PlayoffsContentLazy = dynamic(
  () => import("@/components/playoffs-content").then((m) => m.PlayoffsContent),
  {
    loading: () => (
      <div className="flex flex-col gap-4">
        <div style={termCard}>
          <Skeleton className="h-4 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
        <div style={termCard}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
            <Skeleton className="h-24 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
          <Skeleton className="h-16 w-full bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
        </div>
      </div>
    ),
    ssr: false,
  }
)
