import { SeasonDataGuide } from "@/components/season-data-guide";
import { MessageCard } from "@/components/ui/message-card";
import type { useSeasonReadiness } from "@/hooks/useSeasonReadiness";

type Readiness = ReturnType<typeof useSeasonReadiness>;

export function SeasonReadinessNotice({ readiness, season, body, previousHref, previousLabel, showExpectedTiming = false }: {
  readiness: Readiness;
  season: string;
  body: string;
  previousHref?: string;
  previousLabel?: string;
  showExpectedTiming?: boolean;
}) {
  if (readiness.error) return <MessageCard tone="error" title="COULD NOT CHECK SEASON DATA"
    body="The current season’s data status could not be checked. Try again."
    action={<button type="button" className="fc-text-link min-h-11" disabled={readiness.isValidating}
      onClick={() => { void readiness.mutate().catch(() => undefined); }}>
      {readiness.isValidating ? "Retrying…" : "Retry data status"}
    </button>}
  />;
  if (!readiness.data) return <p role="status">Checking season data…</p>;
  if (readiness.ready) return null;
  return <SeasonDataGuide season={season} body={body} previousHref={previousHref}
    previousLabel={previousLabel} expectedAfterDate={showExpectedTiming ? readiness.data.expectedAfterDate : null} />;
}
