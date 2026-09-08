/** The same four destinations lead the desktop bar and phone dock. */
export const DIRECT_NAV_ITEMS = [
  { href: "/games", label: "GAMES" },
  { href: "/season", label: "SEASON REPORT" },
  { href: "/schedule", label: "SCHEDULE EDGE" },
  { href: "/explore", label: "EXPLORE" },
] as const;

/** Product analyses reached through Explore and the page palette. */
export const EXPLORE_NAV_ITEMS = [
  { href: "/shooting", label: "PLAYER SHOOTING" },
  { href: "/playoffs", label: "PLAYOFF REST" },
  { href: "/analysis", label: "MODEL RESULTS" },
  { href: "/availability", label: "AVAILABILITY COST" },
  { href: "/officiating", label: "OFFICIATING", keywords: ["referee", "referees", "L2M"] },
  { href: "/shot-quality", label: "SHOT VALUE" },
] as const;

export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Explore stays selected on its analyses, while methodology retains its own reference link. */
export function primaryNavCurrent(pathname: string, href: string): "page" | "location" | undefined {
  if (isActiveRoute(pathname, href)) return "page";
  if (href === "/explore" && EXPLORE_NAV_ITEMS.some((item) => isActiveRoute(pathname, item.href))) return "location";
  return undefined;
}

export const PALETTE_OPEN_EVENT = "fc:open-palette";

/** Analytical destinations, excluding the Explore directory itself. */
export const PRIMARY_NAV_ITEMS = [...DIRECT_NAV_ITEMS.filter((item) => item.href !== "/explore"), ...EXPLORE_NAV_ITEMS] as const;
