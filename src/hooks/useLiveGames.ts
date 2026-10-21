"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";

/** Realtime is an invalidation signal. The full API response owns scores and fatigue together. */
export function useLiveGames(gameIds: readonly number[], onInvalidate: () => void) {
  const gameIdsKey = gameIds.join(",");
  useEffect(() => {
    if (!gameIdsKey) return;
    const ids = new Set(gameIdsKey.split(",").map(Number));
    let active = true;
    let channel: RealtimeChannel | null = null;
    void getSupabaseBrowser().then((supabase) => {
      if (!active || !supabase) return;
      channel = supabase.channel(`games-live-${gameIdsKey}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=in.(${gameIdsKey})` }, (payload) => {
          if (active && ids.has(Number(payload.new.id))) onInvalidate();
        })
        .subscribe();
    });
    return () => { active = false; void channel?.unsubscribe(); };
  }, [gameIdsKey, onInvalidate]);
}
