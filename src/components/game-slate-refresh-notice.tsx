"use client";

import { RotateCw } from "lucide-react";
import type { GameSlate } from "@/hooks/useGameSlate";
import { SPACE, TYPE } from "@/lib/terminal-styles";

type RefreshNotice = Pick<GameSlate, "checkedAt" | "refreshStatus" | "refreshMessage" | "retryRefresh">;

/** When this view last arrived, in the viewer's own clock, beside an icon button that fetches it again. */
export function GameSlateRefreshNotice({ slate }: { slate: RefreshNotice }) {
  if (slate.checkedAt === null) return null;
  const time = new Date(slate.checkedAt);
  const refreshing = slate.refreshStatus === "refreshing";
  return (
    <div className="flex shrink-0 items-center" style={{ gap: SPACE.xs }}>
      <span className="whitespace-nowrap" style={{ fontSize: TYPE.data, color: "var(--term-text-muted)" }}>
        {/* Below 360px the heading row cannot hold the word; the time alone stays. */}
        <span className="max-[359px]:sr-only">Checked </span><time dateTime={time.toISOString()}>{time.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>
      </span>
      <RefreshButton refreshing={refreshing} label={slate.refreshMessage ? "Try again" : "Refresh view"}
        onActivate={() => { if (!refreshing) slate.retryRefresh(); }} />
    </div>
  );
}

/** A 32px outline square inside a 44px hit area. aria-disabled, not disabled, so focus stays put mid-refresh. */
export function RefreshButton({ refreshing, label, onActivate }: { refreshing: boolean; label: string; onActivate: () => void }) {
  return (
    <button type="button" onClick={onActivate} aria-disabled={refreshing} aria-label={label} title={label}
      className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center aria-disabled:cursor-default aria-disabled:opacity-60">
      {/* The outline is on the inner square, so hover darkens it rather than boxing the hit area. */}
      <span className="inline-flex size-8 items-center justify-center rounded-[var(--term-radius-sm)] border border-[var(--term-border)] transition-colors group-hover:border-[var(--term-text-muted)] group-active:scale-[0.97]" style={{ color: "var(--term-text)" }}>
        <RotateCw aria-hidden size={14} strokeWidth={2.2} className={refreshing ? "motion-safe:animate-spin" : undefined} />
      </span>
    </button>
  );
}

export function GameSlateRefreshWarning({ message }: { message: string | null }) {
  return message ? <p role="status" className="m-0" style={{ fontSize: TYPE.body, color: "var(--term-text-muted)" }}>Could not refresh this view. Showing the last fetched games.</p> : null;
}
