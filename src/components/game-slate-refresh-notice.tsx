"use client";

import type { GameSlate } from "@/hooks/useGameSlate";
import { TYPE } from "@/lib/terminal-styles";

type RefreshNotice = Pick<GameSlate, "checkedAt" | "refreshStatus" | "refreshMessage" | "retryRefresh">;

export function GameSlateRefreshNotice({ slate }: { slate: RefreshNotice }) {
  if (slate.checkedAt === null) return null;
  return (
    <button type="button" onClick={() => { if (slate.refreshStatus !== "refreshing") slate.retryRefresh(); }} aria-disabled={slate.refreshStatus === "refreshing"}
      className="fc-control-button min-h-11 shrink-0 underline underline-offset-4 aria-disabled:opacity-60"
      style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>
      {slate.refreshStatus === "refreshing" ? "Refreshing…" : slate.refreshMessage ? "Try again" : "Refresh view"}
    </button>
  );
}

export function GameSlateRefreshWarning({ message }: { message: string | null }) {
  return message ? <p role="status" className="m-0" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>Could not refresh this view. Showing the last fetched games.</p> : null;
}

export function GameSlateFetchTime({ checkedAt }: { checkedAt: number | null }) {
  if (checkedAt === null) return null;
  const time = new Date(checkedAt);
  return (
    <p className="m-0" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>
      View fetched at <time dateTime={time.toISOString()}>{time.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time> (your time)
    </p>
  );
}
