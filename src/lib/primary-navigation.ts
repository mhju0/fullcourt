export const PRIMARY_NAV_ITEMS = [
  {
    href: "/",
    label: "TODAY'S GAMES",
    guideDescription:
      "Browse any regular-season slate and compare each team's fatigue and rest advantage.",
  },
  {
    href: "/analysis",
    label: "ANALYSIS",
    guideDescription:
      "Explore the historical backtest, threshold results, season trends, and individual games.",
  },
  {
    href: "/upcoming",
    // Not "PICKS": the route, the page heading and the tab title all said something
    // different, and "picks" promised betting tips the guide copy below disclaims.
    label: "UPCOMING EDGES",
    guideDescription:
      "Find scheduled matchups with a larger modeled rest edge. This is not betting advice.",
  },
  {
    href: "/playoffs",
    label: "PLAYOFFS",
    guideDescription:
      "Compare series win probabilities from FullCourt's separate playoff model.",
  },
  {
    href: "/schedule",
    label: "SCHEDULE",
    guideDescription:
      "See which teams a season's schedule favored, in days of rest against their opponents.",
  },
  {
    href: "/shot-quality",
    label: "SHOT QUALITY",
    guideDescription:
      "Map expected shooting efficiency by court location and model version.",
  },
] as const;
