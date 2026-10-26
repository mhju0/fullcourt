"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { useLiveGames } from "@/hooks/useLiveGames";
import { LOCATION_CHANGE } from "@/hooks/useSeasonUrl";
import { readSlateUrl, slateUrl } from "@/lib/game-slate-url";
import { apiFetcher, errMsg } from "@/lib/fetcher";
import { createSlateRefresh, shouldRefreshSlate } from "@/lib/slate-refresh";
import { isLeavingPage } from "@/lib/route-transition";
import {
  calendarView,
  canShiftDay,
  daysInMonth,
  initSlate,
  monthCalendar,
  monthTabs,
  slateMonth,
  seasonCalendarDays,
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
import { gameDayContext, type GameDayContext } from "@/lib/game-day-context";
import type { GameDateCount, GameResponse } from "@/types";

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
  canPreviousDay: boolean;
  canNextDay: boolean;
  emptyContext: GameDayContext | null;
  selectedLabel: { long: string; short: string } | null;
  /** The selected day's authoritative games. */
  games: readonly SlateGame[];
  status: SlateStatus;
  /** Non-null only for the two error statuses. */
  message: string | null;
  refreshStatus: "idle" | "refreshing" | "error";
  refreshMessage: string | null;
  checkedAt: number | null;
  retryRefresh: () => void;
  send: (intent: SlateIntent) => void;
  syncRouteSearch: (search: string) => void;
}

const RETRY_DELAY_MS = 800;

/**
 * One quiet second attempt before the failure card. A production 500 on 2026-10-03 succeeded on
 * the next three requests; a visitor should not have to know to reload for that.
 */
async function readEnvelope<T>(url: string, signal: AbortSignal): Promise<T> {
  try {
    return await apiFetcher<T>(url, { signal });
  } catch (err) {
    if (signal.aborted || isAbort(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return apiFetcher<T>(url, { signal });
  }
}
const noon = (dateKey: string) => parseISO(`${dateKey}T12:00:00`);
const selectionKey = (search: string) => {
  const params = new URLSearchParams(search);
  return JSON.stringify([params.get("season"), params.get("date")]);
};

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
  const { season, selectedDate, attempt, generation, daysGeneration } = state;
  const refreshRef = useRef<(() => void) | null>(null);
  const latestState = useRef(state);
  useEffect(() => { latestState.current = state; }, [state]);
  const invalidate = useCallback(() => {
    if (document.visibilityState === "visible" && navigator.onLine) refreshRef.current?.();
  }, []);
  const [urlReady, setUrlReady] = useState(false);
  const historyMode = useRef<"push" | "replace">("replace");
  const [routeSearch, syncRouteSearch] = useState<string | null>(null);
  const routeSelection = routeSearch === null ? null : selectionKey(routeSearch);
  const observedRoute = useRef<string | null>(null);
  const writtenSelection = useRef<string | null>(null);
  const restoringRoute = useRef(false);

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
    if (routeSelection === null || routeSearch === null) return;
    if (observedRoute.current === null) {
      observedRoute.current = routeSelection;
      return;
    }
    if (observedRoute.current === routeSelection) return;
    observedRoute.current = routeSelection;
    // A slow router commit can describe an older address than the one already on screen.
    if (routeSelection !== selectionKey(window.location.search)) return;
    if (writtenSelection.current === routeSelection) {
      writtenSelection.current = null;
      return;
    }
    writtenSelection.current = null;
    restoringRoute.current = true;
    historyMode.current = "replace";
    dispatch({ type: "LOCATION_RESTORED", ...readSlateUrl(routeSearch, seed.season, seed.todayKey) });
  }, [routeSearch, routeSelection, seed]);

  useEffect(() => {
    if (!urlReady) return;
    // Apply a same-page navigation before the old slate is allowed to canonicalize its URL.
    if (restoringRoute.current) {
      restoringRoute.current = false;
      return;
    }
    // The visitor is already on their way to another page; writing this one's URL now would
    // cancel that navigation.
    if (isLeavingPage()) return;
    const url = slateUrl(window.location.href, season, selectedDate);
    if (url.href !== window.location.href) {
      writtenSelection.current = selectionKey(url.search);
      if (historyMode.current === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    }
    window.dispatchEvent(new Event(LOCATION_CHANGE));
    historyMode.current = "replace";
  }, [season, selectedDate, urlReady, routeSelection]);

  // One fetch per season, no `month` param. That is what lets a month click
  // resolve from memory instead of racing a round trip.
  useEffect(() => {
    if (!urlReady) return;
    const loader = createSlateRefresh({
      load: (signal) => readEnvelope<GameDateCount[]>(
        `/api/games/dates?season=${encodeURIComponent(season)}`, signal,
      ),
      resolved: (days) => dispatch({ type: "DAYS_RESOLVED", season, generation: daysGeneration, days }),
      rejected: (err) => dispatch({
        type: "DAYS_REJECTED",
        season,
        generation: daysGeneration,
        message: errMsg(err),
      }),
    });
    return () => loader.dispose();
  }, [season, urlReady, daysGeneration]);

  useEffect(() => {
    if (!selectedDate) return;
    const loader = createSlateRefresh({
      load: (signal) => readEnvelope<GameResponse[]>(`/api/games/${selectedDate}`, signal),
      hasData: latestState.current.status === "slateReady" || latestState.current.status === "slateEmpty",
      started: (background) => { if (background) dispatch({ type: "SLATE_REFRESH_STARTED", date: selectedDate, generation }); },
      resolved: (games) => dispatch({ type: "SLATE_RESOLVED", date: selectedDate, generation, games, checkedAt: Date.now() }),
      rejected: (err, background) => dispatch({ type: "SLATE_REJECTED", date: selectedDate, generation, background, message: errMsg(err) }),
    });
    refreshRef.current = loader.refresh;
    const refreshVisible = () => {
      if (shouldRefreshSlate({ selectedDate, today: slateDateKey(), games: latestState.current.games,
        visible: document.visibilityState === "visible", online: navigator.onLine })) invalidate();
    };
    const interval = setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      refreshRef.current = null;
      loader.dispose();
      clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [selectedDate, attempt, generation, invalidate]);

  const gameIds = useMemo(() => state.games.map((g) => g.id), [state.games]);
  useLiveGames(gameIds, invalidate);
  const games = useMemo<readonly SlateGame[]>(
    () => state.games.map((game) => ({ ...game, isScoreFlashing: false })),
    [state.games]
  );

  const toSlateDay = useCallback(
    ({ date, gameCount, disabled }: GameDateCount & { disabled?: boolean }): SlateDay => {
      const label = format(noon(date), "MMMM d, yyyy");
      const actualCount = date === state.selectedDate && state.status === "slateReady" ? state.games.length : gameCount;
      const context = gameDayContext({ season, date, gameCount: actualCount, today: slateDateKey() });
      const count = context?.count ?? actualCount;
      return {
        date,
        gameCount: count,
        disabled,
        label,
        dayOfMonth: format(noon(date), "d"),
        ariaLabel: `${format(noon(date), "EEEE")}, ${label}, ${count === "TBD" ? "games TBD" : count === "—" ? "game count unavailable" : `${count} ${count === 1 ? "game" : "games"}`}`,
        isSelected: date === state.selectedDate,
      };
    },
    [state.selectedDate, state.status, state.games, season]
  );
  const days = useMemo(() => daysInMonth(state).map(toSlateDay), [state, toSlateDay]);
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

  const retryRefresh = useCallback(() => refreshRef.current?.(), []);

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
    canPreviousDay: canShiftDay(state, -1),
    canNextDay: canShiftDay(state, 1),
    emptyContext: state.status === "slateEmpty" && selectedDate
      ? gameDayContext({ season, date: selectedDate, gameCount: state.days.find(day => day.date === selectedDate)?.gameCount ?? 0, today: slateDateKey(), inSeason: seasonCalendarDays(state).some(day => day.date === selectedDate) }) : null,
    selectedLabel,
    games,
    status: state.status,
    message: state.message,
    refreshStatus: state.refreshStatus,
    refreshMessage: state.refreshMessage,
    checkedAt: state.checkedAt,
    retryRefresh,
    send,
    syncRouteSearch,
  };
}
