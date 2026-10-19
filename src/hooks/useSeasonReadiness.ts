"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/fetcher";
import type { SeasonReadiness } from "@/lib/season-readiness";

export function useSeasonReadiness(season: string, enabled = true) {
  const result = useSWR<SeasonReadiness>(
    enabled ? `/api/season-readiness?season=${season}` : null,
    apiFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  );
  const aligned = result.data?.season === season ? result.data : undefined;
  return {
    ...result,
    data: aligned,
    ready: !result.error && aligned?.ready === true,
    awaiting: !result.error && aligned?.ready === false,
  };
}
