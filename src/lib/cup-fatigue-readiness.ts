import { scoreGameFatigue, FATIGUE_RECENT_LOOKBACK_DAYS, type FatigueTeam } from "./fatigue";
import { toFatigueScoreWrite } from "./daily-refresh";
import { neutralizeIfUnplayed, rowToRecentGame, type PriorGameRow } from "./fatigue-recent-games";
import { isHeldGame, WORKLOAD_STATUSES } from "./game-status";
import { resolvePhysicalVenue } from "./physical-venue";

export type CupPhysicalGame = PriorGameRow & {
  id: number;
  season: string;
  gameType: string;
  status: string;
};
export type CupFatigueContext = {
  games: CupPhysicalGame[];
  teams: FatigueTeam[];
  fatigue: Record<string, unknown>[];
  publishedFatigue?: Record<string, unknown>[];
};
export type CupPendingSides = { home: boolean; away: boolean };

export function needsCupScheduleContext(season: string, date: string): boolean {
  return season === "2026-27" && date >= "2026-12-05";
}

function daysAfter(date: string, days: number): string {
  const end = new Date(`${date}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString().slice(0, 10);
}

export function isCupFatigueWindow(season: string, date: string, latestCupDate = "2026-12-11"): boolean {
  return needsCupScheduleContext(season, date) && date <= daysAfter(latestCupDate < "2026-12-11" ? "2026-12-11" : latestCupDate, FATIGUE_RECENT_LOOKBACK_DAYS);
}

function validVenue(game: CupPhysicalGame): boolean {
  if (!Number.isSafeInteger(game.id) || game.id < 1 || game.homeTeamId === game.awayTeamId || !game.homeAbbr || !game.awayAbbr || game.homeAbbr === "TBD" || game.awayAbbr === "TBD") return false;
  if (![game.homeLat, game.homeLon, game.awayLat, game.awayLon].every(value => Number.isFinite(Number(value)))) return false;
  try {
    return resolvePhysicalVenue({
      date: game.date,
      homeTeam: { abbreviation: game.homeAbbr, latitude: Number(game.homeLat), longitude: Number(game.homeLon), altitude: game.homeAltitude },
      awayTeam: { abbreviation: game.awayAbbr, latitude: Number(game.awayLat), longitude: Number(game.awayLon), altitude: game.awayAltitude },
      neutralSite: game.neutralSite,
      neutralVenueCity: game.neutralVenueCity,
    }).venueSource !== "unknown-neutral-fallback";
  } catch {
    return false;
  }
}

const workload = (game: CupPhysicalGame) => WORKLOAD_STATUSES.some(status => status === game.status);
const involves = (game: CupPhysicalGame, teamId: number) => game.homeTeamId === teamId || game.awayTeamId === teamId;
const SPECIAL_COLUMNS: Record<string, string> = {
  backToBackMultiplier: "b2b_multiplier",
  gamesInLast7Days: "games_in_last_7_days",
  gamesInLast30Days: "games_in_last_30_days",
};
const storedColumn = (key: string) => SPECIAL_COLUMNS[key] ?? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

export function cupPendingSides(target: CupPhysicalGame, context: CupFatigueContext): CupPendingSides {
  const games = context.games.filter(game => game.season === target.season);
  const finalDates = games.filter(game => game.gameType === "cup_final").map(game => game.date).sort();
  if (!isCupFatigueWindow(target.season, target.date, finalDates.at(-1)) || isHeldGame(target.status)) return { home: false, away: false };
  const finals = games.filter(game => game.gameType === "cup_final" && workload(game));
  const final = finals.length === 1 && finals[0].date === "2026-12-11" && finals[0].neutralSite === true && finals[0].neutralVenueCity === "Indianapolis" && validVenue(finals[0]) ? finals[0] : null;
  const start = new Date(`${target.date}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - FATIGUE_RECENT_LOOKBACK_DAYS);
  const priors = games.filter(game => game.date >= start.toISOString().slice(0, 10) && game.date < target.date && workload(game));
  const sidePending = (teamId: number) => {
    const finalist = final && involves(final, teamId);
    if (final && !finalist && target.date > "2027-01-09") return false;
    const regular = games.filter(game => game.gameType === "regular" && workload(game) && involves(game, teamId));
    const cup = regular.filter(game => game.date >= "2026-12-04" && game.date <= "2026-12-10");
    const identities = new Set(regular.map(game => `${game.date}:${game.homeTeamId}:${game.awayTeamId}`));
    if (!final || regular.length !== 82 || new Set(regular.map(game => game.id)).size !== 82 || identities.size !== 82 || cup.length !== 2 || !cup.every(validVenue) || !validVenue(target)) return true;
    return priors.filter(game => involves(game, teamId)).some(game => !validVenue(game));
  };
  const pending = { home: sidePending(target.homeTeamId), away: sidePending(target.awayTeamId) };
  if (pending.home && pending.away) return pending;
  const homeTeam = context.teams.find(team => team.id === target.homeTeamId);
  const awayTeam = context.teams.find(team => team.id === target.awayTeamId);
  if (!homeTeam || !awayTeam) return { home: true, away: true };
  const recent = (teamId: number) => priors.filter(game => involves(game, teamId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map(neutralizeIfUnplayed).map(game => rowToRecentGame(game, teamId));
  const result = scoreGameFatigue({ game: target, homeTeam, awayTeam, homeRecentGames: recent(target.homeTeamId), awayRecentGames: recent(target.awayTeamId) });
  for (const side of ["home", "away"] as const) {
    if (pending[side] || final && !involves(final, side === "home" ? target.homeTeamId : target.awayTeamId) && target.date > "2027-01-09") continue;
    const teamId = side === "home" ? target.homeTeamId : target.awayTeamId;
    const stored = context.fatigue.find(row => Number(row.game_id) === target.id && Number(row.team_id) === teamId);
    const expected = toFatigueScoreWrite(teamId, result[side]);
    pending[side] = !stored || Object.entries(expected).some(([key, value]) => {
      const actual = stored[storedColumn(key)];
      return value === null ? actual !== null : typeof value === "boolean" ? actual !== value : actual == null || Number(actual) !== Number(value);
    });
    const published = context.publishedFatigue?.find(row => Number(row.game_id) === target.id && Number(row.team_id) === teamId);
    if (!pending[side] && context.publishedFatigue) pending[side] = !published || Object.entries(expected).some(([key, value]) => {
      const column = storedColumn(key);
      if (!Object.hasOwn(published, column)) return false;
      const actual = published[column];
      return value === null ? actual !== null : typeof value === "boolean" ? actual !== value : actual == null || Number(actual) !== Number(value);
    });
  }
  return pending;
}
