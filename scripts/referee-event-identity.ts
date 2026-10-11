import { formatEasternDateKey } from "../src/lib/nba-season";

export interface RefereeInputGame {
  externalId: string;
  gameType: string;
  season: string;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

const ESPN_ABBR: Record<string, string> = {
  GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS",
};
export const toOurAbbr = (espn: string) => ESPN_ABBR[espn] ?? espn;

// Canonical NBA identities: nba.com/pistons/game/0021900848,
// nba.com/game/den-vs-lac-0021900886/play-by-play,
// nba.com/blazers/news/road-trip-gets-worse-loss-atlanta, nba.com/suns/game/0021900894.
// Only these retained ESPN responses use a provider date one day after the corrected DB date.
const DATE_CORRECTIONS: Record<string, Omit<RefereeInputGame, "externalId"> & {
  eventId: string;
  providerDate: string;
}> = {
  "0021900848": { gameType: "regular", season: "2019-20", date: "2020-02-23", away: "DET", home: "POR", homeScore: 107, awayScore: 104, eventId: "401161490", providerDate: "2020-02-24" },
  "0021900886": { gameType: "regular", season: "2019-20", date: "2020-02-28", away: "DEN", home: "LAC", homeScore: 132, awayScore: 103, eventId: "401161528", providerDate: "2020-02-29" },
  "0021900888": { gameType: "regular", season: "2019-20", date: "2020-02-29", away: "POR", home: "ATL", homeScore: 129, awayScore: 117, eventId: "401161530", providerDate: "2020-03-01" },
  "0021900894": { gameType: "regular", season: "2019-20", date: "2020-02-29", away: "GSW", home: "PHX", homeScore: 99, awayScore: 115, eventId: "401161536", providerDate: "2020-03-01" },
};

function refuse(game: RefereeInputGame, reason: string): never {
  throw new Error(`Referee identity ${game.externalId} ${game.date} ${game.away}@${game.home}: ${reason}`);
}

export function refereeProviderDate(game: RefereeInputGame): string {
  if (!game.externalId || game.gameType !== "regular" || !/^\d{4}-\d{2}$/.test(game.season) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(game.date) || !game.home || !game.away || game.home === game.away ||
      !Number.isInteger(game.homeScore) || !Number.isInteger(game.awayScore) ||
      game.homeScore < 0 || game.awayScore < 0 || game.homeScore === game.awayScore) {
    refuse(game, "invalid stored regular-season final");
  }
  const correction = DATE_CORRECTIONS[game.externalId];
  if (!correction) return game.date;
  for (const field of ["gameType", "season", "date", "home", "away", "homeScore", "awayScore"] as const) {
    if (game[field] !== correction[field]) refuse(game, `approved correction ${field} differs`);
  }
  return correction.providerDate;
}

interface Competitor {
  homeAway?: string;
  score?: string | number;
  team?: { abbreviation?: string };
}
interface Competition {
  id?: string;
  date?: string;
  competitors?: Competitor[];
  status?: { type?: { completed?: boolean; state?: string } };
}
interface EventIdentity {
  id?: string;
  season?: { year?: number; type?: number };
  competitions?: Competition[];
}

function sides(event: EventIdentity) {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  return {
    competitors,
    home: competitors.filter(c => c.homeAway === "home"),
    away: competitors.filter(c => c.homeAway === "away"),
  };
}

function validateIdentity(game: RefereeInputGame, event: EventIdentity, eventId: string) {
  const providerDate = refereeProviderDate(game);
  if (!eventId || event.id !== eventId || event.competitions?.length !== 1 ||
      event.competitions[0].id !== eventId) refuse(game, "event/competition ID differs");
  const expectedYear = Number(game.season.slice(0, 4)) + 1;
  if (event.season?.year !== expectedYear || event.season.type !== 2) {
    refuse(game, "provider season/type differs");
  }
  const competition = event.competitions[0];
  const date = new Date(competition.date ?? "");
  if (!Number.isFinite(date.getTime()) || formatEasternDateKey(date) !== providerDate) {
    refuse(game, "provider date differs");
  }
  if (competition.status?.type?.completed !== true || competition.status.type.state !== "post") {
    refuse(game, "provider game is not final");
  }
  const { competitors, home, away } = sides(event);
  if (competitors.length !== 2 || home.length !== 1 || away.length !== 1 ||
      toOurAbbr(home[0].team?.abbreviation ?? "") !== game.home ||
      toOurAbbr(away[0].team?.abbreviation ?? "") !== game.away) {
    refuse(game, "provider team pairing differs");
  }
  for (const [side, expected] of [[home[0], game.homeScore], [away[0], game.awayScore]] as const) {
    if (side.score == null || String(side.score).trim() === "" || Number(side.score) !== expected) {
      refuse(game, "provider final score differs");
    }
  }
  const correction = DATE_CORRECTIONS[game.externalId];
  if (correction && eventId !== correction.eventId) refuse(game, "approved ESPN event ID differs");
}

export function matchRefereeEvent(game: RefereeInputGame, scoreboard: unknown): string {
  refereeProviderDate(game);
  const events = (scoreboard as { events?: EventIdentity[] } | null)?.events;
  if (!Array.isArray(events)) refuse(game, "missing scoreboard events");
  const matching = events.filter(event => {
    const { home, away } = sides(event);
    return home.length === 1 && away.length === 1 &&
      toOurAbbr(home[0].team?.abbreviation ?? "") === game.home &&
      toOurAbbr(away[0].team?.abbreviation ?? "") === game.away;
  });
  if (matching.length !== 1) refuse(game, `expected one event, found ${matching.length}`);
  const eventId = matching[0].id ?? "";
  validateIdentity(game, matching[0], eventId);
  return eventId;
}

export function validateRefereeSummary(game: RefereeInputGame, eventId: string, summary: unknown): void {
  const header = (summary as { header?: EventIdentity } | null)?.header;
  if (!header) refuse(game, "missing summary header");
  validateIdentity(game, header, eventId);
}
