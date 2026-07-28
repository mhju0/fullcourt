/** Tabs rendered directly in the bar, in order. */
export const DIRECT_NAV_ITEMS = [
  {
    href: "/",
    // Deliberately plain: every mainstream NBA nav (ESPN, CBS) uses bare nouns, and the
    // page browses any season's slate — so no time word ("today's") can stay true here.
    label: "GAMES",
    guideDescription:
      "Compare each team's fatigue and rest advantage — by date across any season, or ranked by edge for the games ahead.",
  },
  {
    href: "/schedule",
    // Not bare "SCHEDULE": on every other sports site that word means a list of games,
    // which is this site's GAMES tab. The qualifier is what blocks the wrong click.
    label: "SCHEDULE EDGE",
    guideDescription:
      "See which teams a season's schedule favored, in days of rest against their opponents.",
  },
  {
    href: "/analysis",
    // Not "HISTORICAL DATA": GAMES already browses history, so that label collided with it,
    // and "data" promises a table dump. This page scores the model, not the games.
    label: "MODEL RESULTS",
    guideDescription:
      "Check how the rest model scored against history — threshold win rates, season trends, and individual games.",
  },
  {
    href: "/playoffs",
    label: "PLAYOFF PREDICTIONS",
    guideDescription:
      "Compare series win probabilities from FullCourt's separate playoff model.",
  },
  {
    href: "/shooting",
    // Not "SHOOTING": SHOT VALUE is already about shooting, and the two would read as a
    // pair of near-synonyms in the same bar. The qualifier names what only this page has.
    label: "REST & SHOOTING",
    guideDescription:
      "Look up any player's shooting on no rest against three days off, season by season.",
  },
] as const;

/** The label on the menu trigger that reveals {@link OTHER_NAV_ITEMS}. */
export const OTHER_NAV_LABEL = "OTHER";

/**
 * Surfaces that live behind the OTHER menu rather than taking a tab of their own.
 * These are still first-class pages — the grouping keeps the bar short as the set of
 * smaller reference surfaces grows, rather than ranking them below the direct tabs.
 */
export const OTHER_NAV_ITEMS = [
  {
    href: "/shot-quality",
    // The page's own h1 minus the jargon; "xeFG%" stays in the eyebrow where context decodes it.
    label: "SHOT VALUE",
    guideDescription:
      "Map expected shooting efficiency by court location and model version.",
  },
] as const;

/**
 * Every primary surface, direct tabs first. Consumers that describe the product rather
 * than draw the bar — the first-visit guide especially — want the whole set, not the split.
 */
export const PRIMARY_NAV_ITEMS = [...DIRECT_NAV_ITEMS, ...OTHER_NAV_ITEMS] as const;
