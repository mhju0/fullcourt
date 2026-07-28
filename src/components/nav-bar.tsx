"use client"

import { Menu } from "@base-ui/react/menu"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CourtMark } from "@/components/court-mark"
import { currentDisplaySeason } from "@/lib/nba-season"
import {
  DIRECT_NAV_ITEMS,
  OTHER_NAV_ITEMS,
  OTHER_NAV_LABEL,
} from "@/lib/primary-navigation"
import { cn } from "@/lib/utils"

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

/** Shared by the direct tabs and the OTHER trigger so the underline reads identically. */
const TAB_CLASS = "flex h-full items-center border-b-2 font-semibold transition-colors"
const TAB_STYLE = { fontSize: "12px", letterSpacing: "0.05em" } as const

function tabTone(active: boolean): string {
  return active
    ? "border-[var(--term-amber)] text-[var(--term-text)]"
    : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
}

export function NavBar() {
  const pathname = usePathname()
  const otherActive = OTHER_NAV_ITEMS.some((item) => isActive(pathname, item.href))

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
          <div className="flex items-center gap-2.5" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
            <CourtMark size={22} className="shrink-0" />
            <span style={{ color: "var(--term-red)", fontWeight: 700 }}>FULLCOURT</span>
            <span className="hidden sm:inline" style={{ color: "var(--term-text-muted)" }}>NBA ANALYTICS PLATFORM</span>
          </div>
          <div className="flex items-center gap-3" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
            {/* Secondary chrome, deliberately not a sixth tab: /about explains the product,
                it is not one of the five surfaces, and the nav's five-link count is asserted
                in e2e. The footer link alone left the page effectively unreachable. */}
            <Link
              href="/about"
              aria-current={pathname === "/about" ? "page" : undefined}
              className="transition-colors hover:text-[var(--term-text)]"
              style={{
                color: pathname === "/about" ? "var(--term-text)" : "var(--term-text-muted)",
                fontWeight: 600,
              }}
            >
              ABOUT
            </Link>
            <span style={{ color: "var(--term-text-muted)" }}>{currentDisplaySeason()} SEASON</span>
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
          {DIRECT_NAV_ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(TAB_CLASS, tabTone(active))}
                style={TAB_STYLE}
              >
                {label}
              </Link>
            )
          })}

          {/* The trigger reads active whenever any page inside it is open, so the bar never
              loses track of where you are while the menu itself is shut. */}
          <Menu.Root>
            <Menu.Trigger
              // The active state is exposed as data rather than left to a class name, so
              // e2e can assert "you are inside OTHER" without pinning the styling.
              data-active-surface={otherActive ? "true" : "false"}
              className={cn(
                TAB_CLASS,
                "gap-1.5 outline-none focus-visible:text-[var(--term-text)]",
                tabTone(otherActive)
              )}
              style={TAB_STYLE}
            >
              {OTHER_NAV_LABEL}
              <span aria-hidden style={{ fontSize: "9px" }}>▼</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={0} align="start">
                <Menu.Popup
                  className="mono min-w-[13rem] py-1 shadow-lg outline-none"
                  style={{
                    background: "var(--term-surface)",
                    border: "1px solid var(--term-border)",
                    fontSize: "12px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {OTHER_NAV_ITEMS.map(({ href, label }) => {
                    const active = isActive(pathname, href)
                    return (
                      <Menu.Item
                        key={href}
                        // `render` keeps this a real <a>, so the item is still a link to
                        // middle-click, copy, or crawl — not a button that navigates.
                        render={<Link href={href} aria-current={active ? "page" : undefined} />}
                        className={cn(
                          "block cursor-pointer px-4 py-2 font-semibold outline-none transition-colors",
                          active
                            ? "text-[var(--term-text)]"
                            : "text-[var(--term-text-muted)]",
                          "data-[highlighted]:bg-[var(--term-surface-2)] data-[highlighted]:text-[var(--term-text)]"
                        )}
                      >
                        {label}
                      </Menu.Item>
                    )
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </nav>
    </header>
  )
}
