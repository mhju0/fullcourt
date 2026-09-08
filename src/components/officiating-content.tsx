"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SeasonSelector } from "@/components/season-selector";
import { OfficiatingReport } from "@/components/officiating-report";
import {
  categoryLabel,
  filterReviews,
  reviewUrl,
  type ReviewSeason,
} from "@/lib/officiating";
import styles from "./officiating.module.css";

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${date}T12:00:00-05:00`));
}
export function OfficiatingContent({ seasons }: { seasons: ReviewSeason[] }) {
  const params = useSearchParams();
  const requested = params.get("season");
  const season =
    seasons.find((s) => s.season === requested) ?? seasons[seasons.length - 1];
  const team = params.get("team") ?? "";
  const category = params.get("type") ?? "";
  const gameId = params.get("game") ?? "";
  const [pageSize, setPageSize] = useState(20);
  const games = filterReviews(season.games, team, category);
  const total = season.missed + season.wrong;
  const percent = total ? (season.missed / total) * 100 : null;
  const categories = Object.entries(season.categories)
    .map(([name, count]) => [name, count ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const teams = [
    ...new Set(season.games.flatMap((g) => [g.home, g.away])),
  ].sort();
  const displayCount = Math.max(
    pageSize,
    games.findIndex((g) => g.id === gameId) + 1,
  );
  const recent = seasons.slice(-3);
  const rates = recent.map((s) => (s.missed + s.wrong) / s.games.length);
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
    window.history.pushState(
      null,
      "",
      reviewUrl(
        next.season ?? season.season,
        next.team ?? team,
        next.category ?? category,
        next.game ?? gameId,
      ),
    );
  }
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
            seasons={seasons.map((s) => s.season)}
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
      <div>
        <section className={styles.hero} aria-label="Season finding">
          <a className="fc-text-link mb-4 inline-block min-h-11 content-center" href="#game-reviews">Jump to game reviews ↓</a>
          <div className={styles.heroTop}>
            <div>
              <div className={styles.big}>
                {percent === null ? "—" : `${Math.round(percent)}%`}
              </div>
              <h2 className={styles.heroSub}>
                {percent === null ? (
                  "No identified errors in these reports."
                ) : (
                  <>
                    of identified errors
                    <br />
                    were missed calls.
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
                {total} identified errors, {season.games.length} reviewed games
              </p>
              <div className={styles.stripLabel}>
                Missed share of identified errors · regular season
              </div>
              <div className={styles.stripWrap}>
                <div className={styles.axis}>
                  <span>100%</span>
                  <span>50%</span>
                </div>
                <div
                  className={styles.strip}
                  tabIndex={0}
                  role="region"
                  aria-label="Season comparison; scroll for more seasons"
                >
                  {seasons.map((s, i) => {
                    const share =
                      s.missed + s.wrong
                        ? (s.missed / (s.missed + s.wrong)) * 100
                        : null;
                    return (
                      <div className={styles.seasonColumn} key={s.season}>
                        <span className={styles.seasonValue}>
                          {share === null ? "—" : `${share.toFixed(1)}%`}
                        </span>
                        <div className={styles.plot}>
                          <div
                            className={
                              i === seasons.length - 1
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
                </div>
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
            <p className={styles.stripLabel}>Errors per reviewed game</p>
            <div className={styles.trendValues}>
              {recent.map((s) => (
                <div key={s.season}>
                  <strong>
                    {((s.missed + s.wrong) / s.games.length).toFixed(2)}
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
            <div className={styles.chips} aria-label="Call-type filters">
              <button
                aria-pressed={!category}
                onClick={() => {
                  setPageSize(20);
                  update({ category: "", game: "" });
                }}
              >
                All <span>{total}</span>
              </button>
              {categories.map(([name, count]) => (
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
            </div>
          </div>
          <label className={styles.teamLabel}>
            Team
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
                <option value={team}>{team} (not in this season)</option>
              )}
              {teams.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
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
