"use client";

import useSWR from "swr";
import { SeasonSelector } from "@/components/season-selector";
import { useBacktest } from "@/hooks/useBacktest";
import { useSeasonUrl } from "@/hooks/useSeasonUrl";
import { apiFetcher } from "@/lib/fetcher";
import { formatDataAsOf } from "@/lib/data-as-of";
import { browsableSeasons, NBA_SEASONS } from "@/lib/nba-season";
import {
  ABNORMAL_SEASON_NOTES,
  allSeasonNormExcluding,
  MIN_GAMES_FOR_INFERENCE,
  type SeasonReportResponse,
} from "@/lib/season-report";
import { signedNumber } from "@/lib/signed-number";
import { WIDTH } from "@/lib/terminal-styles";

const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1];
const muted = "text-[var(--term-text-muted)]";

export function SeasonReportContent() {
  const { season, setSeason, fallbackNote } = useSeasonUrl(
    LATEST_SEASON,
    browsableSeasons(),
  );
  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  const { data: analysis, loading: normLoading } = useBacktest();
  const baseline =
    analysis?.seasonWinRates.find((row) => row.season === season)
      ?.homeBaselinePct ?? null;
  const norm = analysis
    ? allSeasonNormExcluding(analysis.seasonWinRates, season)
    : null;
  const note = ABNORMAL_SEASON_NOTES[season];
  const stamp = formatDataAsOf(data);
  const previous = browsableSeasons()
    .filter((value) => value < season)
    .at(-1);
  const enough =
    data &&
    data.overall.games >= MIN_GAMES_FOR_INFERENCE &&
    data.overall.band !== null;
  const delta =
    enough && baseline !== null ? data.overall.winPct - baseline : null;

  return (
    <div
      className="flex flex-col gap-12 text-[15px] leading-relaxed"
      style={{ maxWidth: WIDTH.wide }}
      aria-busy={isLoading}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SeasonSelector
          id="season-report-season"
          season={season}
          onSeasonChange={setSeason}
          seasons={browsableSeasons()}
        />
        {stamp ? (
          <p className={`mono text-xs ${muted}`} data-testid="season-as-of">
            {stamp}
          </p>
        ) : null}
      </div>
      {fallbackNote ? <p role="status">{fallbackNote}</p> : null}
      {note ? (
        <aside
          data-testid="abnormal-season-note"
          className={`border-l-2 border-[var(--term-amber)] pl-4 ${muted}`}
        >
          <strong>{note.label}</strong>
          <p>{note.note}</p>
        </aside>
      ) : null}
      {error ? (
        <p role="status">
          {data
            ? "Refresh unavailable. Showing the last loaded report."
            : "Failed to load the season report. Please try again."}
        </p>
      ) : null}
      {isLoading ? (
        <div
          className="h-52 bg-[var(--term-surface-2)]"
          aria-label="Loading season results"
        />
      ) : null}
      {data && data.completedGames === 0 ? (
        <section
          className="flex flex-col gap-3 border-y border-[var(--term-border)] py-8"
          data-testid="season-awaiting-results"
        >
          <h2 className="text-2xl font-semibold">
            Awaiting results for {season}
          </h2>
          <p className={muted}>
            No completed games with scored fatigue pairs are available yet.
            Records will appear as games are played.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {previous ? (
              <a
                className="fc-text-link min-h-11 content-center"
                href={`/season?season=${previous}`}
              >
                View {previous} report →
              </a>
            ) : null}
            <a
              className="fc-text-link min-h-11 content-center"
              href={`/schedule?season=${season}`}
            >
              View this season’s schedule →
            </a>
          </div>
        </section>
      ) : data ? (
        <>
          <section
            className="grid gap-6 border-b border-[var(--term-border)] pb-8 md:grid-cols-2"
            aria-labelledby="season-result-heading"
          >
            <div>
              <h2
                id="season-result-heading"
                className="text-base font-semibold"
              >
                Rested team at home · win rate
              </h2>
              <p
                data-testid="season-rest-win-rate"
                className="mono my-3 text-[40px] font-semibold tabular-nums text-[var(--term-blue-text)]"
              >
                {enough ? `${data.overall.winPct.toFixed(1)}%` : "—"}
              </p>
              <p>
                {delta !== null
                  ? `${signedNumber(delta, 1)} percentage points versus this season’s ${baseline?.toFixed(1)}% home baseline.`
                  : normLoading
                    ? "Loading this season’s home baseline…"
                    : !enough
                      ? `Too early: ${data.overall.games} of ${MIN_GAMES_FOR_INFERENCE} games needed.`
                      : "This season’s home baseline is unavailable."}
              </p>
              <p className={`mt-3 ${muted}`}>
                {data.overall.games.toLocaleString()} games
                {data.overall.band !== null
                  ? ` · uncertainty ±${data.overall.band.toFixed(1)} percentage points (95% interval)`
                  : ""}
                .
              </p>
              <p className={muted}>
                {data.completedGames.toLocaleString()} /{" "}
                {data.scheduledGames.toLocaleString()} regular-season games
                completed with scored fatigue pairs.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">
                {delta !== null && Math.abs(delta) <= (data.overall.band ?? 0)
                  ? "The result is close to home court alone."
                  : "Rest and home court both matter to this comparison."}
              </h3>
              <p className={muted}>
                This is a record of completed games. Team strength, venue, and
                other conditions also differ; the comparison does not isolate
                the effect of rest.
              </p>
              <p data-testid="season-vs-history-heading">{season} vs history</p>
              <p className={muted}>
                {norm !== null
                  ? `The rested-at-home rate across other seasons is ${norm.toFixed(1)}%. The displayed season is excluded.`
                  : normLoading
                    ? "Loading historical comparison…"
                    : "Historical comparison unavailable."}
              </p>
              <a
                className="fc-text-link min-h-11 content-center"
                href="/analysis"
              >
                See the full backtest →
              </a>
            </div>
          </section>
          <section
            className="flex flex-col gap-4"
            aria-labelledby="season-team-heading"
          >
            <h2 id="season-team-heading" className="text-2xl font-semibold">
              Team results under different rest conditions
            </h2>
            <p className={muted}>
              Rested-at-home and tired-on-the-road records. These are records,
              not a ranking of fatigue management.
            </p>
            <p data-testid="swing-baseline-note" className={muted}>
              {data.swingBaseline === null
                ? "No league comparison is available yet."
                : `Read each difference against the league’s ${signedNumber(data.swingBaseline, 1)}-point comparison, not zero. Venue differs between the two groups.`}
            </p>
            <TeamRecords teams={data.teams.slice(0, 6)} />
            {data.teams.length > 6 ? (
              <details className="fc-disclosure">
                <summary>Show the other {data.teams.length - 6} teams</summary>
                <TeamRecords teams={data.teams.slice(6)} />
              </details>
            ) : null}
          </section>
          <section
            className="flex flex-col gap-3"
            aria-labelledby="season-notable-heading"
          >
            <h2 id="season-notable-heading" className="text-2xl font-semibold">
              When the rest gap was widest
            </h2>
            <p className={muted}>
              Five largest completed-game rest gaps with the rested team at
              home, regardless of outcome. Rest advantage is a model-score
              difference.
            </p>
            {data.loudestCalls.slice(0, 5).map((call) => (
              <a
                key={call.gameId}
                data-testid="loudest-call-row"
                href={`/games?season=${season}&date=${call.date}&game=${call.gameId}#game-${call.gameId}`}
                className="grid min-h-16 grid-cols-2 items-center gap-2 border-b border-[var(--term-border)] py-3 hover:bg-[var(--term-surface-2)] sm:grid-cols-4"
              >
                <span className={`mono text-xs ${muted}`}>{call.date}</span>
                <strong>
                  {data.teams.find((t) => t.teamId === call.awayTeamId)
                    ?.abbreviation ?? "—"}{" "}
                  @{" "}
                  {data.teams.find((t) => t.teamId === call.homeTeamId)
                    ?.abbreviation ?? "—"}
                </strong>
                <span className="mono text-[15px] tabular-nums">
                  {call.awayScore}–{call.homeScore} · RA{" "}
                  {call.restAdvantage.toFixed(2)}
                </span>
                <span className="text-right text-[15px]">
                  Rested team {call.restedTeamWon ? "won" : "lost"} →
                </span>
              </a>
            ))}
          </section>
          <p className="border-t border-[var(--term-border)] pt-6">
            Looking for travel, dense stretches, or favorable schedules?{" "}
            <a className="fc-text-link" href={`/schedule?season=${season}`}>
              See Schedule Edge →
            </a>
          </p>
        </>
      ) : null}
    </div>
  );
}

function TeamRecords({ teams }: { teams: SeasonReportResponse["teams"] }) {
  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label="Team rest records"
      tabIndex={0}
    >
      <table className="fc-table w-full table-fixed text-left text-xs sm:text-[15px]">
        <colgroup>
          <col style={{ width: "16%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "28%" }} />
        </colgroup>
        <thead className={muted}>
          <tr className="border-b border-[var(--term-border)]">
            <th className="px-2 py-3" scope="col">
              Team
            </th>
            <th className="px-2 text-right" scope="col">
              Rested home
              <br />W / G · win %
            </th>
            <th className="px-2 text-right" scope="col">
              Tired road
              <br />W / G · win %
            </th>
            <th className="px-2 text-right" scope="col">
              Difference
              <br />
              pp
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr
              key={team.teamId}
              data-testid="edge-conversion-row"
              className="border-b border-[var(--term-border)]"
            >
              <th scope="row" className="mono px-2 py-3">
                {team.abbreviation}
              </th>
              <td className="mono px-2 text-right tabular-nums">
                {team.restedWins}/{team.restedGames}
                <br />
                <span className={muted}>
                  {team.restedWinPct === null
                    ? "—"
                    : `${team.restedWinPct.toFixed(1)}%`}
                </span>
              </td>
              <td className="mono px-2 text-right tabular-nums">
                {team.tiredWins}/{team.tiredGames}
                <br />
                <span className={muted}>
                  {team.tiredWinPct === null
                    ? "—"
                    : `${team.tiredWinPct.toFixed(1)}%`}
                </span>
              </td>
              <td className={`mono px-2 text-right tabular-nums ${muted}`}>
                {team.swing === null ? "—" : signedNumber(team.swing, 1)}
                {team.restedGames < 10 || team.tiredGames < 10 ? (
                  <span className="block text-xs">Small sample</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
