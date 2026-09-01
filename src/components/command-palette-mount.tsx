"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { PALETTE_OPEN_EVENT } from "@/lib/primary-navigation"

/**
 * The palette's doorbell — everything about ⌘K that has to exist before ⌘K is pressed.
 *
 * `CommandPalette` was imported statically by the root layout, so `cmdk` and the sixteen
 * `@radix-ui/*` packages it pulls in behind `@radix-ui/react-dialog` shipped in the chunk that
 * loads on **all twenty routes** — to render nothing at all until someone summoned it (audit,
 * 2026-09-01). Nothing was wrong with the palette; the wrong part was *when* it arrived.
 *
 * So the listener stays and the palette leaves. This file is the listener: three event
 * handlers and two booleans, small enough that carrying it everywhere is honest. The palette
 * itself is fetched on the first summon and kept after that — `loaded` never goes back to
 * false, because closing a dialog is not a reason to throw its code away.
 *
 * **The state has to live here, not in the palette.** A component that mounts *because* of an
 * event cannot also be the thing that heard it: it would arrive one tick too late and the
 * first ⌘K would do nothing. So `open` is owned up here and `CommandPalette` is controlled.
 *
 * **The first ⌘K opens; only later ones toggle.** ⌘K is a toggle by convention, but the very
 * first press is also the one that starts a network fetch, and between the press and the chunk
 * landing the dialog renders nothing (`ssr: false`, no `loading` fallback). A reader who presses
 * again into that silence would otherwise flip `open` back to false and get a palette that
 * arrives already closed — the keystroke reads as dead precisely when the connection is slow
 * enough to make it matter. Tracked in a ref because the listener is bound once.
 */
const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => m.CommandPalette),
  { ssr: false },
)

export function CommandPaletteMount() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (!loadedRef.current) {
          loadedRef.current = true
          setLoaded(true)
          setOpen(true)
          return
        }
        setOpen((prev) => !prev)
      }
    }
    // The two visible doors — the bar's SEARCH button and the dock's search slot. The GitHub
    // lesson stands: a keyboard-only palette is a feature nobody finds.
    const onSummon = () => {
      loadedRef.current = true
      setLoaded(true)
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener(PALETTE_OPEN_EVENT, onSummon)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(PALETTE_OPEN_EVENT, onSummon)
    }
  }, [])

  if (!loaded) return null
  return <CommandPalette open={open} onOpenChange={setOpen} />
}
