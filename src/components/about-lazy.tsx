"use client"

import { lazyContent } from "@/components/lazy-content"

/**
 * `ssr: false` for the same reason the other content components use it, plus one
 * specific to this page: it pulls GSAP, and keeping the whole thing client-only
 * means neither the library nor the marketing markup reaches the app's shared bundle.
 */
export const AboutContentLazy = lazyContent(
  () => import("@/components/about-content").then((m) => m.AboutContent),
  () => (
    // Matches the first section's height so the hero does not jump when it mounts.
    <div style={{ minHeight: "calc(100svh - var(--term-chrome-h))" }} />
  )
)
