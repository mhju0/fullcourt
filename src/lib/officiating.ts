export type ReviewGrade = "IC" | "INC" | "CC" | "CNC" | "Undetectable" | "NCI" | "NCC" | "";
export interface ReviewGame {
  id: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  missed: number;
  wrong: number;
  ungraded: number;
  categories: Partial<Record<string, number>>;
  source: string;
  sha256: string;
}
export interface ReviewSeason {
  season: string;
  refreshedAt: string;
  through: string;
  indexSource: string;
  indexSha256: string;
  missed: number;
  wrong: number;
  categories: Partial<Record<string, number>>;
  games: ReviewGame[];
}
export const GRADE_LABELS: Record<ReviewGrade, string> = {
  INC: "Incorrect non-call",
  IC: "Incorrect call",
  CC: "Correct call",
  CNC: "Correct non-call",
  "": "Not graded",
  NCC: "NCC (unclassified NBA assessment)",
  NCI: "NCI (unclassified NBA assessment)",
  Undetectable: "Undetectable (NBA assessment)",
};
export function categoryLabel(category: string) {
  return (
    (
      {
        "Foul: Shooting": "Shooting foul",
        "Turnover: Traveling": "Traveling",
        "Foul: Defense 3 Second": "Defensive 3-sec",
        "Foul: Personal": "Personal foul",
        "Foul: Loose Ball": "Loose-ball foul",
        "Foul: Offensive": "Offensive foul",
        "Turnover: 3 Second Violation": "Offensive 3-sec",
      } as Record<string, string>
    )[category] ?? category
  );
}
export function filterReviews(
  games: ReviewGame[],
  team: string,
  category: string,
) {
  return games.filter(
    (g) =>
      (!team || g.home === team || g.away === team) &&
      (!category || (g.categories[category] ?? 0) > 0),
  );
}
export function reviewUrl(season: string, team = "", category = "", game = "") {
  const params = new URLSearchParams({ season });
  if (team) params.set("team", team);
  if (category) params.set("type", category);
  if (game) params.set("game", game);
  return `/officiating?${params}`;
}
