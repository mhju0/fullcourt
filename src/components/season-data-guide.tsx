import { seasonExpectedTiming } from "@/lib/season-readiness";
import { LEAD, termCardStyle, TYPE } from "@/lib/terminal-styles";

export function SeasonDataGuide({
  season, body, previousHref, previousLabel, expectedAfterDate = null,
}: {
  season: string;
  body: string;
  previousHref?: string;
  previousLabel?: string;
  expectedAfterDate?: string | null;
}) {
  const timing = seasonExpectedTiming(expectedAfterDate);
  return (
    <aside
      data-testid="season-data-guide"
      className="flex flex-col gap-3 text-left"
      style={{ ...termCardStyle, fontSize: TYPE.body, lineHeight: LEAD.body }}
      aria-label={`${season} season data`}
    >
      <h2 className="text-lg font-semibold">Awaiting season data · {season}</h2>
      <p className="text-[var(--term-text-muted)]">{body}</p>
      {timing ? <p className="text-[var(--term-text-muted)]">{timing}</p> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {previousHref && previousLabel ? (
          <a className="fc-text-link min-h-11 content-center" href={previousHref}>{previousLabel} →</a>
        ) : null}
        <a className="fc-text-link min-h-11 content-center" href={`/schedule?season=${season}`}>
          View {season} schedule →
        </a>
      </div>
    </aside>
  );
}
