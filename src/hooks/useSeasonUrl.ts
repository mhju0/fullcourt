"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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

/**
 * Next's search params catch up with a `pushState` in a later, low-priority transition, so a
 * control that reads only them snaps back to its old value until that lands (a few hundred
 * milliseconds over the /shooting table). The URL this page just wrote is held here and read
 * first, and dropped as soon as the route's search moves or the address bar leaves it.
 */
function useWrittenSearch() {
  const route = useRouteSearch();
  const location = new URLSearchParams(useLocationSearch()).toString();
  const [written, setWritten] = useState<{ search: string; over: string } | null>(null);
  const write = useCallback(
    (url: URL, replace: boolean) => {
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
      setWritten({ search: url.searchParams.toString(), over: route });
      window.dispatchEvent(new Event(LOCATION_CHANGE));
    },
    [route],
  );
  // Cleared, not just ignored: Back can return the route to `over`, and the held URL must not
  // come back with it. A Back pressed before the route catches up leaves the route where it
  // was, so the held URL must also still be the address bar's.
  const stale = written !== null && (written.over !== route || written.search !== location);
  if (stale) setWritten(null);
  const search = written && !stale ? written.search : route;
  return { search, write };
}

export function useSeasonUrl(fallback: string, seasons: readonly string[]) {
  const { search, write } = useWrittenSearch();
  const requested = new URLSearchParams(search).get("season");
  const season =
    requested && seasons.includes(requested) ? requested : fallback;
  const setSeason = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("season", value);
    url.searchParams.delete("date");
    write(url, false);
  }, [write]);
  return {
    season,
    /** True when the URL names a season this page offers; false when `season` is the fallback. */
    explicit: season === requested,
    setSeason,
    fallbackNote:
      requested && requested !== season
        ? `${requested} is unavailable on this page. Showing ${season}.`
        : null,
  };
}

export function usePageQuery() {
  const { search, write } = useWrittenSearch();
  const update = useCallback(
    (values: Record<string, string | null>, replace = false) => {
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries(values)) {
        if (value === null) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      write(url, replace);
    },
    [write],
  );
  return { params: new URLSearchParams(search), update };
}
