import { KeepTogether } from "@/components/ui/keep-together";
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
      <h2 className="font-semibold" style={{ fontSize: TYPE.emph }}>Awaiting season data · <KeepTogether>{season}</KeepTogether></h2>
      <p className="text-[var(--term-text-muted)]"><KeepTogether>{body}</KeepTogether></p>
      {timing ? <p className="text-[var(--term-text-muted)]"><KeepTogether>{timing}</KeepTogether></p> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {previousHref && previousLabel ? (
          <a className="fc-text-link inline-flex min-h-11 items-center" href={previousHref}><span><KeepTogether>{previousLabel}</KeepTogether>{"\u00a0"}→</span></a>
        ) : null}
        <a className="fc-text-link inline-flex min-h-11 items-center" href={`/schedule?season=${season}`}>
          <span>View <KeepTogether>{season}</KeepTogether> schedule{"\u00a0"}→</span>
        </a>
      </div>
    </aside>
  );
}
