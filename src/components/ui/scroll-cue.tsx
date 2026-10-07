"use client"

import { useEffect, useRef } from "react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

/**
 * A sideways scroller that shows when it has more. The edge with hidden content fades out, so
 * the last visible column or chip is visibly cut; a wide table that ends cleanly at the screen
 * edge reads as complete, and its other columns go unseen.
 *
 * The state is written as attributes, straight to the element, so scrolling re-renders nothing:
 * `data-more-start`, `data-more-end`, and `data-overflow` while the content is wider than the box.
 * The fade and the hint line that follows a table are CSS on those (`.fc-scroll-cue`, globals.css).
 * Pass `data-pinned` when the first column is sticky, so the start edge never fades over it.
 */
export function ScrollCue({ className, children, ref: outerRef, ...rest }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      el.toggleAttribute("data-overflow", max > 1)
      el.toggleAttribute("data-more-start", el.scrollLeft > 1)
      el.toggleAttribute("data-more-end", el.scrollLeft < max - 1)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    // The box and its content resize independently: a viewport change moves the first, a
    // disclosure opening or rows arriving moves the second.
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => {
      el.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={(el) => {
        ref.current = el
        if (typeof outerRef === "function") outerRef(el)
        else if (outerRef) outerRef.current = el
      }}
      className={cn("fc-scroll-cue", className)}
      {...rest}
    >
      {children}
    </div>
  )
}
