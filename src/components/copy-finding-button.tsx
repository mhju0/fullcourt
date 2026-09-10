"use client";

import { useState } from "react";
import { TRACK } from "@/lib/terminal-styles";

export function CopyFindingButton({
  text,
  query,
}: {
  text: string;
  query: Record<string, string | null>;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [fallback, setFallback] = useState("");

  async function copy() {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(query)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    const payload = `${text}\n${url.toString()}`;
    try {
      await navigator.clipboard.writeText(payload);
      setStatus("copied");
    } catch {
      setFallback(payload);
      setStatus("error");
    }
  }

  return (
    <span className="flex min-h-11 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="mono min-h-11 underline underline-offset-4"
        style={{
          color: "var(--term-accent)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: TRACK.sub,
        }}
      >
        Copy this view
      </button>
      <span className="mono" role="status" style={{ color: "var(--term-text-muted)", fontSize: 11 }}>
        {status === "copied" ? "Copied" : status === "error" ? "Copy unavailable. Select the text below." : ""}
      </span>
      {status === "error" ? (
        <textarea
          aria-label="Share text"
          readOnly
          value={fallback}
          onFocus={(event) => event.currentTarget.select()}
          className="mono min-h-24 w-full resize-y border border-[var(--term-border)] bg-[var(--term-surface)] p-2 text-xs text-[var(--term-text)]"
        />
      ) : null}
    </span>
  );
}
