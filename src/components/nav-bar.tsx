"use client"

import { Menu } from "@base-ui/react/menu"
import { Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { CourtMark } from "@/components/court-mark"
import { wordmarkLetters } from "@/lib/brand/wordmark-kern"
import {
  DIRECT_NAV_ITEMS,
  isActiveRoute,
  OTHER_NAV_ITEMS,
  OTHER_NAV_LABEL,
  PALETTE_OPEN_EVENT,
} from "@/lib/primary-navigation"
import { TRACK, TYPE } from "@/lib/terminal-styles"
import { cn } from "@/lib/utils"

/**
 * Reference surfaces: right-aligned in the nav row, in their own landmark. They explain the
 * product rather than being surfaces of it, so they are not tabs — but they are the same size
 * and weight as tabs, because the top status strip proved too quiet to be found.
 *
 * Kept here rather than in primary-navigation.ts on purpose: that module enumerates product
 * surfaces, and this is documentation about the product rather than a surface of it. The
 * command palette imports it for the same reason — its Reference group is this list.
 *
 * ABOUT left on 2026-08-12, when the page it pointed at became `/`. A link from the front door
 * to itself is not a reference; the wordmark already goes there, and that is the convention a
 * reader expects. One link is a thin landmark, but it is still the honest grouping — BEHIND THE
 * DATA explains the product rather than being a surface of it, which is exactly what this
 * landmark separates.
 */
export const SECONDARY_LINKS = [
  { href: "/behind-the-data", label: "BEHIND THE DATA" },
] as const

/** Shared by the direct tabs and the OTHER trigger so the underline reads identically. */
const TAB_CLASS =
  "flex h-full shrink-0 items-center whitespace-nowrap border-b-2 font-semibold transition-colors"
const TAB_STYLE = { fontSize: "12px", letterSpacing: TRACK.data } as const

function tabTone(active: boolean): string {
  return active
    ? "border-[var(--term-amber)] text-[var(--term-text)]"
    : "border-transparent text-[var(--term-text-muted)] hover:text-[var(--term-text)]"
}

/**
 * The bar's own height — one 56px bar since the 2026-08-29 shell merge (stage ③ of the
 * redesign round, ADR 0010; it replaced the 52px brand bar + 44px tab row). Two things key
 * off it — the bar never retracts until the reader is at least its own height down the page,
 * and a document with less scroll room than that never retracts at all. `--term-chrome-h`
 * in globals.css is the same number for CSS consumers; the two move together or the front
 * door's fold math breaks.
 */
const BAR_HEIGHT_PX = 56

/** Scroll jitter and trackpad momentum wobble, which otherwise flap the bar open and shut. */
const SCROLL_NOISE_PX = 6

/**
 * How far down the front door still counts as "the top", where the chrome is fully
 * transparent over the hero. Small on purpose: the surfaces should be back before the
 * first line of the argument reaches them.
 */
const CHROME_CLEAR_PX = 8

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
  const [atTop, setAtTop] = useState(true)
  const [wasEnabled, setWasEnabled] = useState(enabled)
  const reveal = useCallback(() => setRetracted(false), [])

  // Navigating away from the front door — and back to it — has to start with the bar shown.
  // Adjusted during render rather than in the effect below: a setState in an effect body
  // cascades a second render to reach the same place, which `react-hooks/set-state-in-effect`
  // rejects, and doing it here means the bar never paints a frame in the wrong state.
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled)
    setRetracted(false)
    setAtTop(true)
  }

  useEffect(() => {
    if (!enabled) return

    let last = window.scrollY
    let frame = 0

    const measure = () => {
      frame = 0
      const y = window.scrollY
      const delta = y - last

      // Before the noise floor, not after: within a few pixels of the top the retract state
      // can wait, but the transparent↔solid chrome swap cannot — it is anchored to a position,
      // not to a direction of travel.
      setAtTop(y <= CHROME_CLEAR_PX)

      // Under the noise floor `last` is deliberately NOT updated, so a slow deliberate scroll
      // accumulates until it clears the threshold rather than being discarded a pixel at a time.
      if (Math.abs(delta) < SCROLL_NOISE_PX) return
      last = y

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

    // One scheduled measure on mount: a browser-restored scroll position would otherwise
    // paint transparent chrome over mid-page content until the first scroll event. The
    // noise floor lets this first pass through untouched (delta is 0), so it can only
    // correct `atTop`, never flap the retract state.
    onScroll()

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])

  // Derived, so a route that does not retract can never inherit a stale `true` from one that
  // does — the reset above and this guard cover the two directions independently.
  return { hidden: enabled && retracted, clear: enabled && atTop, reveal }
}

/**
 * Edge fades for the scroll strip — the affordance the strip was measured to lack.
 *
 * The 2026-08-04 pass found the OTHER menu sitting entirely off-screen at 360px "with no
 * scroll affordance", so the tabs past the fold were unreachable in practice: nothing said
 * the row continues. The scrollbar cannot be that signal — it is hidden on purpose, because
 * on the active tab's underline it lands exactly. A fade at the overflowing edge is how
 * Naver Sports' tab strips and ESPN's mobile subnavs say "more this way", and it costs no
 * height.
 *
 * Since the 2026-08-29 shell merge the strip is a desktop element (below `lg` the bottom nav
 * carries primary navigation), but the affordance problem is unchanged: between `lg` and
 * roughly 1250px the tabs still overflow the room the single bar leaves them.
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
  const otherActive = OTHER_NAV_ITEMS.some((item) => isActiveRoute(pathname, item.href))
  const { ref: stripRef, fades } = useEdgeFades()

  // The front door only. Every other surface keeps the bar pinned.
  const retractable = pathname === "/"
  const { hidden, clear, reveal } = useRetractingHeader(retractable)

  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        // motion-safe: under `prefers-reduced-motion` the bar still retracts, it just stops
        // sliding to get there. A bar-height band travelling the screen on every change of
        // scroll direction is precisely the motion the preference asks to remove; the state
        // change itself is not, and withholding that would leave the page's chrome behaving
        // differently for those readers rather than merely more quietly.
        retractable && "motion-safe:transition-transform motion-safe:duration-300",
        // On the front door the chrome re-resolves its tokens to the dark set, and at the
        // very top the grounds go transparent so the bar dissolves into the hero — the
        // classes live in globals.css beside the tokens they override. Route-scoped by
        // this condition; the light-only law holds on every other surface.
        retractable && "fc-chrome-front",
        retractable && clear && "fc-chrome-clear",
        hidden && "-translate-y-full"
      )}
      // A retracted bar still holds six focusable tabs. Tabbing into one has to bring it back,
      // or the focus ring lands on a control sitting off the top of the screen.
      onFocus={reveal}
    >
      {/* THE BAR — one 56px layer since the 2026-08-29 shell merge. The brand zone sits left,
          the tab strip takes the middle (desktop only — below `lg` the bottom nav is primary
          navigation and this bar is brand-only), and the palette's SEARCH affordance sits
          right. The "NBA ANALYTICS PLATFORM" tagline retired to the front door with the merge:
          a slim bar carries the name, the front door carries the story. */}
      <div
        className="motion-safe:transition-colors motion-safe:duration-200"
        style={{
          height: "56px",
          background: "var(--term-surface-2)",
          borderBottom: "1px solid var(--term-border)",
        }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-5">
          {/* The wordmark goes home, which is what every visitor already expects a logo to
              do. Sized as a logotype rather than as chrome text (2026-07-30): 22px in the
              display face beside the 34px mark — the standard analytics-site header shape,
              one mark, one large name. Two tones, FULL near-black and COURT in the accent;
              `aria-label` keeps the accessible name a single "FullCourt home". */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="FullCourt home"
          >
            {/* The one piece of chrome that cannot follow the token scope: the mark's colors
                are SVG fills, so it selects its sanctioned dark cut by prop on the front door. */}
            <CourtMark size={34} className="shrink-0" tone={retractable ? "dark" : "light"} />
            {/* 22px is NOT a TYPE entry, deliberately: the wordmark is sized to the brand
                zone beside a 34px mark, not to a text role. Resizing it is a branding
                decision (see the exemption list in terminal-styles.ts). */}
            <span
              className="font-heading"
              style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1 }}
            >
              {/* W4 lockup (2026-08-19): COURT takes the brand indigo — the same
                  accent the mark's slash spends, one rule for nav and OG alike.
                  Per-letter kerns from wordmark-kern.ts (2026-08-24), as margins so
                  the container's base tracking stays what it was. */}
              {wordmarkLetters().map((l, i) => (
                <span
                  key={i}
                  style={{
                    color: l.accent ? "var(--accent)" : "var(--term-text)",
                    marginLeft: l.kernEm === 0 ? undefined : `${l.kernEm}em`,
                  }}
                >
                  {l.char}
                </span>
              ))}
            </span>
          </Link>

          <span
            aria-hidden
            className="hidden lg:block"
            style={{ width: 1, height: 18, background: "var(--term-hairline)" }}
          />

          {/* The tab strip — desktop only. Below `lg` primary navigation is the bottom nav
              (bottom-nav.tsx) and every route stays reachable through the palette, so the
              strip leaves the DOM entirely rather than hiding under a hamburger. Within the
              strip nothing changed in the merge: two landmarks in one row, the product tabs
              keeping the "Main navigation" name and its asserted six-link count, the
              reference links in their own landmark so they never inflate that count. */}
          <div className="relative hidden h-full min-w-0 flex-1 lg:block">
            <div
              ref={stripRef}
              className="fc-nav-scroll mono flex h-full items-center gap-5 overflow-x-auto"
            >
              <nav aria-label="Main navigation" className="flex h-full shrink-0 items-center gap-5">
                {DIRECT_NAV_ITEMS.map(({ href, label }) => {
                  const active = isActiveRoute(pathname, href)
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
                    <span aria-hidden style={{ fontSize: TYPE.micro }}>▼</span>
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner sideOffset={0} align="start">
                      <Menu.Popup
                        className="mono min-w-[13rem] py-1 shadow-lg outline-none"
                        style={{
                          background: "var(--term-surface)",
                          border: "1px solid var(--term-border)",
                          fontSize: "12px",
                          letterSpacing: TRACK.data,
                        }}
                      >
                        {OTHER_NAV_ITEMS.map((item) => {
                          const { href, label } = item
                          const active = isActiveRoute(pathname, href)
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
                            </Menu.Item>
                          )
                        })}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              </nav>

              <nav aria-label="Reference" className="ml-auto flex h-full shrink-0 items-center gap-5">
                {SECONDARY_LINKS.map(({ href, label }) => {
                  const active = isActiveRoute(pathname, href)
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

            {/* The overflow affordance. Decorative overlays, never interactive:
                `pointer-events-none` so they cannot eat a tap on the tab under them, and the
                *dynamic* half (opacity) is a class while the static gradient is inline —
                nothing contests either, per the cascade rule in docs/FRONTEND.md. Gradient
                from the bar's own surface so the fade reads as the row continuing, not as a
                shadow cast over it. */}
            <div
              aria-hidden="true"
              className={cn(
                "fc-nav-fade-left pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-200 motion-reduce:transition-none",
                fades.left ? "opacity-100" : "opacity-0"
              )}
              style={{ background: "linear-gradient(to right, var(--term-surface-2), transparent)" }}
            />
            <div
              aria-hidden="true"
              className={cn(
                "fc-nav-fade-right pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-200 motion-reduce:transition-none",
                fades.right ? "opacity-100" : "opacity-0"
              )}
              style={{ background: "linear-gradient(to left, var(--term-surface-2), transparent)" }}
            />
          </div>

          {/* The palette's visible affordance — the GitHub lesson is that a keyboard-only
              palette is a feature nobody finds, so the word stays on the button. The ⌘K chip
              was measured off it (2026-08-29): the bar's inner width is a constant 1232px on
              every desktop (max-w-7xl minus padding), and with the chip the six tabs could not
              fit beside the brand zone — the shortcut is taught by `title` and by the palette
              itself instead. Desktop only: the bottom nav carries its own search slot. */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
            className="mono hidden h-8 shrink-0 items-center gap-2 border border-[var(--term-border)] px-2 font-semibold text-[var(--term-text-muted)] outline-none transition-colors hover:text-[var(--term-text)] focus-visible:text-[var(--term-text)] lg:flex"
            style={{ fontSize: "12px", letterSpacing: TRACK.data, borderRadius: "var(--term-radius-sm)" }}
            title="⌘K"
            aria-keyshortcuts="Meta+K Control+K"
          >
            <Search size={13} aria-hidden />
            SEARCH
          </button>
        </div>
      </div>
    </header>
  )
}
