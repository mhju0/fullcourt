export const PRIMARY_NAV_ITEMS = [
  {
    href: "/",
    // Deliberately plain: every mainstream NBA nav (ESPN, CBS) uses bare nouns, and the
    // page browses any season's slate — so no time word ("today's") can stay true here.
    label: "GAMES",
    guideDescription:
      "Browse any season's games, past or current, and compare each team's fatigue and rest advantage.",
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
    href: "/shot-quality",
    // The page's own h1 minus the jargon; "xeFG%" stays in the eyebrow where context decodes it.
    label: "SHOT VALUE",
    guideDescription:
      "Map expected shooting efficiency by court location and model version.",
  },
] as const;
