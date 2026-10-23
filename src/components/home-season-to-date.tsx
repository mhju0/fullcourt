"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/fetcher";
import { defaultNbaSeason } from "@/lib/nba-season";
import type { SeasonReportResponse } from "@/lib/season-report";
import { TransitionLink } from "@/components/transition-link";
import styles from "./home.module.css";

export function HomeSeasonToDate() {
  const season = defaultNbaSeason();
  const { data, error } = useSWR<SeasonReportResponse>(`/api/season-report?season=${season}`, apiFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true });
  const aligned = data?.season === season ? data : undefined;
  return <section aria-label="Current season results" className={styles.discover} data-testid="home-season-to-date">
    <div>
      <h2>{season} · Season to date</h2>
      {aligned && aligned.completedGames > 0 ? <>
        <p>{aligned.homeRate.homeWins} home wins / {aligned.homeRate.games} eligible games
          {aligned.homeRate.games > 0 ? ` · ${aligned.homeRate.winPct.toFixed(1)}%` : " · No eligible home games"}.
          {aligned.latestFinalDate ? ` Results through ${aligned.latestFinalDate} (ET).` : ""}</p>
        <p>{aligned.overall.games > 0
          ? `${aligned.overall.restedTeamWins} wins / ${aligned.overall.games} games with the more-rested team at home.`
          : "No completed games with the more-rested team at home yet."}
          {aligned.missingFatigueGames > 0 ? ` Rest data is pending for ${aligned.missingFatigueGames} additional final games.` : ""}
          {" "}Counts change as games are played and results are updated.</p>
      </> : <p>{error ? "Current-season results could not be loaded." : aligned ? "No eligible completed games yet." : "Checking current-season results…"}</p>}
    </div>
    <TransitionLink href={`/season?season=${season}`} className={styles.textLink}>Open this season’s report <span aria-hidden="true">→</span></TransitionLink>
  </section>;
}
