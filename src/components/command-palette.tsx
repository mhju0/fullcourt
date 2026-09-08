"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { navigateWithViewTransition } from "@/lib/route-transition"
import { useCallback, useRef } from "react"
import { SECONDARY_LINKS } from "@/components/nav-bar"
import { DIRECT_NAV_ITEMS, EXPLORE_NAV_ITEMS } from "@/lib/primary-navigation"

/**
 * Navigation-only palette, loaded on first use by CommandPaletteMount. Keeping open state in
 * the mount lets the first shortcut or footer click both fetch the chunk and open the dialog.
 * Keyboard selections navigate immediately; pointer selections use the shared route transition.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const keyboardSelection = useRef(true)

  const go = useCallback(
    (href: string) => {
      onOpenChange(false)
      // Keyboard selection stays immediate; pointer selection uses chrome navigation.
      navigateWithViewTransition(router, href, { instant: keyboardSelection.current })
    },
    [router, onOpenChange]
  )

  // Search aliases preserve familiar terms when a surface is renamed.
  const item = ({ href, label, keywords = [] }: { href: string; label: string; keywords?: readonly string[] }) => (
    <Command.Item key={href} value={`${label} ${href} ${keywords.join(" ")}`} onSelect={() => go(href)}>
      {label}
      <span cmdk-fc-hint="">{href}</span>
    </Command.Item>
  )

  return (
    <Command.Dialog onKeyDownCapture={() => { keyboardSelection.current = true }} onPointerDownCapture={() => { keyboardSelection.current = false }} open={open} onOpenChange={onOpenChange} label="Command palette">
      <Command.Input placeholder="Jump to a surface…" />
      <Command.List>
        <Command.Empty>No surface matches.</Command.Empty>
        <Command.Group heading="Surfaces">{DIRECT_NAV_ITEMS.map(item)}</Command.Group>
        <Command.Group heading="Explore">{EXPLORE_NAV_ITEMS.map(item)}</Command.Group>
        <Command.Group heading="Reference">{[...SECONDARY_LINKS, { href: "/about", label: "ABOUT FULLCOURT" }, { href: "/how-it-was-built", label: "HOW IT WAS BUILT", keywords: ["engineering", "Michael", "case study"] }].map(item)}</Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
