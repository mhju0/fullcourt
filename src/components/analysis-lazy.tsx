"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const termCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E2DFD8",
  borderRadius: 4,
  padding: 16,
}

export const AnalysisContentLazy = dynamic(
  () => import("@/components/analysis-content").then((m) => m.AnalysisContent),
  {
    loading: () => (
      <div className="flex flex-col gap-4">
        <div style={termCard}>
          <Skeleton className="h-12 w-32 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          <Skeleton className="mt-2 h-3 w-52 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
        </div>
        <div style={termCard}>
          <Skeleton className="mb-1 h-3 w-64 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          <Skeleton className="mb-4 h-3 w-44 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          <Skeleton className="h-64 w-full bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
        </div>
      </div>
    ),
    ssr: false,
  }
)
