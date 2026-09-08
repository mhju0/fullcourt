"use client";

import { useLocationSearch } from "@/hooks/useSeasonUrl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { navigateWithViewTransition } from "@/lib/route-transition";

/**
 * A `next/link` whose plain left-click travels through the route cross-fade (G1). It
 * stays a real `<a>` — middle-click, modifier-click, copy and crawl all behave exactly
 * as Link's defaults, because those clicks are never intercepted.
 *
 * Chrome navigation only (tabs, dock, menu, wordmark): in-content links keep plain
 * Link, per the motion law's budget — the cross-fade is one moment, not a default.
 */
export function TransitionLink({
  href,
  onClick,
  ...rest
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  const search = useLocationSearch();
  const selectedSeason = new URLSearchParams(search).get("season");
  if (
    typeof href === "string" &&
    ["/games", "/season", "/schedule"].includes(href) &&
    selectedSeason
  ) {
    href = `${href}?season=${encodeURIComponent(selectedSeason)}`;
  }

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Anything but a plain left-click keeps the browser's own behaviour.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (rest.target && rest.target !== "_self") return;
    if (rest.download !== undefined && rest.download !== false) return;
    if (
      typeof href !== "string" ||
      !href.startsWith("/") ||
      href.startsWith("//")
    )
      return;
    e.preventDefault();
    navigateWithViewTransition(router, href, { instant: e.detail === 0 });
  };

  return <Link href={href} onClick={handleClick} {...rest} />;
}
