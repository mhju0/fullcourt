"use client"

import { PALETTE_OPEN_EVENT } from "@/lib/primary-navigation"

export function PageSearchButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
    aria-keyshortcuts="Meta+K Control+K"
    className="min-h-11 cursor-pointer underline text-[var(--term-text-muted)] hover:text-[var(--term-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--term-text)]">
    Find a page
  </button>
}
