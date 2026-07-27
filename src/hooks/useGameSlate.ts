"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { format, parseISO } from "date-fns";
import { useLiveGames } from "@/hooks/useLiveGames";
import {
  calendarView,
  daysInMonth,
  initSlate,
  monthTabs,
  slateMonth,
  slateReducer,
  type CalendarView,
  type MonthTab,
  type SlateDay,
  type SlateGame,
  type SlateIntent,
  type SlateStatus,
} from "@/lib/game-slate-machine";
import {
  defaultNbaCalendarMonth,
  defaultNbaSeason,
  formatEasternDateKey,
} from "@/lib/nba-season";
import type { ApiResponse, GameDateCount, GameResponse } from "@/types";

/**
 * React shell over {@link slateReducer}. It owns exactly three things the reducer
 * cannot: the two fetches, the Realtime overlay, and date formatting. Every
 * decision about *what the state becomes* lives in the reducer, which is why the
 * logic is unit-tested without a DOM.
 */
export interface GameSlate {
  season: string;
  /** Derived from the selected date. Drives which month tab is active. */
  month: number;
  months: readonly MonthTab[];
  /** Day chips for `month`, pre-formatted. */
  days: readonly SlateDay[];
  /** Which of the four chip-region renderings applies. */
  calendar: CalendarView;
  selectedDate: string | null;
  selectedLabel: { long: string; short: string } | null;
  /** The selected day's games, with the Realtime overlay applied. */
  games: readonly SlateGame[];
  status: SlateStatus;
  /** Non-null only for the two error statuses. */
  message: string | null;
  send: (intent: SlateIntent) => void;
}

/** Both endpoints answer in the `{ data, error }` envelope. */
async function readEnvelope<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const { data, error } = (await res.json()) as ApiResponse<T>;
  if (error) throw new Error(error);
  return data;
}

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";
const noon = (dateKey: string) => parseISO(`${dateKey}T12:00:00`);

export function useGameSlate(): GameSlate {
  // Both frozen at mount: "today" in the NBA's Eastern calendar, and the month to
  // show before any date exists. Constants, so nothing can drift out of sync.
  const [seed] = useState(() => ({
    season: defaultNbaSeason(),
    fallbackMonth: defaultNbaCalendarMonth(),
    todayKey: formatEasternDateKey(),
  }));

  const [state, dispatch] = useReducer(slateReducer, seed, initSlate);
  const { season, selectedDate } = state;

  // One fetch per season, no `month` param. That is what lets a month click
  // resolve from memory instead of racing a round trip.
  useEffect(() => {
    const controller = new AbortController();
    readEnvelope<GameDateCount[]>(
      `/api/games/dates?season=${encodeURIComponent(season)}`,
      controller.signal
    )
      .then((days) => dispatch({ type: "DAYS_RESOLVED", days }))
      .catch((err: unknown) => {
        if (isAbort(err)) return;
        dispatch({
          type: "DAYS_REJECTED",
          message: err instanceof Error ? err.message : "Failed to load dates",
        });
      });
    return () => controller.abort();
  }, [season]);

  // The reducer drops responses for a date that is no longer selected, so a slow
  // reply cannot overwrite a newer one even if its abort loses the race.
  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();
    readEnvelope<GameResponse[]>(`/api/games/${selectedDate}`, controller.signal)
      .then((games) => dispatch({ type: "SLATE_RESOLVED", date: selectedDate, games }))
      .catch((err: unknown) => {
        if (isAbort(err)) return;
        dispatch({
          type: "SLATE_REJECTED",
          date: selectedDate,
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      });
    return () => controller.abort();
  }, [selectedDate]);

  const gameIds = useMemo(() => state.games.map((g) => g.id), [state.games]);
  const { liveUpdates, recentlyUpdated } = useLiveGames(gameIds);

  const games = useMemo<readonly SlateGame[]>(
    () =>
      state.games.map((g) => {
        const update = liveUpdates[g.id];
        return {
          ...g,
          homeScore: update?.homeScore ?? g.homeScore,
          awayScore: update?.awayScore ?? g.awayScore,
          status: update?.status ?? g.status,
          isScoreFlashing: recentlyUpdated.has(g.id),
        };
      }),
    [state.games, liveUpdates, recentlyUpdated]
  );

  const days = useMemo<readonly SlateDay[]>(
    () =>
      daysInMonth(state).map(({ date, gameCount }) => {
        const label = format(noon(date), "MMMM d, yyyy");
        return {
          date,
          gameCount,
          label,
          dayOfMonth: format(noon(date), "d"),
          ariaLabel: `${label}, ${gameCount} games`,
          isSelected: date === state.selectedDate,
        };
      }),
    [state]
  );

  const selectedLabel = useMemo(
    () =>
      state.selectedDate
        ? {
            long: format(noon(state.selectedDate), "EEEE, MMMM d, yyyy"),
            short: format(noon(state.selectedDate), "MMMM d, yyyy"),
          }
        : null,
    [state.selectedDate]
  );

  const send = useCallback((intent: SlateIntent) => dispatch(intent), []);

  return {
    season,
    month: slateMonth(state),
    months: monthTabs(state),
    days,
    calendar: calendarView(state),
    selectedDate,
    selectedLabel,
    games,
    status: state.status,
    message: state.message,
    send,
  };
}
