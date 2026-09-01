"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { navigateWithViewTransition } from "@/lib/route-transition"
import { useCallback } from "react"
import { SECONDARY_LINKS } from "@/components/nav-bar"
import { DIRECT_NAV_ITEMS, OTHER_NAV_ITEMS } from "@/lib/primary-navigation"

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
 * Styling lives in globals.css under the `[cmdk-*]` attribute selectors cmdk stamps on its
 * parts — tokens only, on the type scale, and with no entry animation at all, so there is
 * nothing to guard for reduced motion.
 *
 * **Controlled, and mounted by `CommandPaletteMount` rather than by the layout directly.** It
 * used to own its own `open` state and its own ⌘K listener, which meant the root layout
 * imported it statically and `cmdk` — plus the sixteen `@radix-ui/*` packages it pulls in
 * behind `@radix-ui/react-dialog` — shipped on all twenty routes to render nothing until
 * someone pressed a key. The listener now lives in the mount, which is ~1KB and is the only
 * part that has to be there from the start; this file arrives on first summon. Keep the state
 * up there: an inner component cannot hear the event that decided to load it.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      // Through the route cross-fade (G1) — the palette is chrome navigation like a tab.
      navigateWithViewTransition(router, href)
    },
    [router, onOpenChange]
  )

  // `value` carries label AND href so typing either ("referee", "/referees") matches.
  const item = ({ href, label }: { href: string; label: string }) => (
    <Command.Item key={href} value={`${label} ${href}`} onSelect={() => go(href)}>
      {label}
      <span cmdk-fc-hint="">{href}</span>
    </Command.Item>
  )

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette">
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
