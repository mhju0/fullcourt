"use client"

import { Activity, BarChart3, Calendar, CalendarRange, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { isActiveRoute, PALETTE_OPEN_EVENT } from "@/lib/primary-navigation"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

/**
 * The phone shell (2026-08-29 shell merge, ADR 0010): a docked bottom nav — four route slots
 * and a search slot — under a brand-only top bar. This is the thumb-first pattern every major
 * sports property ships on phones, and it replaced the top bar's horizontal scroll strip below
 * `lg`; the strip survives on desktop, where the bar has room for it.
 *
 * Four slots, not nine: the four most-visited product surfaces get one-tap reach, and every
 * other route — PLAYOFF REST, PLAYER SHOOTING, the OTHER three, BEHIND THE DATA — stays one
 * search away through the palette the fifth slot opens. No hamburger: that refusal is recorded
 * in ADR 0010, and the palette is the discoverable replacement, not a drawer.
 *
 * Short labels, full accessible names: "SEASON" is the slot, `aria-label="SEASON REPORT"` is
 * the name — the visible label stays a substring of the accessible one (WCAG label-in-name).
 *
 * `body` reserves this nav's height below `lg` (globals.css, `--term-bottom-nav-h`), so the
 * dock never covers a page's last line, and the safe-area inset is padded inside the nav so
 * a home-indicator phone taps the slots, not the gesture bar.
 */
const SLOTS = [
  { href: "/games", label: "GAMES", name: "GAMES", Icon: Calendar },
  { href: "/season", label: "SEASON", name: "SEASON REPORT", Icon: BarChart3 },
  { href: "/schedule", label: "SCHEDULE", name: "SCHEDULE EDGE", Icon: CalendarRange },
  { href: "/analysis", label: "MODEL", name: "MODEL RESULTS", Icon: Activity },
] as const

const SLOT_CLASS =
  "flex flex-col items-center justify-center gap-1 border-t-2 font-semibold transition-colors"
const SLOT_STYLE = { fontSize: TYPE.micro, letterSpacing: TRACK.sub } as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Bottom navigation"
      className={cn(
        // fc-bottom-nav carries the safe-area padding (globals.css) — inside the nav, so a
        // home-indicator phone taps the slots, not the gesture bar.
        "fc-bottom-nav mono fixed inset-x-0 bottom-0 z-50 lg:hidden",
        // The front door is the one dark surface, and a light dock on it would be the same
        // seam stage ① removed from the top. Solid, never transparent: a dock is furniture.
        pathname === "/" && "fc-chrome-front"
      )}
      style={{
        background: "var(--term-surface-2)",
        borderTop: "1px solid var(--term-border)",
      }}
    >
      <div className="grid grid-cols-5" style={{ height: "var(--term-bottom-nav-h)" }}>
        {SLOTS.map(({ href, label, name, Icon }) => {
          const active = isActiveRoute(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-label={name}
              aria-current={active ? "page" : undefined}
              className={cn(
                SLOT_CLASS,
                active
                  ? "border-[var(--term-amber)] text-[var(--term-text)]"
                  : "border-transparent text-[var(--term-text-muted)]"
              )}
              style={SLOT_STYLE}
            >
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
          className={cn(
            SLOT_CLASS,
            "border-transparent text-[var(--term-text-muted)] outline-none focus-visible:text-[var(--term-text)]"
          )}
          style={SLOT_STYLE}
          aria-label="Search — open the command palette"
        >
          <Search size={16} aria-hidden />
          SEARCH
        </button>
      </div>
    </nav>
  )
}
