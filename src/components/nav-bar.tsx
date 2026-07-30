"use client"

import { Menu } from "@base-ui/react/menu"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CourtMark } from "@/components/court-mark"
import {
  DIRECT_NAV_ITEMS,
  OTHER_NAV_ITEMS,
  OTHER_NAV_LABEL,
} from "@/lib/primary-navigation"
import { cn } from "@/lib/utils"

/**
 * Reference surfaces, reached from the top status bar rather than the tab bar or the OTHER
 * menu. Kept here rather than in primary-navigation.ts because these are deliberately NOT
 * primary surfaces — the onboarding guide enumerates that module and should not offer these.
 */
const SECONDARY_LINKS = [
  { href: "/about", label: "ABOUT" },
  { href: "/behind-the-data", label: "BEHIND THE DATA" },
] as const

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
          {/* The wordmark goes home, which is what every visitor already expects a logo to
              do. It was previously inert — the one piece of chrome people reflexively click
              and nothing happened. Home is GAMES, not /about: a logo that lands you on a
              marketing page breaks the "take me back to the product" contract. */}
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            style={{ fontSize: "11px", letterSpacing: "0.08em" }}
            aria-label="FullCourt home"
          >
            <CourtMark size={22} className="shrink-0" />
            <span style={{ color: "var(--term-red)", fontWeight: 700 }}>FULLCOURT</span>
            <span className="hidden sm:inline" style={{ color: "var(--term-text-muted)" }}>NBA ANALYTICS PLATFORM</span>
          </Link>
          <div className="flex items-center gap-3" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
            {/* Secondary chrome, deliberately not tabs: these two explain the product and the
                model rather than being surfaces of it, and the nav's five-link count is
                asserted in e2e. Quiet on purpose — 11px muted mono outside the navigation
                landmark — but reachable from every page, which the footer link alone was not.
                BEHIND THE DATA sits beside ABOUT rather than in the OTHER menu, because OTHER
                holds data surfaces and this is reference material.
                The "2025-26 SEASON" readout that used to sit here is gone: it was inert, and on
                a site covering forty seasons it implied the whole thing was scoped to one. */}
            {SECONDARY_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className="transition-colors hover:text-[var(--term-text)]"
                style={{
                  color: pathname === href ? "var(--term-text)" : "var(--term-text-muted)",
                  fontWeight: 600,
                }}
              >
                {label}
              </Link>
            ))}
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
