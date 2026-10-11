"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

/** Realtime is an invalidation signal. The full API response owns scores and fatigue together. */
export function useLiveGames(gameIds: readonly number[], onInvalidate: () => void) {
  const gameIdsKey = gameIds.join(",");
  useEffect(() => {
    if (!gameIdsKey) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const ids = new Set(gameIdsKey.split(",").map(Number));
    let active = true;
    const channel = supabase.channel(`games-live-${gameIdsKey}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games" }, (payload) => {
        if (active && ids.has(Number(payload.new.id))) onInvalidate();
      })
      .subscribe();
    return () => { active = false; void channel.unsubscribe(); };
  }, [gameIdsKey, onInvalidate]);
}
