import { PageHeader } from "@/components/page-header";
import { WIDTH } from "@/lib/terminal-styles";

// The page reads the database on every request. Without this, a press on the footer link
// showed nothing until those reads returned.
export default function DataStatusLoading() {
  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      <PageHeader
        eyebrow="COVERAGE · FRESHNESS · AVAILABILITY"
        title="Data Status"
        description="What each published view currently covers. Database availability and data freshness are separate checks."
      />
      <p role="status" style={{ color: "var(--term-text-muted)" }}>Checking the database…</p>
    </div>
  );
}
