"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

export const LOCATION_CHANGE = "fc:location-change";
const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener(LOCATION_CHANGE, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener(LOCATION_CHANGE, notify);
  };
};
const snapshot = () => window.location.search;
const serverSnapshot = () => "";

export function useLocationSearch() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

function useRouteSearch() {
  const search = useSearchParams().toString();
  useEffect(() => {
    window.dispatchEvent(new Event(LOCATION_CHANGE));
  }, [search]);
  return search;
}

export function useSeasonUrl(fallback: string, seasons: readonly string[]) {
  const search = useRouteSearch();
  const requested = new URLSearchParams(search).get("season");
  const season =
    requested && seasons.includes(requested) ? requested : fallback;
  const setSeason = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("season", value);
    url.searchParams.delete("date");
    window.history.pushState(null, "", url);
  }, []);
  return {
    season,
    setSeason,
    fallbackNote:
      requested && requested !== season
        ? `${requested} is unavailable on this page. Showing ${season}.`
        : null,
  };
}

export function usePageQuery() {
  const search = useRouteSearch();
  const update = useCallback(
    (values: Record<string, string | null>, replace = false) => {
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries(values)) {
        if (value === null) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [],
  );
  return { params: new URLSearchParams(search), update };
}
