"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CourtMark } from "@/components/court-mark"
import { currentDisplaySeason } from "@/lib/nba-season"
import { PRIMARY_NAV_ITEMS } from "@/lib/primary-navigation"
import { cn } from "@/lib/utils"

// Hardcoded for now — wire to "are there games today" later.
const HAS_LIVE_GAMES = false

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function NavBar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50">
      {/* TOP STATUS BAR */}
      <div
        className="mono"
        style={{
          height: "28px",
          background: "var(--term-surface-2)",
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
            <CourtMark size={22} className="shrink-0" />
            <span style={{ color: "var(--term-red)", fontWeight: 700 }}>FULLCOURT</span>
            <span className="hidden sm:inline" style={{ color: "var(--term-text-muted)" }}>NBA ANALYTICS PLATFORM</span>
          </div>
          <div className="flex items-center gap-3" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
            <span style={{ color: "var(--term-text-muted)" }}>{currentDisplaySeason()} SEASON</span>
            {HAS_LIVE_GAMES && (
              <span className="flex items-center gap-1.5">
                <span
                  className="animate-[pulse_1.7s_ease-in-out_infinite]"
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "var(--term-amber)",
                    boxShadow: "0 0 9px var(--term-amber)",
                  }}
                />
                <span style={{ color: "var(--term-amber)", fontWeight: 700 }}>LIVE</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* MAIN NAV BAR */}
      <nav
        className="mono"
        style={{
          height: "44px",
          background: "var(--term-surface)",
          borderBottom: "1px solid var(--term-border)",
        }}
        aria-label="Main navigation"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          {PRIMARY_NAV_ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full items-center border-b-2 font-semibold transition-colors",
                  active
                    ? "border-[var(--term-amber)] text-[var(--term-text)]"
                    : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
                )}
                style={{ fontSize: "11px", letterSpacing: "0.05em" }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </header>
  )
}
