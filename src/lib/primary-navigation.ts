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
    label: "PICKS",
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
    href: "/shot-quality",
    label: "SHOT QUALITY",
    guideDescription:
      "Map expected shooting efficiency by court location and model version.",
  },
] as const;
