import type { Metadata } from "next";
import { UpcomingContentLazy } from "@/components/upcoming-lazy";

export const metadata: Metadata = {
  title: "Future Games",
};

export default function UpcomingPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <span
          className="mono"
          style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--term-red)", fontWeight: 700 }}
        >
          2025–26 SEASON
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Future Games</h1>
        <p className="mono max-w-2xl" style={{ fontSize: 11, color: "var(--term-text-muted)", lineHeight: 1.5 }}>
          UPCOMING SCHEDULED GAMES FILTERED BY REST ADVANTAGE THRESHOLD.
        </p>
      </div>

      <UpcomingContentLazy />
    </div>
  );
}
