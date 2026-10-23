import { z } from "zod";
import { formatEasternDateKey } from "./nba-season";
import { S, type PlayerRestPayload } from "./player-rest";

/** Current ESPN identities remain separate from historical NBA identities. */
const instant = z.string().datetime({ offset: true });
const fixtureId = /^(?:espn-\d{9,12}|00[2456]\d{7}|bref-\d{9}[A-Z]{3})$/;

export function parseCurrentShooting(value: unknown, now = Date.now()): PlayerRestPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<PlayerRestPayload> & { version?: unknown };
  if (payload.version !== "current-shooting-1" || typeof payload.generated !== "string" ||
    !instant.safeParse(payload.generated).success || Date.parse(payload.generated) > now + 300_000 || !Array.isArray(payload.names) || payload.names.length === 0 ||
    !payload.names.every(n => typeof n === "string" && n.length > 0) ||
    !Array.isArray(payload.playerIds) || payload.playerIds.length !== payload.names.length ||
    !payload.playerIds.every(id => typeof id === "string" && /^espn:\d+$/.test(id)) ||
    new Set(payload.playerIds).size !== payload.playerIds.length ||
    !Array.isArray(payload.teams) || !payload.teams.every(t => typeof t === "string" && /^[A-Z]{3}(\/[A-Z]{3})?\+?$/.test(t)) ||
    !Array.isArray(payload.pos) || payload.pos.length !== payload.names.length ||
    !payload.pos.every(p => ["", "G", "F", "C"].includes(p)) ||
    !Array.isArray(payload.seasons) || !Array.isArray(payload.shrunk) || payload.shrunk.length !== 0) return null;
  const publication = payload.publication;
  if (!publication || !/^\d{4}-\d{2}$/.test(publication.season ?? "") ||
    publication.season !== `${Number(publication.season!.slice(0, 4))}-${String(Number(publication.season!.slice(0, 4)) + 1).slice(-2)}` ||
    !Number.isSafeInteger(publication.expectedGames) || publication.expectedGames < 0 ||
    publication.observedGames !== publication.expectedGames || !Array.isArray(publication.missingGameIds) ||
    publication.missingGameIds.length !== 0 || (publication.through !== null && !/^\d{4}-\d{2}-\d{2}$/.test(publication.through))) return null;
  if (publication.source !== "ESPN event summaries" ||
    !instant.safeParse(publication.generatedAt).success || publication.generatedAt !== payload.generated ||
    typeof publication.fixtureIdentitySha256 !== "string" || !/^[a-f0-9]{64}$/.test(publication.fixtureIdentitySha256) ||
    !Number.isSafeInteger(publication.historyGames) || publication.historyGames! < publication.observedGames ||
    !Array.isArray(publication.fixtureIds) || publication.fixtureIds.length !== publication.historyGames ||
    !publication.fixtureIds.every(id => typeof id === "string" && fixtureId.test(id)) ||
    new Set(publication.fixtureIds).size !== publication.fixtureIds.length) return null;
  const year = Number(publication.season!.slice(0, 4));
  if (publication.expectedGames === 0 || publication.through === null ||
    !Number.isFinite(Date.parse(`${publication.through}T00:00:00Z`)) ||
    new Date(`${publication.through}T00:00:00Z`).toISOString().slice(0, 10) !== publication.through ||
    publication.through < `${year}-07-01` || publication.through >= `${year + 1}-07-01` ||
    publication.through > formatEasternDateKey(new Date(payload.generated))) return null;
  const players = new Set<number>();
  for (const row of payload.seasons) {
    if (!Array.isArray(row) || row.length !== 17 || !row.every(Number.isFinite) ||
      !Number.isInteger(row[S.PLAYER]) || row[S.PLAYER] < 0 || row[S.PLAYER] >= payload.names.length ||
      players.has(row[S.PLAYER]) || row[S.YEAR] !== year || !Number.isInteger(row[S.TEAM]) ||
      row[S.TEAM] < 0 || row[S.TEAM] >= payload.teams.length ||
      !Number.isSafeInteger(row[S.GAMES]) || row[S.GAMES] < 1 || row[S.GAMES] > publication.observedGames) return null;
    players.add(row[S.PLAYER]);
    for (const [attempt, rate, numerator, second] of [[5, 6, 11, 14], [7, 8, 12, 15], [9, 10, 13, 16]]) {
      const n = row[attempt], total = row[numerator], square = row[second];
      const threes = (square - 2 * total) / 3, makes = (total - threes) / 2;
      if (![n, total, square, threes, makes].every(Number.isSafeInteger) ||
        n < 0 || threes < 0 || makes < threes || makes > n ||
        Math.abs(row[rate] - (n ? 50 * total / n : 0)) > 0.000001) return null;
    }
    if (row[5] === 0 || row[7] + row[9] > row[5] || row[12] + row[13] > row[11] || row[15] + row[16] > row[14]) return null;
  }
  if (players.size !== payload.names.length || (publication.observedGames === 0 && payload.seasons.length > 0)) return null;
  return payload as PlayerRestPayload;
}


/** Reject rollback or partial replacement of already bundled observations. */
export function selectCurrentShooting(remote: unknown, bundled: unknown, currentSeason: string, now = Date.now()): { current: PlayerRestPayload | null; rejected: boolean } {
  const parsedBundle = parseCurrentShooting(bundled, now);
  const baseline = parsedBundle?.publication?.season === currentSeason ? parsedBundle : null;
  if (remote === null || remote === undefined) return { current: baseline, rejected: false };
  const candidate = parseCurrentShooting(remote, now);
  if (!candidate || candidate.publication!.season !== currentSeason) return { current: baseline, rejected: true };
  if (baseline) {
    const floor = baseline.publication!, next = candidate.publication!;
    const fixtures = new Set(next.fixtureIds), players = new Set(candidate.playerIds);
    if (next.through! < floor.through! || Date.parse(candidate.generated) < Date.parse(baseline.generated) ||
      next.observedGames < floor.observedGames || floor.fixtureIds!.some(id => !fixtures.has(id)) ||
      baseline.playerIds!.some(id => !players.has(id))) return { current: baseline, rejected: true };
  }
  return { current: candidate, rejected: false };
}

export function mergeHistoricalAndCurrent(historical: PlayerRestPayload, current: PlayerRestPayload): PlayerRestPayload {
  const offset = historical.names.length, teamOffset = historical.teams.length;
  const currentYear = Number(current.publication!.season!.slice(0, 4));
  // Never replace a published historical season through a provider overlay.
  if (historical.seasons.some(row => row[S.YEAR] >= currentYear)) return historical;
  return {
    ...historical,
    generated: current.generated,
    publication: current.publication,
    names: [...historical.names, ...current.names],
    playerIds: historical.playerIds && current.playerIds ? [...historical.playerIds, ...current.playerIds] : undefined,
    teams: [...historical.teams, ...current.teams],
    pos: [...(historical.pos ?? historical.names.map(() => "")), ...(current.pos ?? [])],
    seasons: [...historical.seasons, ...current.seasons.map(row => row.map((v, i) => i === S.PLAYER ? v + offset : i === S.TEAM ? v + teamOffset : v))],
    seasonOnlyPlayers: current.names.map((_, i) => i + offset),
    shrunk: historical.shrunk,
  };
}
