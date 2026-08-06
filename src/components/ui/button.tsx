"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { cn } from "@/lib/utils"

/**
 * Trimmed from the shadcn stock button, which shipped 7 variants and 9 sizes for the
 * four call sites this app has. What is left is exactly what those four pass, copied
 * verbatim; add a key here when a call site needs one, rather than carrying the whole
 * set on spec.
 *
 * The `dark:` rules went with the rest: the app is light-only ("Broadcast"), and
 * `/about` — the one deliberately dark surface — scopes its own styling and renders
 * no Button.
 */
const BASE =
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const VARIANTS = {
  outline:
    "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
  ghost:
    "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
} as const

const SIZES = {
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  icon: "size-8",
  "icon-sm":
    "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
} as const

/** Both `variant` and `size` are required — every call site already names them. */
function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & {
  variant: keyof typeof VARIANTS
  size: keyof typeof SIZES
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  )
}

export { Button }
