import { PageHeader } from "@/components/page-header"
import { MethodLink } from "@/components/method-link"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"
import type { DataAsOf } from "@/lib/data-as-of"

export function AnalysisHeader({ description, asOf }: { description?: string; asOf?: DataAsOf | null }) {
  return (
    <header className="page-intro">
      <PageHeader
        eyebrow="HISTORICAL BACKTEST · WIN RATE"
        title="Model Results"
        description={description ?? "How often the more-rested NBA team won at home, compared with the home-court baseline."}
        asOf={asOf}
      />
      <MethodLink surfaceHref="/analysis" />
    </header>
  )
}

export function AnalysisLoading({ asOf }: { asOf?: DataAsOf | null }) {
  return (
    <div className="flex flex-col gap-12">
      <AnalysisHeader asOf={asOf} />
      <p role="status" className="text-[15px] text-[var(--term-text-muted)]">Loading model results…</p>
      <div aria-hidden="true" className="flex flex-col gap-12">
        <div style={termCardStyle}>
          <Skeleton className="h-12 w-32 bg-[var(--term-surface-2)]" />
          <Skeleton className="mt-2 h-3 w-52 bg-[var(--term-surface-2)]" />
        </div>
        <div style={termCardStyle}>
          <Skeleton className="mb-1 h-3 w-48 bg-[var(--term-surface-2)]" />
          <Skeleton className="h-64 w-full bg-[var(--term-surface-2)]" />
        </div>
        <div style={termCardStyle}>
          <Skeleton className="mb-2 h-3 w-40 bg-[var(--term-surface-2)]" />
          <Skeleton className="h-10 w-24 bg-[var(--term-surface-2)]" />
        </div>
        <div style={termCardStyle}>
          <Skeleton className="mb-1 h-3 w-48 bg-[var(--term-surface-2)]" />
          <Skeleton className="h-64 w-full bg-[var(--term-surface-2)]" />
        </div>
      </div>
    </div>
  )
}
