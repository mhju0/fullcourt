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
    `/api/season-report?season=${season}&schema=home-court-v1`,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  const { data: analysis, loading: normLoading } = useBacktest();
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
  const homeRate = data?.homeRate;
  const delta =
    enough && homeRate && homeRate.games > 0
      ? Math.round(
          ((data.overall.restedTeamWins / data.overall.games) -
            (homeRate.homeWins / homeRate.games)) *
            1000
        ) / 10
      : null;

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
      {data && !homeRate ? (
        <p role="status">The updated season comparison is unavailable right now. Please try again.</p>
      ) : data && data.completedGames === 0 ? (
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
            className="fc-report-summary"
            aria-labelledby="season-result-heading"
          >
            <div>
              <p className={`mono text-xs ${muted}`}>
                {data.seasonComplete ? "FINAL SEASON RECORD" : "SEASON TO DATE"}
              </p>
              <h2
                id="season-result-heading"
                className="mt-2 text-2xl font-semibold"
              >
                Home court and rest
              </h2>
              <div className="mt-4 grid grid-cols-1 border-y border-[var(--term-hairline)] sm:grid-cols-3">
                <div className="py-4 sm:pr-4">
                  <p className="fc-control-label sm:min-h-10">Home win rate</p>
                  <p className="mono mt-2 text-2xl font-semibold tabular-nums">
                    {data.homeRate.games > 0 ? `${data.homeRate.winPct.toFixed(1)}%` : "Awaiting results"}
                  </p>
                  <p className={`mt-1 text-xs ${muted}`}>{data.homeRate.homeWins.toLocaleString()} wins / {data.homeRate.games.toLocaleString()} eligible games</p>
                </div>
                <div className="border-t border-[var(--term-hairline)] py-4 sm:border-l sm:border-t-0 sm:px-4">
                  <p className="fc-control-label sm:min-h-10">Rested-at-home win rate</p>
                  <p data-testid="season-rest-win-rate" className="mono mt-2 text-2xl font-semibold tabular-nums text-[var(--term-blue-text)]">
                    {enough ? `${data.overall.winPct.toFixed(1)}%` : "Too early"}
                  </p>
                  <p className={`mt-1 text-xs ${muted}`}>{data.overall.restedTeamWins.toLocaleString()} wins / {data.overall.games.toLocaleString()} eligible games</p>
                </div>
                <div className="border-t border-[var(--term-hairline)] py-4 sm:border-l sm:border-t-0 sm:pl-4">
                  <p className="fc-control-label sm:min-h-10">Gap from home rate</p>
                  <p className="mono mt-2 text-2xl font-semibold tabular-nums">
                    {delta === null ? "Too early" : `${signedNumber(delta, 1)} pp`}
                  </p>
                  <p className={`mt-1 text-xs ${muted}`}>Rested at home versus all designated-home games</p>
                </div>
              </div>
              {!enough ? (
                <p className="mt-4">The rested-at-home comparison appears after {MIN_GAMES_FOR_INFERENCE} eligible games. {data.overall.games} recorded so far.</p>
              ) : null}
              <p className={`mt-4 ${muted}`}>
                {data.completedGames.toLocaleString()} / {data.scheduledGames.toLocaleString()} published regular-season games completed with scored fatigue pairs.
              </p>
              <a className="fc-text-link mt-3 inline-block min-h-11 content-center" href="/home-court">
                See home-court history →
              </a>
            </div>
            <div className="fc-report-interpretation flex flex-col gap-3">
              <h3 className="text-lg font-semibold">
                {delta === null
                  ? "The home baseline is available before the rest comparison."
                  : Math.abs(delta) <= (data.overall.band ?? 0)
                  ? "The result is close to home court alone."
                  : "The rested-at-home record differs from the home baseline."}
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
              {enough && data.overall.band !== null ? (
                <p className={muted}>
                  Rested-at-home uncertainty: ±{data.overall.band.toFixed(1)} percentage points (95% interval).
                </p>
              ) : null}
              <a
                className="fc-text-link min-h-11 content-center"
                href="/analysis"
              >
                See the full backtest →
              </a>
            </div>
          </section>
          <section
            className="fc-report-section flex flex-col gap-4"
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
            className="fc-report-section flex flex-col gap-3"
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
        <thead className={`bg-[var(--term-surface-2)] ${muted}`}>
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
