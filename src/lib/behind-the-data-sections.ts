/**
 * The reference section's own table of contents.
 *
 * One entry per thing the site computes, plus a shared page for sources and limits. These
 * are real routes rather than client-side tabs so each one is linkable, crawlable, and can
 * be deep-linked from the product page it explains — the "How this is calculated" links.
 *
 * `surfaceHref` is the product page this section documents, and is what those contextual
 * links are derived from. Null where a section explains something cross-cutting rather than
 * one surface.
 */
export const BEHIND_THE_DATA_SECTIONS = [
  {
    href: "/behind-the-data",
    label: "OVERVIEW",
    title: "Behind the data",
    surfaceHref: null,
  },
  {
    href: "/behind-the-data/rest-advantage",
    label: "REST ADVANTAGE",
    title: "Rest advantage",
    /* Documents the fatigue score, which GAMES and MODEL RESULTS both render. MODEL RESULTS
       is the page where a reader is most likely to want the method, so it wins the link. */
    surfaceHref: "/analysis",
  },
  {
    href: "/behind-the-data/schedule-edge",
    label: "SCHEDULE EDGE",
    title: "Schedule edge",
    surfaceHref: "/schedule",
  },
  {
    href: "/behind-the-data/playoff-predictions",
    label: "PLAYOFF PREDICTIONS",
    title: "Playoff predictions",
    surfaceHref: "/playoffs",
  },
  {
    href: "/behind-the-data/player-shooting",
    label: "PLAYER SHOOTING",
    title: "Player shooting",
    surfaceHref: "/shooting",
  },
  {
    href: "/behind-the-data/shot-value",
    label: "SHOT VALUE",
    title: "Shot value",
    surfaceHref: "/shot-quality",
  },
  {
    href: "/behind-the-data/data-and-limits",
    label: "DATA & LIMITS",
    title: "Data and limits",
    surfaceHref: null,
  },
] as const;

/** The reference page documenting a given product surface, if one exists. */
export function methodologyHrefFor(surfaceHref: string): string | null {
  return (
    BEHIND_THE_DATA_SECTIONS.find((s) => s.surfaceHref === surfaceHref)?.href ?? null
  );
}
