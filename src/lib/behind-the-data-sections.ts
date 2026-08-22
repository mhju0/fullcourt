/**
 * The reference section's own table of contents.
 *
 * One entry per thing the site computes, plus a shared page for sources and limits. These
 * are real routes rather than client-side tabs so each one is linkable, crawlable, and can
 * be deep-linked from the product page it explains — the "How this is calculated" links.
 *
 * `surfaceHrefs` lists the product pages this section documents, and is what those contextual
 * links are derived from. Empty where a section explains something cross-cutting rather than any
 * one surface.
 *
 * A list rather than a single route, since 2026-08-12. It was one route, and the cost was silent:
 * `MethodLink` renders nothing when it finds no match, so GAMES passed `surfaceHref="/"`, matched
 * nothing, and published a header with no route to its method while the JSX read as though it had
 * one. `/season` had no link at all. Both run on the fatigue score documented here, so the honest
 * fix is one section serving three surfaces rather than three near-identical pages.
 */
export const BEHIND_THE_DATA_SECTIONS = [
  {
    href: "/behind-the-data",
    label: "OVERVIEW",
    title: "Behind the data",
    surfaceHrefs: [],
  },
  {
    href: "/behind-the-data/rest-advantage",
    label: "REST ADVANTAGE",
    title: "Rest advantage",
    /* The fatigue score, which the games board, MODEL RESULTS and SEASON REPORT all render.
       MODEL RESULTS leads the list because it is where a reader is most likely to want the
       method, but the order carries no meaning — a surface belongs to exactly one section. */
    surfaceHrefs: ["/analysis", "/games", "/season"],
  },
  {
    href: "/behind-the-data/schedule-edge",
    label: "SCHEDULE EDGE",
    title: "Schedule edge",
    surfaceHrefs: ["/schedule"],
  },
  {
    href: "/behind-the-data/playoff-predictions",
    label: "PLAYOFF REST",
    title: "Playoff predictions",
    surfaceHrefs: ["/playoffs"],
  },
  {
    href: "/behind-the-data/player-shooting",
    label: "PLAYER SHOOTING",
    title: "Player shooting",
    surfaceHrefs: ["/shooting"],
  },
  {
    href: "/behind-the-data/shot-value",
    label: "SHOT VALUE",
    title: "Shot value",
    surfaceHrefs: ["/shot-quality"],
  },
  {
    href: "/behind-the-data/availability",
    label: "AVAILABILITY COST",
    title: "Availability cost",
    surfaceHrefs: ["/availability"],
  },
  {
    href: "/behind-the-data/referees",
    label: "REFEREE EFFECT",
    title: "Referee effect",
    surfaceHrefs: ["/referees"],
  },
  {
    href: "/behind-the-data/data-and-limits",
    label: "DATA & LIMITS",
    title: "Data and limits",
    surfaceHrefs: [],
  },
] as const;

/** The reference page documenting a given product surface, if one exists. */
export function methodologyHrefFor(surfaceHref: string): string | null {
  return (
    BEHIND_THE_DATA_SECTIONS.find((s) =>
      (s.surfaceHrefs as readonly string[]).includes(surfaceHref)
    )?.href ?? null
  );
}
