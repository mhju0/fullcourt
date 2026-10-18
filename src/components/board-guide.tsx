"use client";

import { ChevronDown } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import { FLAG_MEANINGS, LARGE_REST_EDGE_THRESHOLD, MEDIUM_REST_EDGE_THRESHOLD, RestEdgeBadge, restEdgeRates } from "@/components/matchup-parts";
import { FlagChip } from "@/components/matchup-table";
import { NEUTRAL_REST_ADVANTAGE_THRESHOLD } from "@/lib/rest-advantage-evidence";
import { SPACE, TRACK, TYPE } from "@/lib/terminal-styles";

/** The board's three columns in plain words, closed until asked for. */
export function BoardGuide({ className }: { className?: string }) {
  const { data } = useBacktest();
  // Read from the backtest, never typed here; while it loads or fails the sentence ends early.
  const rates = data ? restEdgeRates(data.thresholds) : null;
  return (
    <details className={className} style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>
      <summary className="fc-text-link inline-flex min-h-11 cursor-pointer list-none items-center underline [&::-webkit-details-marker]:hidden" style={{ gap: SPACE.xs }}>
        How to read the board
        <ChevronDown aria-hidden className="size-4 shrink-0 [details[open]_&]:rotate-180" />
      </summary>
      <dl className="m-0 grid gap-y-3" style={{ paddingBlock: SPACE.sm }}>
        <GuideRow term="FATIGUE">
          Each team&apos;s fatigue score. Higher means more tired. The tags beside it are the reasons:
          <span className="mt-2 grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: "auto 1fr" }}>
            {Object.entries(FLAG_MEANINGS).map(([flag, meaning]) => (
              <span key={flag} className="contents">
                <span><FlagChip label={flag} /></span>
                <span>{meaning}</span>
              </span>
            ))}
          </span>
        </GuideRow>
        <GuideRow term="REST ADVANTAGE">
          The gap between the two scores, named for the fresher team. A gap under {NEUTRAL_REST_ADVANTAGE_THRESHOLD} reads EVEN.
        </GuideRow>
        <GuideRow term={<RestEdgeBadge size="medium" />}>
          The home team is {MEDIUM_REST_EDGE_THRESHOLD} to {LARGE_REST_EDGE_THRESHOLD} points fresher.
          {rates?.medium && <> Home teams in that spot won {rates.medium.winPct.toFixed(1)}% of {rates.medium.games.toLocaleString("en-US")} games.</>}
        </GuideRow>
        <GuideRow term={<RestEdgeBadge size="large" />}>
          The home team is {LARGE_REST_EDGE_THRESHOLD}+ points fresher.
          {rates?.large && <> Home teams in that spot won {rates.large.winPct.toFixed(1)}% of {rates.large.games.toLocaleString("en-US")} games.</>}
        </GuideRow>
      </dl>
    </details>
  );
}

function GuideRow({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="mono" style={{ fontSize: TYPE.label, letterSpacing: TRACK.label, fontWeight: 600, color: "var(--term-text)" }}>{term}</dt>
      <dd className="m-0 grid">{children}</dd>
    </div>
  );
}
