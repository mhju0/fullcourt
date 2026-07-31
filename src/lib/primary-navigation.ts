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
    href: "/season",
    // Not "SEASON REVIEW": review implies the season has ended, and this page runs live from
    // October. Not bare "SEASON": GAMES already browses any season's slate and SCHEDULE EDGE
    // already ranks teams inside one, so the noun alone collides with two tabs we own.
    label: "SEASON REPORT",
    guideDescription:
      "Read one season end to end — how the rest call scored, which teams converted a rest edge, and what the schedule cost each of them.",
  },
  {
    href: "/schedule",
    // Not bare "SCHEDULE": on every other sports site that word means a list of games,
    // which is this site's GAMES tab. The qualifier is what blocks the wrong click.
    label: "SCHEDULE EDGE",
    guideDescription:
      "See which teams a season's schedule favored, counted in games with a real rest edge.",
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
    // Not "PLAYOFF EDGE": `edge` is the qualifier that makes SCHEDULE EDGE legible as something
    // other than a game list, and a second EDGE tab stops it qualifying. Not "PLAYOFF EFFECT":
    // REFEREE EFFECT means the effect referees have, so by that pattern this would read as the
    // effect the playoffs have — backwards, since the page is about the effect of rest inside
    // them. "REST" is the site's own word and the page is the postseason answer to it.
    label: "PLAYOFF REST",
    guideDescription:
      "See what surviving a long series costs a team in the round that follows.",
  },
  {
    href: "/shooting",
    // Not bare "SHOOTING": on Basketball-Reference and NBA.com that word means shot
    // *location*, which is SHOT VALUE. "Player" is the qualifier that separates the two by
    // subject — people here, court cells there — and it keeps working if SHOT VALUE ever
    // returns to the bar. Not "PLAYER REST": the rest tab is SCHEDULE EDGE, and colliding
    // with our own vocabulary misroutes worse than colliding with someone else's.
    label: "PLAYER SHOOTING",
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
  {
    href: "/referees",
    label: "REFEREE EFFECT",
    // The page is a placeholder — the whistle numbers came back inside noise and were pulled.
    // The description has to stop promising a table that is no longer there.
    guideDescription: "Still being built.",
  },
] as const;

/**
 * Every primary surface, direct tabs first. Consumers that describe the product rather
 * than draw the bar — the first-visit guide especially — want the whole set, not the split.
 */
export const PRIMARY_NAV_ITEMS = [...DIRECT_NAV_ITEMS, ...OTHER_NAV_ITEMS] as const;
