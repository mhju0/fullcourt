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
 * Reference surfaces: right-aligned in the nav row, in their own landmark. They explain the
 * product rather than being surfaces of it, so they are not tabs — but they are the same size
 * and weight as tabs, because the top status strip proved too quiet to be found.
 *
 * Kept here rather than in primary-navigation.ts on purpose: that module enumerates product
 * surfaces, and this is documentation about the product rather than a surface of it.
 *
 * ABOUT left on 2026-08-12, when the page it pointed at became `/`. A link from the front door
 * to itself is not a reference; the wordmark already goes there, and that is the convention a
 * reader expects. One link is a thin landmark, but it is still the honest grouping — BEHIND THE
 * DATA explains the product rather than being a surface of it, which is exactly what this
 * landmark separates.
 */
const SECONDARY_LINKS = [
  { href: "/behind-the-data", label: "BEHIND THE DATA" },
] as const

function isActive(pathname: string, href: string): boolean {
  // `/` is the marketing page and no tab points at it, so the exact-match branch this used to
  // need for GAMES is gone. Kept as a guard: a prefix match on "/" would light every tab.
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

/** Shared by the direct tabs and the OTHER trigger so the underline reads identically. */
const TAB_CLASS =
  "flex h-full shrink-0 items-center whitespace-nowrap border-b-2 font-semibold transition-colors"
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
      {/* BRAND BAR */}
      <div
        style={{
          height: "52px",
          background: "var(--term-surface-2)",
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* The wordmark goes home, which is what every visitor already expects a logo to
              do. It was previously inert — the one piece of chrome people reflexively click
              and nothing happened.

              It used to read "home is GAMES, not /about: a logo that lands you on a marketing
              page breaks the 'take me back to the product' contract." That held while `/` WAS
              the games board, so home and the product were one page. They split on 2026-08-12
              and the rule inverts: `/` is now the front door, a wordmark pointing anywhere else
              is the surprising choice, and "take me back to the product" is served by the GAMES
              tab sitting first in the row directly below this.

              Sized as a logotype rather than as chrome text (2026-07-30). At 11px mono it was
              smaller than the tabs beneath it, so the one element that names the product read
              as the least important thing in the header. It is now 22px in the display face
              (the same face as every page title) with the descriptor demoted to
              a mono tagline behind a hairline rule — the standard analytics-site header shape:
              one mark, one large name, one small qualifier. Two tones, FULL near-black and
              COURT muted (Front Office keeps the poles for data, so the wordmark no longer
              borrows the fatigued hue); `aria-label` keeps the accessible name a single
              "FullCourt home". */}
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="FullCourt home"
          >
            <CourtMark size={34} className="shrink-0" />
            <span
              className="font-heading"
              style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1 }}
            >
              <span style={{ color: "var(--term-text)" }}>FULL</span>
              <span style={{ color: "var(--term-text-muted)" }}>COURT</span>
            </span>
            <span
              aria-hidden
              className="hidden sm:block"
              style={{ width: 1, height: 18, background: "var(--term-hairline)" }}
            />
            <span
              className="mono hidden sm:inline"
              style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--term-text-muted)" }}
            >
              NBA ANALYTICS PLATFORM
            </span>
          </Link>
        </div>
      </div>

      {/* MAIN NAV BAR */}
      <div
        className="mono"
        style={{
          height: "44px",
          background: "var(--term-surface)",
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        {/* Below ~900px the nine links do not fit a line, and the row was clipping them: on a
            390px phone the fifth tab wrapped inside a 44px box and the reference links were
            simply not on screen. It is now one horizontally scrollable strip — links keep their
            full size and `ml-auto` still right-aligns the reference group whenever the content
            does fit, so the desktop row is unchanged. A scroll strip over a drawer because the
            whole nav is nine short labels: a hamburger would hide all nine behind a tap to
            solve a problem that a swipe already solves. The OTHER menu is unaffected — it
            renders through a Portal, so this container cannot clip its popup. */}
        <div className="fc-nav-scroll mx-auto flex h-full max-w-7xl items-center gap-6 overflow-x-auto px-4 sm:px-6">
          {/* Two landmarks in one row. The product tabs keep the "Main navigation" name and
              its asserted six-link count; the reference links are a separate landmark so
              they never inflate that count and so screen readers announce them as what they
              are. Visually they are the same size and weight as a tab — the gap is what says
              "not one of the six", not a smaller type size. */}
          <nav aria-label="Main navigation" className="flex h-full shrink-0 items-center gap-6">
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
                "gap-2 outline-none focus-visible:text-[var(--term-text)]",
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
                  {OTHER_NAV_ITEMS.map((item) => {
                    const { href, label } = item
                    const active = isActive(pathname, href)
                    // `in` rather than a property read: OTHER_NAV_ITEMS is `as const`, so only
                    // the entry that sets the flag has it on its type.
                    const inProgress = "inProgress" in item && item.inProgress
                    return (
                      <Menu.Item
                        key={href}
                        // `render` keeps this a real <a>, so the item is still a link to
                        // middle-click, copy, or crawl — not a button that navigates.
                        render={<Link href={href} aria-current={active ? "page" : undefined} />}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-4 py-2 font-semibold outline-none transition-colors",
                          active
                            ? "text-[var(--term-text)]"
                            : "text-[var(--term-text-muted)]",
                          "data-[highlighted]:bg-[var(--term-surface-2)] data-[highlighted]:text-[var(--term-text)]"
                        )}
                      >
                        {label}
                        {/* The unfinished surface says so before you click it, not after.
                            This label used to live in the first-visit guide; that guide was
                            removed on 2026-08-11 and the warning had to survive it, because a
                            per-official foul table presented as finished reads as the bias
                            claim the page exists to refuse (see CLAUDE.md). */}
                        {inProgress && (
                          <span
                            style={{
                              fontSize: 9,
                              letterSpacing: "0.06em",
                              fontWeight: 600,
                              color: "var(--term-text-muted)",
                              border: "1px solid var(--term-border)",
                              borderRadius: "var(--term-radius-sm)",
                              padding: "0 4px",
                              lineHeight: "14px",
                            }}
                          >
                            IN PROGRESS
                          </span>
                        )}
                      </Menu.Item>
                    )
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          </nav>

          <nav aria-label="Reference" className="ml-auto flex h-full shrink-0 items-center gap-6">
            {SECONDARY_LINKS.map(({ href, label }) => {
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
          </nav>
        </div>
      </div>
    </header>
  )
}
