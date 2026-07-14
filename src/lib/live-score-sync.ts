export type StoredLiveGame = {
  id: number;
  externalId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type NbaScoreboardGame = {
  gameId: string;
  /** 1 = scheduled, 2 = live, 3 = final. */
  gameStatus: number;
  homeTeam: { score: number };
  awayTeam: { score: number };
};

export type NbaScoreboard = {
  scoreboard: {
    games: NbaScoreboardGame[];
  };
};

export type LiveScoreUpdate = {
  gameId: number;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

/** Compares the live feed with stored state and returns only meaningful writes. */
export function reconcileLiveScores(
  storedGames: readonly StoredLiveGame[],
  nbaGames: readonly NbaScoreboardGame[]
): LiveScoreUpdate[] {
  const nbaGamesById = new Map(
    nbaGames.map((game) => [normalizeStatsGameId(game.gameId), game])
  );
  const updates: LiveScoreUpdate[] = [];

  for (const storedGame of storedGames) {
    const nbaGame = nbaGamesById.get(
      normalizeStatsGameId(storedGame.externalId)
    );
    if (!nbaGame) continue;

    const update: LiveScoreUpdate = {
      gameId: storedGame.id,
      status: mapGameStatus(nbaGame.gameStatus),
      homeScore: normalizeScore(nbaGame.homeTeam.score),
      awayScore: normalizeScore(nbaGame.awayTeam.score),
    };

    if (
      update.status !== storedGame.status ||
      update.homeScore !== storedGame.homeScore ||
      update.awayScore !== storedGame.awayScore
    ) {
      updates.push(update);
    }
  }

  return updates;
}

/** Aligns a scoreboard id with the zero-padded 10-digit stats id stored in the DB. */
function normalizeStatsGameId(id: string): string {
  const normalized = String(id).trim();
  if (/^\d+$/.test(normalized) && normalized.length < 10) {
    return normalized.padStart(10, "0");
  }
  return normalized;
}

function mapGameStatus(nbaStatus: number): string {
  switch (nbaStatus) {
    case 2:
      return "live";
    case 3:
      return "final";
    default:
      return "scheduled";
  }
}

function normalizeScore(score: number): number | null {
  return score > 0 ? score : null;
}
