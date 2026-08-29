"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { navigateWithViewTransition } from "@/lib/route-transition"
import { useCallback, useEffect, useState } from "react"
import { SECONDARY_LINKS } from "@/components/nav-bar"
import {
  DIRECT_NAV_ITEMS,
  OTHER_NAV_ITEMS,
  PALETTE_OPEN_EVENT,
} from "@/lib/primary-navigation"

/**
 * The ⌘K palette (2026-08-29 shell merge, ADR 0010). v1 is deliberately navigation-only: the
 * nine product routes plus BEHIND THE DATA, grouped the way the bar groups them. Entities
 * (teams, officials, players) wait for entity destinations; the one URL-addressable filter
 * found in the audit (`/shooting?player=`) is entity territory and waits with them — the
 * finding is recorded in the stage ③ PR, not wired here.
 *
 * Summoned three ways, and two of them are visible — the bar's SEARCH button and the bottom
 * nav's search slot both dispatch {@link PALETTE_OPEN_EVENT}. The GitHub lesson stands:
 * a keyboard-only palette is a feature nobody finds, so the shortcut (⌘K / Ctrl+K) is the
 * accelerator, never the door.
 *
 * Mounted once in the root layout. Styling lives in globals.css under the `[cmdk-*]`
 * attribute selectors cmdk stamps on its parts — tokens only, on the type scale, and with no
 * entry animation at all, so there is nothing to guard for reduced motion.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onSummon = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(PALETTE_OPEN_EVENT, onSummon)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(PALETTE_OPEN_EVENT, onSummon)
    }
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      // Through the route cross-fade (G1) — the palette is chrome navigation like a tab.
      navigateWithViewTransition(router, href)
    },
    [router]
  )

  // `value` carries label AND href so typing either ("referee", "/referees") matches.
  const item = ({ href, label }: { href: string; label: string }) => (
    <Command.Item key={href} value={`${label} ${href}`} onSelect={() => go(href)}>
      {label}
      <span cmdk-fc-hint="">{href}</span>
    </Command.Item>
  )

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette">
      <Command.Input placeholder="Jump to a surface…" />
      <Command.List>
        <Command.Empty>No surface matches.</Command.Empty>
        <Command.Group heading="Surfaces">{DIRECT_NAV_ITEMS.map(item)}</Command.Group>
        <Command.Group heading="Other">{OTHER_NAV_ITEMS.map(item)}</Command.Group>
        <Command.Group heading="Reference">{SECONDARY_LINKS.map(item)}</Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
