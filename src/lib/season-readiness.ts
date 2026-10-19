import { formatEasternDateKey } from "@/lib/nba-season";
import { CURRENT_TEAM_ABBREVIATIONS } from "@/lib/team-history";

const MIN_FINAL_APPEARANCES = 10;

export interface SeasonReadiness {
  season: string;
  ready: boolean;
  expectedAfterDate: string | null;
}

export interface ReadinessGame {
  gameId: number;
  date: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
}

export function hasValidFinalScore(game: ReadinessGame): boolean {
  return game.status === "final" &&
    Number.isInteger(game.homeScore) && Number.isInteger(game.awayScore) &&
    game.homeScore !== null && game.awayScore !== null &&
    game.homeScore >= 0 && game.awayScore >= 0 && game.homeScore !== game.awayScore;
}

export function buildSeasonReadiness(
  season: string,
  games: readonly ReadinessGame[],
  directory: readonly { id: number; abbreviation: string }[],
): SeasonReadiness {
  const ids = new Map(directory.map((team) => [team.abbreviation, team.id]));
  const teamIds = CURRENT_TEAM_ABBREVIATIONS.map((abbreviation) => ids.get(abbreviation));
  if (teamIds.some((id) => id === undefined) || new Set(teamIds).size !== teamIds.length) {
    return { season, ready: false, expectedAfterDate: null };
  }
  const finals = new Map(teamIds.map((id) => [id!, 0]));
  const dates = new Map(teamIds.map((id) => [id!, [] as string[]]));
  const seen = new Set<number>();
  for (const game of games) {
    if (seen.has(game.gameId)) continue;
    seen.add(game.gameId);
    if (game.homeTeamId === game.awayTeamId) continue;
    const final = hasValidFinalScore(game);
    const usable = final || game.status === "scheduled" || game.status === "live";
    for (const id of [game.homeTeamId, game.awayTeamId]) {
      if (!finals.has(id)) continue;
      if (final) finals.set(id, finals.get(id)! + 1);
      if (usable) dates.get(id)!.push(game.date);
    }
  }
  const ready = [...finals.values()].every((count) => count >= MIN_FINAL_APPEARANCES);
  const expectedDates = [...dates.values()].map((values) => values.sort()[MIN_FINAL_APPEARANCES - 1]);
  return {
    season,
    ready,
    expectedAfterDate: expectedDates.every(Boolean) ? expectedDates.sort().at(-1)! : null,
  };
}

export function seasonExpectedTiming(date: string | null, today = formatEasternDateKey()): string | null {
  if (!date || date < today) return null;
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", timeZone: "America/New_York",
  }).format(new Date(`${date}T12:00:00Z`));
  return `Expected after the ${label} games (ET).`;
}
