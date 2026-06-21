"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/", label: "TODAY'S GAMES" },
  { href: "/analysis", label: "ANALYSIS" },
  { href: "/upcoming", label: "PICKS" },
] as const

const TICKER_ITEMS = [
  { team: "BOS", dir: "up",   value: "2.4" },
  { team: "DEN", dir: "up",   value: "1.8" },
  { team: "LAL", dir: "down", value: "1.2" },
  { team: "MIA", dir: "flat", value: "0.0" },
  { team: "NYK", dir: "up",   value: "0.9" },
  { team: "GSW", dir: "down", value: "0.6" },
] as const

const SEASON_LABEL = "2025-26 SEASON"
// Hardcoded for now — wire to "are there games today" later.
const HAS_LIVE_GAMES = false

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

function TickerArrow({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up")   return <span style={{ color: "#22c55e" }}>▲</span>
  if (dir === "down") return <span style={{ color: "#ef4444" }}>▼</span>
  return <span style={{ color: "rgba(255,255,255,0.4)" }}>—</span>
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
          background: "#F0EEE9",
          borderBottom: "1px solid #E2DFD8",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
            <span style={{ color: "#C9082A", fontWeight: 700 }}>FULLCOURT</span>
            <span style={{ color: "#8A8478" }}>NBA ANALYTICS PLATFORM</span>
          </div>
          <div className="flex items-center gap-3" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
            <span style={{ color: "#8A8478" }}>{SEASON_LABEL}</span>
            {HAS_LIVE_GAMES && (
              <span className="flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#22c55e",
                  }}
                />
                <span style={{ color: "#22c55e", fontWeight: 700 }}>LIVE</span>
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
          background: "#ffffff",
          borderBottom: "1px solid #E2DFD8",
        }}
        aria-label="Main navigation"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                className={cn("flex h-full items-center transition-colors")}
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.05em",
                  color: active ? "#C9082A" : "#4A4A4A",
                  borderBottom: active ? "2px solid #C9082A" : "2px solid transparent",
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* NAVY TICKER STRIP */}
      <div
        className="mono overflow-hidden"
        style={{
          height: "26px",
          background: "#17408B",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <span
            style={{
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.4)",
              flexShrink: 0,
            }}
          >
            TICKER
          </span>
          <div className="relative flex-1 overflow-hidden">
            <div
              className="flex whitespace-nowrap"
              style={{
                animation: "marquee 40s linear infinite",
                gap: "32px",
                width: "max-content",
              }}
            >
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2"
                  style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em" }}
                >
                  <span style={{ color: "#ffffff", fontWeight: 700 }}>{item.team}</span>
                  <TickerArrow dir={item.dir} />
                  <span>{item.value} RA</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
