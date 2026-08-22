/** Tabs rendered directly in the bar, in order. */
export const DIRECT_NAV_ITEMS = [
  {
    // `/games`, not `/`, since 2026-08-12: `/` is the marketing page. This stays the first tab,
    // so a returning visitor who types the bare domain reaches the board in one click.
    href: "/games",
    // Deliberately plain: every mainstream NBA nav (ESPN, CBS) uses bare nouns, and the
    // page browses any season's slate — so no time word ("today's") can stay true here.
    label: "GAMES",
  },
  {
    href: "/season",
    // Not "SEASON REVIEW": review implies the season has ended, and this page runs live from
    // October. Not bare "SEASON": GAMES already browses any season's slate and SCHEDULE EDGE
    // already ranks teams inside one, so the noun alone collides with two tabs we own.
    label: "SEASON REPORT",
  },
  {
    href: "/schedule",
    // Not bare "SCHEDULE": on every other sports site that word means a list of games,
    // which is this site's GAMES tab. The qualifier is what blocks the wrong click.
    label: "SCHEDULE EDGE",
  },
  {
    href: "/analysis",
    // Not "HISTORICAL DATA": GAMES already browses history, so that label collided with it,
    // and "data" promises a table dump. This page scores the model, not the games.
    label: "MODEL RESULTS",
  },
  {
    href: "/playoffs",
    // Not "PLAYOFF EDGE": `edge` is the qualifier that makes SCHEDULE EDGE legible as something
    // other than a game list, and a second EDGE tab stops it qualifying. Not "PLAYOFF EFFECT":
    // REFEREE EFFECT means the effect referees have, so by that pattern this would read as the
    // effect the playoffs have — backwards, since the page is about the effect of rest inside
    // them. "REST" is the site's own word and the page is the postseason answer to it.
    label: "PLAYOFF REST",
  },
  {
    href: "/shooting",
    // Not bare "SHOOTING": on Basketball-Reference and NBA.com that word means shot
    // *location*, which is SHOT VALUE. "Player" is the qualifier that separates the two by
    // subject — people here, court cells there — and it keeps working if SHOT VALUE ever
    // returns to the bar. Not "PLAYER REST": the rest tab is SCHEDULE EDGE, and colliding
    // with our own vocabulary misroutes worse than colliding with someone else's.
    label: "PLAYER SHOOTING",
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
  },
  {
    href: "/availability",
    // Not bare "AVAILABILITY": on every other basketball site that word heads an injury
    // report — who is out tonight. This page is the opposite tense, a finished measurement
    // of what an absence cost, and it has no live lineup data at all. "COST" is the
    // qualifier that blocks the wrong click, the same job "EDGE" does for SCHEDULE EDGE.
    label: "AVAILABILITY COST",
  },
  {
    href: "/referees",
    label: "REFEREE EFFECT",
    // Published 2026-08-22 on Michael's explicit instruction, after being held back since
    // 2026-07-30. The `inProgress: true` flag that used to sit here — and the "Still being
    // built." guide text before it — are gone with the state they described.
    //
    // This entry was the only user of the `inProgress` flag and of the IN PROGRESS tag in
    // nav-bar.tsx; both were removed with it rather than left unused. Git history carries the
    // mechanism if another surface is ever held back this way.
  },
] as const;

/**
 * Every primary surface, direct tabs first, for consumers that want the whole set rather than
 * the bar's split of it.
 *
 * Each entry is a route and the label the nav draws for it, plus the reasoning for that label —
 * these names were chosen against each other and against what the same words mean on other
 * basketball sites, so the comments are the record of why a tab is not called something more
 * obvious. Entries carried a `guideDescription` sentence until 2026-08-11; the first-visit
 * guide was the only thing that ever rendered them, and they went when it did.
 */
export const PRIMARY_NAV_ITEMS = [...DIRECT_NAV_ITEMS, ...OTHER_NAV_ITEMS] as const;
