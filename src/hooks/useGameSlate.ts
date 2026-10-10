"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { useLiveGames } from "@/hooks/useLiveGames";
import { LOCATION_CHANGE } from "@/hooks/useSeasonUrl";
import { readSlateUrl, slateUrl } from "@/lib/game-slate-url";
import { errMsg } from "@/lib/fetcher";
import { isLeavingPage } from "@/lib/route-transition";
import {
  calendarView,
  daysInMonth,
  initSlate,
  monthCalendar,
  monthTabs,
  slateMonth,
  slateReducer,
  weekDays,
  type CalendarView,
  type MonthTab,
  type SlateDay,
  type SlateGame,
  type SlateIntent,
  type SlateStatus,
} from "@/lib/game-slate-machine";
import {
  defaultNbaCalendarMonth,
  currentDisplaySeason,
  slateDateKey,
} from "@/lib/nba-season";
import type { ApiResponse, GameDateCount, GameResponse } from "@/types";

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";

export interface GameSlate {
  urlReady: boolean;
  season: string;
  /** Derived from the selected date. Drives which month tab is active. */
  month: number;
  months: readonly MonthTab[];
  /** Day chips for `month`, pre-formatted. */
  days: readonly SlateDay[];
  /** The Sunday-to-Saturday week around the selected date, days without games included. */
  week: readonly SlateDay[];
  /** Every calendar day of the selected month, Sunday-first. */
  monthGrid: { leadingBlanks: number; days: readonly SlateDay[] };
  /** Which of the four chip-region renderings applies. */
  calendar: CalendarView;
  selectedDate: string | null;
  lastDate: string | null;
  selectedLabel: { long: string; short: string } | null;
  /** The selected day's games, with the Realtime overlay applied. */
  games: readonly SlateGame[];
  status: SlateStatus;
  /** Non-null only for the two error statuses. */
  message: string | null;
  send: (intent: SlateIntent) => void;
}

/** Both endpoints answer in the `{ data, error }` envelope. */
async function readEnvelopeOnce<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json()) as ApiResponse<T>;
  if (body.error !== null) throw new Error(body.error);
  return body.data;
}

const RETRY_DELAY_MS = 800;

/**
 * One quiet second attempt before the failure card. A production 500 on 2026-10-03 succeeded on
 * the next three requests; a visitor should not have to know to reload for that.
 */
async function readEnvelope<T>(url: string, signal: AbortSignal): Promise<T> {
  try {
    return await readEnvelopeOnce<T>(url, signal);
  } catch (err) {
    if (signal.aborted || isAbort(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return readEnvelopeOnce<T>(url, signal);
  }
}
const noon = (dateKey: string) => parseISO(`${dateKey}T12:00:00`);

export function useGameSlate(): GameSlate {
  // Both frozen at mount: "today" in the NBA's Eastern calendar, and the month to
  // show before any date exists. Constants, so nothing can drift out of sync.
  // "Today" holds until 6 AM ET so late games stay on the board past midnight.
  const [seed] = useState(() => ({
    season: currentDisplaySeason(),
    fallbackMonth: defaultNbaCalendarMonth(),
    todayKey: slateDateKey(),
  }));

  const [state, dispatch] = useReducer(slateReducer, seed, initSlate);
  const { season, selectedDate, attempt } = state;
  const [urlReady, setUrlReady] = useState(false);
  const historyMode = useRef<"push" | "replace">("replace");

  useEffect(() => {
    const restore = () => {
      const location = readSlateUrl(window.location.search, seed.season, seed.todayKey);
      historyMode.current = "replace";
      dispatch({ type: "LOCATION_RESTORED", ...location });
      setUrlReady(true);
    };
    let active = true;
    queueMicrotask(() => { if (active) restore(); });
    window.addEventListener("popstate", restore);
    return () => {
      active = false;
      window.removeEventListener("popstate", restore);
    };
  }, [seed]);

  useEffect(() => {
    if (!urlReady) return;
    // The visitor is already on their way to another page; writing this one's URL now would
    // cancel that navigation.
    if (isLeavingPage()) return;
    const url = slateUrl(window.location.href, season, selectedDate);
    if (url.href !== window.location.href) {
      if (historyMode.current === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    window.dispatchEvent(new Event(LOCATION_CHANGE));
    historyMode.current = "replace";
  }, [season, selectedDate, urlReady]);

  // One fetch per season, no `month` param. That is what lets a month click
  // resolve from memory instead of racing a round trip.
  useEffect(() => {
    if (!urlReady) return;
    const controller = new AbortController();
    readEnvelope<GameDateCount[]>(
      `/api/games/dates?season=${encodeURIComponent(season)}`,
      controller.signal
    )
      .then((days) => {
        if (!controller.signal.aborted) dispatch({ type: "DAYS_RESOLVED", days });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        dispatch({
          type: "DAYS_REJECTED",
          message: errMsg(err),
        });
      });
    return () => controller.abort();
  }, [season, urlReady, attempt]);

  // The reducer drops responses for a date that is no longer selected, so a slow
  // reply cannot overwrite a newer one even if its abort loses the race.
  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();
    readEnvelope<GameResponse[]>(`/api/games/${selectedDate}`, controller.signal)
      .then((games) => dispatch({ type: "SLATE_RESOLVED", date: selectedDate, games }))
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        dispatch({
          type: "SLATE_REJECTED",
          date: selectedDate,
          message: errMsg(err),
        });
      });
    return () => controller.abort();
  }, [selectedDate, attempt]);

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

  const toSlateDay = useCallback(
    ({ date, gameCount }: GameDateCount): SlateDay => {
      const label = format(noon(date), "MMMM d, yyyy");
      return {
        date,
        gameCount,
        label,
        dayOfMonth: format(noon(date), "d"),
        ariaLabel: `${format(noon(date), "EEEE")}, ${label}, ${gameCount} ${gameCount === 1 ? "game" : "games"}`,
        isSelected: date === state.selectedDate,
      };
    },
    [state.selectedDate]
  );
  const week = useMemo(() => weekDays(state).map(toSlateDay), [state, toSlateDay]);
  const monthGrid = useMemo(() => {
    const { leadingBlanks, days: all } = monthCalendar(state);
    return { leadingBlanks, days: all.map(toSlateDay) };
  }, [state, toSlateDay]);

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

  const send = useCallback((intent: SlateIntent) => {
    historyMode.current = "push";
    dispatch(intent);
  }, []);

  return {
    urlReady,
    season,
    month: slateMonth(state),
    months: monthTabs(state),
    days,
    week,
    monthGrid,
    calendar: calendarView(state),
    selectedDate,
    lastDate: state.days.reduce<string | null>((last, day) => !last || day.date > last ? day.date : last, null),
    selectedLabel,
    games,
    status: state.status,
    message: state.message,
    send,
  };
}
