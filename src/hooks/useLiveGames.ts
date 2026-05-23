"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

/** Partial game update from the Realtime subscription. */
export interface LiveGameUpdate {
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
}

type LiveGamesState = {
  key: string;
  liveUpdates: Record<number, LiveGameUpdate>;
  recentlyUpdated: Set<number>;
};

const EMPTY_LIVE_UPDATES: Record<number, LiveGameUpdate> = {};
const EMPTY_RECENTLY_UPDATED = new Set<number>();

/**
 * Subscribes to Supabase Realtime changes on the `games` table for a set of
 * game IDs. Returns a map of game ID → changed fields whenever a row is updated.
 *
 * Cleans up the subscription on unmount or when gameIds change.
 */
export function useLiveGames(gameIds: number[]) {
  const gameIdsKey = gameIds.join(",");
  const [liveState, setLiveState] = useState<LiveGamesState>({
    key: gameIdsKey,
    liveUpdates: EMPTY_LIVE_UPDATES,
    recentlyUpdated: EMPTY_RECENTLY_UPDATED,
  });

  useEffect(() => {
    if (gameIdsKey.length === 0) return;

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const idSet = new Set(gameIdsKey.split(",").map(Number));

    const channel = supabase
      .channel(`games-live-${gameIdsKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
        },
        (payload) => {
          const row = payload.new as {
            id: number;
            home_score: number | null;
            away_score: number | null;
            status: string;
          };

          // Only process updates for games we're tracking (O(1) Set lookup)
          if (!idSet.has(row.id)) return;

          setLiveState((prev) => ({
            key: gameIdsKey,
            liveUpdates: {
              ...(prev.key === gameIdsKey ? prev.liveUpdates : EMPTY_LIVE_UPDATES),
              [row.id]: {
                homeScore: row.home_score,
                awayScore: row.away_score,
                status: row.status,
              },
            },
            recentlyUpdated: new Set(
              prev.key === gameIdsKey ? prev.recentlyUpdated : EMPTY_RECENTLY_UPDATED
            ).add(row.id),
          }));

          // Clear the flash after 600ms
          setTimeout(() => {
            setLiveState((prev) => {
              if (prev.key !== gameIdsKey) return prev;
              const recentlyUpdated = new Set(prev.recentlyUpdated);
              recentlyUpdated.delete(row.id);
              return {
                ...prev,
                recentlyUpdated,
              };
            });
          }, 600);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[Realtime] Failed to connect to games channel");
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [gameIdsKey]);

  if (liveState.key !== gameIdsKey) {
    return {
      liveUpdates: EMPTY_LIVE_UPDATES,
      recentlyUpdated: EMPTY_RECENTLY_UPDATED,
    };
  }

  return {
    liveUpdates: liveState.liveUpdates,
    recentlyUpdated: liveState.recentlyUpdated,
  };
}
