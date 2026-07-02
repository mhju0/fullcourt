"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const termCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E2DFD8",
  borderRadius: 4,
  padding: 16,
}

export const ShotQualityContentLazy = dynamic(
  () => import("@/components/shot-quality-content").then((m) => m.ShotQualityContent),
  {
    loading: () => (
      <div className="flex flex-col gap-4">
        <div style={termCard}>
          <Skeleton className="h-4 w-32 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
        </div>
        <div style={termCard}>
          <Skeleton className="mb-3 h-3 w-40 bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-72 w-full bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
            <Skeleton className="h-72 w-full bg-[#F0EEE9]" style={{ borderRadius: 4 }} />
          </div>
        </div>
      </div>
    ),
    ssr: false,
  }
)
