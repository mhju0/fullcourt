"use client";

import Link from "next/link";
import { defaultNbaSeason } from "@/lib/nba-season";
import { latestUsableResultSeason } from "@/lib/result-season";
import { SeasonDataGuide } from "@/components/season-data-guide";
import { SeasonReadinessNotice } from "@/components/season-readiness-notice";
import { useSeasonReadiness } from "@/hooks/useSeasonReadiness";
import { useState, useRef, useEffect } from "react";
import { usePageQuery } from "@/hooks/useSeasonUrl";
import useSWR from "swr";
import { apiFetcher, errMsg } from "@/lib/fetcher";
import { MessageCard } from "@/components/ui/message-card";
import { PageHeader } from "@/components/page-header";
import { SeasonSelector } from "@/components/season-selector";
import { OfficiatingReport } from "@/components/officiating-report";
import {
  categoryLabel,
  filterReviews,
  reviewUrl,
  type ReviewGame,
  type ReviewSeasonSummary,
} from "@/lib/officiating";
import { ScrollCue } from "@/components/ui/scroll-cue";
import styles from "./officiating.module.css";

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${date}T12:00:00-05:00`));
}
export function OfficiatingContent({ seasons }: { seasons: ReviewSeasonSummary[] }) {
  const { params, update: updateQuery } = usePageQuery();
  const requested = params.get("season");
  const currentSeason = defaultNbaSeason();
  const latest = seasons[seasons.length - 1];
  const hasCurrentPublication = seasons.some((season) => season.season === currentSeason);
  const readiness = useSeasonReadiness(currentSeason, hasCurrentPublication);
  const previous = seasons.filter((s) => s.season < currentSeason).at(-1);
  const defaultSeason = latestUsableResultSeason(seasons.map((s) => s.season), currentSeason, readiness.ready);
  const selectedSeason = requested === currentSeason || seasons.some((s) => s.season === requested)
    ? requested! : defaultSeason ?? currentSeason;
  const season = seasons.find((s) => s.season === selectedSeason) ?? previous ?? latest;
  const heldCurrent = selectedSeason === currentSeason && (!hasCurrentPublication || !readiness.ready);
  const selectableSeasons = [...new Set([...seasons.map((s) => s.season), currentSeason])].sort();
  const visibleSeasons = seasons.filter((value) => value.season !== currentSeason || readiness.ready);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // The strip opens scrolled to the end, and a width that is not a whole number of columns
    // cut the first visible one in half: 89.9% read as "9.9%". Columns stretch so the visible
    // ones fill the width exactly, and every scroll stop lands on a column edge.
    const fit = () => {
      const style = getComputedStyle(strip);
      const gap = parseFloat(style.columnGap);
      const width = strip.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const first = strip.firstElementChild;
      const minColumn = first ? parseFloat(getComputedStyle(first).minWidth) : 0;
      const shown = Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
      strip.style.setProperty(
        "--season-column",
        shown < strip.children.length ? `${(width - gap * (shown - 1)) / shown}px` : null,
      );
      const active = strip.querySelector<HTMLElement>('[data-active="true"]');
      if (active) strip.scrollLeft += active.getBoundingClientRect().left - strip.getBoundingClientRect().left - parseFloat(style.paddingLeft);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [selectedSeason]);
  const team = params.get("team") ?? "";
  const category = params.get("type") ?? "";
  const gameId = params.get("game") ?? "";
  const [pageSize, setPageSize] = useState(20);
  const [showAllTypes, setShowAllTypes] = useState(false);
  // Only the selected season's games are fetched; the page carries every season's totals.
  const { data: seasonGames, error: gamesError, mutate: retryGames, isValidating } = useSWR<ReviewGame[]>(
    heldCurrent ? null : `/api/officiating/${season.season}`,
    apiFetcher,
    { revalidateOnFocus: false },
  );
  const games = filterReviews(seasonGames ?? [], team, category);
  const total = season.missed + season.wrong;
  const percent = total ? (season.missed / total) * 100 : null;
  const categories = Object.entries(season.categories)
    .map(([name, count]) => [name, count ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const teams = [
    ...new Set((seasonGames ?? []).flatMap((g) => [g.home, g.away])),
  ].sort();
  const displayCount = Math.max(
    pageSize,
    games.findIndex((g) => g.id === gameId) + 1,
  );
  const recent = visibleSeasons.slice(-3);
  const rates = recent.map((s) => (s.missed + s.wrong) / s.gameCount);
  const monotonic =
    rates.length === 3 &&
    (rates.every((v, i) => i === 0 || v > rates[i - 1]) ||
      rates.every((v, i) => i === 0 || v < rates[i - 1]));
  function update(next: {
    season?: string;
    team?: string;
    category?: string;
    game?: string;
  }) {
    updateQuery({
      season: next.season ?? selectedSeason,
      team: (next.team ?? team) || null,
      type: (next.category ?? category) || null,
      game: (next.game ?? gameId) || null,
    });
  }
  if (heldCurrent) return <div className={`flex flex-col gap-12 ${styles.page}`}>
    <PageHeader eyebrow="NBA L2M · REGULAR SEASON" title="Officiating"
      description="What the NBA’s Last Two Minute reports found in close games." />
    <SeasonSelector id="officiating-season" season={selectedSeason} seasons={selectableSeasons}
      onSeasonChange={(value) => update({ season: value, game: "", category: "" })} />
    {!hasCurrentPublication ? <SeasonDataGuide title="Awaiting results" season={currentSeason}
      body="Last Two Minute reports for this season have not been published."
      previousHref={previous ? `/officiating?season=${previous.season}` : undefined}
      previousLabel={previous ? `View published results · ${previous.season}` : undefined} /> : <SeasonReadinessNotice readiness={readiness} season={currentSeason}
      body="New-season officiating results are not available yet. Earlier published Last Two Minute reports remain available."
      previousHref={previous ? `/officiating?season=${previous.season}` : undefined}
      previousLabel={previous ? `View published results · ${previous.season}` : undefined} />}
  </div>;

  return (
    <div className={`flex flex-col gap-12 ${styles.page}`}>
      <div className={styles.heading}>
        <PageHeader
          eyebrow="NBA L2M · REGULAR SEASON"
          title="Officiating"
          description="What the NBA’s Last Two Minute reports found in close games."
        />
        <div className={styles.controls}>
          <SeasonSelector
            id="officiating-season"
            season={season.season}
            seasons={selectableSeasons}
            onSeasonChange={(value) => {
              setPageSize(20);
              update({ season: value, game: "", category: "" });
            }}
          />
          <p className={styles.freshness}>
            Data through {displayDate(season.through)}
          </p>
          <p className={styles.freshness}>
            Last successful refresh{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "America/New_York",
            }).format(new Date(season.refreshedAt))}
          </p>
        </div>
      </div>
      {requested && requested !== season.season ? <p role="status" className="text-body text-[var(--term-text-muted)]">
        {requested} is not available here. Showing published reports for {season.season}.
      </p> : null}
      {!requested && season.season < currentSeason ? (
        <p role="status" className="text-body text-[var(--term-text-muted)]">Showing {season.season}, the latest published reports. {currentSeason} results are not available yet.</p>
      ) : null}
      <div>
        <p className="mb-4 text-body text-[var(--term-text-muted)]">
          {season.season === "2014-15" ? "Partial season: reports begin with March 1, 2015 games. " : ""}
          {season.season < "2017-18" ? "These reports used the earlier five-point review rule. " : ""}
          Review criteria changed in 2017–18. <a className="underline" href="/behind-the-data/officiating">How coverage differs</a>
        </p>
        <section className={styles.hero} aria-label="Season finding">
          <a className="fc-text-link mb-4 inline-block min-h-11 content-center" href="#game-reviews">Jump to game reviews ↓</a>
          <div className={styles.heroTop}>
            <div>
              <div className={styles.big}>
                {percent === null ? "—" : `${Math.round(percent)}%`}
              </div>
              <h2 className={styles.heroSub}>
                {percent === null ? (
                  "No identified errors in these reports"
                ) : (
                  <>
                    of identified errors
                    <br />
                    were missed calls
                  </>
                )}
              </h2>
            </div>
            <div>
              <div className={styles.barCaption}>
                <span className={styles.blue}>Missed {season.missed}</span>
                <span className={styles.gray}>
                  Wrong whistle {season.wrong}
                </span>
              </div>
              <div className={styles.split} aria-hidden="true">
                <span style={{ width: `${percent ?? 0}%` }} />
                <span
                  style={{ width: `${percent === null ? 0 : 100 - percent}%` }}
                />
              </div>
              <p className={styles.denominator}>
                {total} identified errors, {season.gameCount} reviewed games
              </p>
              <div className={styles.stripLabel}>
                Missed share of identified errors · regular season
              </div>
              <div className={styles.stripWrap}>
                <div className={styles.axis}>
                  <span>100%</span>
                  <span>50%</span>
                </div>
                <ScrollCue
                  className={styles.strip}
                  ref={stripRef}
                  tabIndex={0}
                  role="region"
                  aria-label="Season comparison; scroll for more seasons"
                >
                  {visibleSeasons.map((s) => {
                    const share =
                      s.missed + s.wrong
                        ? (s.missed / (s.missed + s.wrong)) * 100
                        : null;
                    return (
                      <div className={styles.seasonColumn} key={s.season} data-active={s.season === season.season}>
                        <span className={styles.seasonValue}>
                          {share === null ? "—" : `${share.toFixed(1)}%`}
                        </span>
                        <div className={styles.plot}>
                          <div
                            className={
                              s.season === season.season
                                ? styles.latestBar
                                : styles.priorBar
                            }
                            style={{
                              height: `${share === null ? 0 : Math.max(0, (share - 50) * 2)}%`,
                            }}
                          />
                        </div>
                        <span>{s.season}</span>
                        {share !== null && share < 50 && (
                          <span>Below scale</span>
                        )}
                      </div>
                    );
                  })}
                </ScrollCue>
              </div>
            </div>
          </div>
          <p className={styles.caveat}>
            Covers only the close-game endings the NBA chose to review.
          </p>
        </section>
        <section className={styles.trend}>
          <div>
            <h3>Is officiating getting worse?</h3>
            <p>
              {monotonic
                ? "The recorded rate changed consistently; different games get reviewed each season."
                : `No clear trend across these ${recent.length} seasons; the reviewed games differ.`}
            </p>
          </div>
          <div>
            <p className={styles.stripLabel}>Errors per reviewed game · latest three seasons</p>
            <div className={styles.trendValues}>
              {recent.map((s) => (
                <div key={s.season}>
                  <strong>
                    {((s.missed + s.wrong) / s.gameCount).toFixed(2)}
                  </strong>
                  <span>{s.season}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <section id="game-reviews" className="scroll-mt-20" aria-labelledby="review-title">
        <h2 id="review-title">Late-game reviews</h2>
        <div className={styles.filterLabel}>
          <span>Errors by call type</span>
          <span>Browser filters only</span>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.chipShell}>
            <ScrollCue className={styles.chips} role="group" aria-label="Call-type filters">
              <button
                aria-pressed={!category}
                onClick={() => {
                  setPageSize(20);
                  update({ category: "", game: "" });
                }}
              >
                All <span>{total}</span>
              </button>
              {categories.filter(([name], index) => showAllTypes || index < 5 || name === category).map(([name, count]) => (
                <button
                  aria-pressed={category === name}
                  key={name}
                  onClick={() => {
                    setPageSize(20);
                    update({ category: name, game: "" });
                  }}
                >
                  {categoryLabel(name)} <span>{count}</span>
                </button>
              ))}
            </ScrollCue>
          </div>
          <button type="button" aria-expanded={showAllTypes} onClick={() => setShowAllTypes(!showAllTypes)} className={styles.allTypes}>{showAllTypes ? "Fewer call types" : `All ${categories.length} call types`}</button>
          <label className={styles.teamLabel}>
            <span className="sr-only">Team</span>
            <select
              aria-label="Team"
              value={team}
              onChange={(e) => {
                setPageSize(20);
                update({ team: e.target.value, game: "" });
              }}
            >
              <option value="">All teams</option>
              {team && !teams.includes(team) && (
                <option value={team}>{seasonGames ? `${team} (not in this season)` : team}</option>
              )}
              {teams.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        {!seasonGames ? (
          gamesError ? (
            <MessageCard tone="error" title="FAILED TO LOAD REVIEWED GAMES" body={errMsg(gamesError)}
              action={<button type="button" className="fc-text-link min-h-11" disabled={isValidating}
                onClick={() => { void retryGames().catch(() => undefined); }}>
                {isValidating ? "Retrying…" : "Retry reviewed games"}
              </button>} />
          ) : (
            <p role="status" className={styles.notice}>Loading reviewed games…</p>
          )
        ) : (<>
        <div className={styles.listMeta}>
          <p role="status">
            {games.length} reviewed games · newest first
            {category ? ` · ${categoryLabel(category)} · game counts include all error types` : ""}
          </p>
          {(team || category) && (
            <button
              onClick={() => update({ team: "", category: "", game: "" })}
            >
              Clear filters
            </button>
          )}
        </div>
        {gameId && !games.some((g) => g.id === gameId) && (
          <p role="status" className={styles.notice}>
            The linked game is not available under these filters.{" "}
            <button onClick={() => update({ team: "", category: "" })}>
              Show all games
            </button>
          </p>
        )}
        <div className={styles.tableHead} aria-hidden="true">
          <span>Matchup</span>
          <span>Date</span>
          <span className={styles.blue}>Missed</span>
          <span className={styles.gray}>Wrong whistle</span>
          <span />
        </div>
        {!games.length && (
          <div className={styles.notice}>
            <h3>No reports match these filters.</h3>
            <p>
              Clear the team or call-type filter to return to the season’s
              reviewed games.
            </p>
            <button
              onClick={() => update({ team: "", category: "", game: "" })}
            >
              Clear filters
            </button>
          </div>
        )}
        {games.slice(0, displayCount).map((g) => {
          const clean = g.missed + g.wrong === 0;
          return (
            <details
              key={g.id}
              id={`review-${g.id}`}
              open={gameId === g.id}
              className={`${styles.game} ${clean ? styles.clean : ""}`}
            >
              <summary
                className={styles.gameRow}
                onClick={(e) => {
                  e.preventDefault();
                  update({ game: gameId === g.id ? "" : g.id });
                }}
              >
                <span className={styles.matchup}>
                  <span className={styles.mark}>{g.away}</span>
                  {g.awayName}
                  <span className={styles.opponent}>
                    <span className={styles.mark}>{g.home}</span>
                    {g.homeName}
                  </span>
                </span>
                <span className={styles.date}>{displayDate(g.date)}</span>
                {clean ? (
                  <span className={styles.cleanLabel}>
                    No errors identified
                  </span>
                ) : (
                  <>
                    <span className={`${styles.count} ${styles.blue}`}>
                      <span className="sr-only">Missed </span>
                      {g.missed}
                    </span>
                    <span className={`${styles.count} ${styles.gray}`}>
                      <span className="sr-only">Wrong whistle </span>
                      {g.wrong}
                    </span>
                  </>
                )}
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
                <span className={styles.mobileCounts}>
                  {clean ? (
                    "No errors identified"
                  ) : (
                    <>
                      <span className={styles.blue}>Missed {g.missed}</span> ·{" "}
                      <span className={styles.gray}>Wrong {g.wrong}</span>
                    </>
                  )}
                </span>
              </summary>
              {gameId === g.id && (
                <OfficiatingReport
                  key={`${g.id}:${category}`}
                  game={g}
                  season={season.season}
                  category={category}
                  shareHref={reviewUrl(season.season, team, category, g.id)}
                />
              )}
            </details>
          );
        })}
        {displayCount < games.length && (
          <button
            className={styles.more}
            onClick={() => setPageSize(displayCount + 20)}
          >
            Show more games ({games.length - displayCount} remaining)
          </button>
        )}
        </>)}
      </section>
      <footer className={styles.footer}>
        <Link href="/behind-the-data/officiating">Behind the Data ↗</Link>
        <p>
          These reports cannot establish whole-game accuracy, attribute an error
          to a specific official, or support team helped/hurt rankings.
        </p>
      </footer>
    </div>
  );
}
