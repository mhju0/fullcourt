"use client"

import { Menu } from "@base-ui/react/menu"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
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

/**
 * The bar's own height: the 52px brand bar plus the 44px tab row. Two things key off it — the
 * bar never retracts until the reader is at least its own height down the page, and a document
 * with less scroll room than that never retracts at all.
 */
const BAR_HEIGHT_PX = 96

/** Scroll jitter and trackpad momentum wobble, which otherwise flap the bar open and shut. */
const SCROLL_NOISE_PX = 6

/**
 * Retract the bar on scroll down and bring it back on scroll up — on the front door only.
 *
 * `/` became a marketing page rather than a product surface in the 2026-08-12 front-door swap,
 * and a tab bar pinned over a long-scrolling argument competes with it instead of serving it.
 * Every other route keeps the bar pinned, which is why this is gated on the pathname the
 * component already had in hand: no layout restructure was needed for any of it.
 *
 * Retraction is a transform, never a height or a `display` change. The header sits in normal
 * flow above `<main>`, so collapsing it would reflow the page under the reader and fight the
 * alignment law; translating it leaves its flow box exactly where it was. The tabs also stay
 * mounted — `navigation.spec.ts` asserts six links and zero `aria-current` on `/`, and
 * unmounting them to hide them would take that invariant with it.
 */
function useRetractingHeader(enabled: boolean) {
  const [retracted, setRetracted] = useState(false)
  const [wasEnabled, setWasEnabled] = useState(enabled)
  const reveal = useCallback(() => setRetracted(false), [])

  // Navigating away from the front door — and back to it — has to start with the bar shown.
  // Adjusted during render rather than in the effect below: a setState in an effect body
  // cascades a second render to reach the same place, which `react-hooks/set-state-in-effect`
  // rejects, and doing it here means the bar never paints a frame in the wrong state.
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled)
    setRetracted(false)
  }

  useEffect(() => {
    if (!enabled) return

    let last = window.scrollY
    let frame = 0

    const measure = () => {
      frame = 0
      const y = window.scrollY
      const delta = y - last

      // Under the noise floor `last` is deliberately NOT updated, so a slow deliberate scroll
      // accumulates until it clears the threshold rather than being discarded a pixel at a time.
      if (Math.abs(delta) < SCROLL_NOISE_PX) return
      last = y

      // A pinned section holds its content still while the document keeps scrolling, so the
      // delta above is real while nothing on screen has moved. Retracting there reads as the
      // chrome leaving for no reason the reader can see. The front door sets this flag for the
      // length of its pin (`about-content.tsx`); a DOM attribute rather than shared state
      // because it is one boolean crossing one boundary, and a context provider for it would
      // put the whole app's chrome behind a re-render that only one route ever triggers.
      if (document.documentElement.dataset.fcPinned === "1") {
        setRetracted(false)
        return
      }

      // Always present at the top of the document, whichever way the reader arrived there.
      if (y <= BAR_HEIGHT_PX) {
        setRetracted(false)
        return
      }

      // A viewport short enough that the page barely scrolls has nowhere to scroll back from:
      // the bar would retract with no room left to ask for it again.
      if (document.documentElement.scrollHeight - window.innerHeight <= BAR_HEIGHT_PX) {
        setRetracted(false)
        return
      }

      setRetracted(delta > 0)
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  // Derived, so a route that does not retract can never inherit a stale `true` from one that
  // does — the reset above and this guard cover the two directions independently.
  return { hidden: enabled && retracted, reveal }
}

/**
 * Edge fades for the scroll strip — the affordance the strip was measured to lack.
 *
 * The 2026-08-04 pass found the OTHER menu sitting entirely off-screen at 360px "with no
 * scroll affordance", so the tabs past the fold were unreachable in practice: nothing said
 * the row continues. The scrollbar cannot be that signal — it is hidden on purpose, because
 * at 44px tall it lands on the active tab's underline. A fade at the overflowing edge is how
 * Naver Sports' tab strips and ESPN's mobile subnavs say "more this way", and it costs no
 * height.
 *
 * State, not CSS alone: a static gradient would also sit over the row when the content fits,
 * dimming the last tab for no reason. Each fade shows only while there is actually content
 * under it — left fade once scrolled, right fade until the end.
 *
 * `scrollWidth` is not observable by ResizeObserver (it watches the border box, and the box
 * never changes when the *content* widens), so the font landing is re-checked explicitly:
 * the strip is mono/display webfonts, and their swap is exactly when overflow appears.
 */
function useEdgeFades() {
  const ref = useRef<HTMLDivElement>(null)
  const [fades, setFades] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    let disposed = false

    const measure = () => {
      frame = 0
      if (disposed) return
      const max = el.scrollWidth - el.clientWidth
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 }
      setFades((prev) => (prev.left === next.left && prev.right === next.right ? prev : next))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    el.addEventListener("scroll", schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    void document.fonts?.ready.then(schedule)

    return () => {
      disposed = true
      el.removeEventListener("scroll", schedule)
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return { ref, fades }
}

export function NavBar() {
  const pathname = usePathname()
  const otherActive = OTHER_NAV_ITEMS.some((item) => isActive(pathname, item.href))
  const { ref: stripRef, fades } = useEdgeFades()

  // The front door only. Every other surface keeps the bar pinned.
  const retractable = pathname === "/"
  const { hidden, reveal } = useRetractingHeader(retractable)

  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        // motion-safe: under `prefers-reduced-motion` the bar still retracts, it just stops
        // sliding to get there. A 96px band travelling the screen on every change of scroll
        // direction is precisely the motion the preference asks to remove; the state change
        // itself is not, and withholding that would leave the page's chrome behaving
        // differently for those readers rather than merely more quietly.
        retractable && "motion-safe:transition-transform motion-safe:duration-300",
        hidden && "-translate-y-full"
      )}
      // A retracted bar still holds six focusable tabs. Tabbing into one has to bring it back,
      // or the focus ring lands on a control sitting off the top of the screen.
      onFocus={reveal}
    >
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
        className="mono relative"
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
        <div ref={stripRef} className="fc-nav-scroll mx-auto flex h-full max-w-7xl items-center gap-6 overflow-x-auto px-4 sm:px-6">
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

        {/* The overflow affordance. Decorative overlays, never interactive: `pointer-events-none`
            so they cannot eat a tap on the tab under them, and the *dynamic* half (opacity) is a
            class while the static gradient is inline — nothing contests either, per the cascade
            rule in docs/FRONTEND.md. Gradient from the row's own surface so the fade reads as the
            row continuing, not as a shadow cast over it. */}
        <div
          aria-hidden="true"
          className={cn(
            "fc-nav-fade-left pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-200 motion-reduce:transition-none",
            fades.left ? "opacity-100" : "opacity-0"
          )}
          style={{ background: "linear-gradient(to right, var(--term-surface), transparent)" }}
        />
        <div
          aria-hidden="true"
          className={cn(
            "fc-nav-fade-right pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-200 motion-reduce:transition-none",
            fades.right ? "opacity-100" : "opacity-0"
          )}
          style={{ background: "linear-gradient(to left, var(--term-surface), transparent)" }}
        />
      </div>
    </header>
  )
}
