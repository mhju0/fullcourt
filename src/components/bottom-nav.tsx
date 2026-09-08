"use client"

import { BarChart3, Calendar, CalendarRange, Compass } from "lucide-react"
import { TransitionLink as Link } from "@/components/transition-link"
import { usePathname } from "next/navigation"
import { DIRECT_NAV_ITEMS, primaryNavCurrent } from "@/lib/primary-navigation"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

/** Short visible labels retain the full destination name for assistive technology. */
const SLOT_DETAILS = {
  "/games": { label: "GAMES", Icon: Calendar },
  "/season": { label: "SEASON", Icon: BarChart3 },
  "/schedule": { label: "SCHEDULE", Icon: CalendarRange },
  "/explore": { label: "EXPLORE", Icon: Compass },
} as const

const SLOT_CLASS =
  "flex flex-col items-center justify-center gap-1 border-t-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--term-text)]"
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
      <div className="grid grid-cols-4" style={{ height: "var(--term-bottom-nav-h)" }}>
        {DIRECT_NAV_ITEMS.map(({ href, label: name }) => {
          const { label, Icon } = SLOT_DETAILS[href]
          const current = primaryNavCurrent(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-label={name}
              aria-current={current}
              className={cn(
                SLOT_CLASS,
                current
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
      </div>
    </nav>
  )
}
