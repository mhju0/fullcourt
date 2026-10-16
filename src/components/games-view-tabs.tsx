"use client"

import { TransitionLink } from "@/components/transition-link"
import { useLocationSearch } from "@/hooks/useSeasonUrl"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

const VIEWS = [
  { href: "/games", label: "BY DATE" },
  { href: "/games/team", label: "BY TEAM" },
] as const

/**
 * The two ways into the same games: one night's slate, or one team's season. Links rather than a
 * toggle so each view has its own address. The season travels with the switch; the date and the
 * team do not, because neither means anything on the other view.
 */
export function GamesViewTabs({ current }: { current: (typeof VIEWS)[number]["href"] }) {
  const season = new URLSearchParams(useLocationSearch()).get("season")
  return (
    <nav aria-label="Games view" className="mono flex gap-6 border-b border-[var(--term-border)]">
      {VIEWS.map(({ href, label }) => {
        const active = href === current
        return (
          <TransitionLink
            key={href}
            href={season ? `${href}?season=${encodeURIComponent(season)}` : href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 transition-colors",
              active
                ? "border-[var(--term-accent)] text-[var(--term-text)]"
                : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
            )}
            style={{ fontSize: TYPE.data, letterSpacing: TRACK.data, fontWeight: 700 }}
          >
            {label}
          </TransitionLink>
        )
      })}
    </nav>
  )
}
