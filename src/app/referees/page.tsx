import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { termCardStyle } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Referee Bias",
};

export default function RefereesPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="REFEREE BIAS · IN PROGRESS"
        title="Referee Bias"
        description="Whether referee assignments carry a measurable, repeatable effect on outcomes — foul differentials, the home whistle, crew tendencies."
      />

      <div style={termCardStyle}>
        <p
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 600, textTransform: "uppercase" }}
        >
          Under construction
        </p>
        <p style={{ marginTop: 8, maxWidth: "42rem", fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55 }}>
          Nothing to show yet. The plan is to score referee assignments the same way the rest
          model is scored elsewhere on this site — against history, with the limits stated.
        </p>
      </div>
    </div>
  );
}
