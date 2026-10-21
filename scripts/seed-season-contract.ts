import { parseScoreboard } from "@/lib/espn-scoreboard";

export interface HooprSeedGame {
  gameId: string;
  gameType: string;
  home: string;
  away: string;
  homePts: number;
  awayPts: number;
}

export interface HistoricalSeedResult {
  eventId: string;
  date: string;
  home: string;
  away: string;
  homePts: number;
  awayPts: number;
}

function refusal(reason: string): never {
  throw new Error(`REFUSING TO WRITE — ${reason}. Use a reviewed correction or re-key operation.`);
}

export function seedMatchKey(game: { away: string; awayPts: number; home: string; homePts: number }): string {
  if (!game.home || !game.away || game.home === game.away ||
      !Number.isSafeInteger(game.homePts) || game.homePts < 0 ||
      !Number.isSafeInteger(game.awayPts) || game.awayPts < 0 || game.homePts === game.awayPts) refusal("invalid teams or final scores");
  return `${game.away}|${game.awayPts}|${game.home}|${game.homePts}`;
}

export function assertUniqueHooprMatches(games: readonly HooprSeedGame[]): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  if (!games.length) refusal("no hoopR games");
  for (const game of games) {
    const key = seedMatchKey(game);
    if (ids.has(game.gameId) || keys.has(key)) refusal(`ambiguous hoopR fixture/result ${key}`);
    ids.add(game.gameId);
    keys.add(key);
  }
}

export function validateSeedScoreboard(payload: unknown): asserts payload is { events: unknown[] } {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { events?: unknown }).events)) {
    refusal("invalid ESPN scoreboard: events must be an array");
  }
}

export function historicalScoreboardResults(payload: unknown, seasonEndYear: number): HistoricalSeedResult[] {
  validateSeedScoreboard(payload);
  const results: HistoricalSeedResult[] = [];
  for (const item of payload.events) {
    if (!item || typeof item !== "object") refusal("invalid ESPN event");
    const event = item as { season?: { year?: unknown }; competitions?: Array<{ date?: unknown }>; date?: unknown };
    if (!Number.isSafeInteger(Number(event.season?.year))) refusal("missing ESPN season identity");
    if (Number(event.season?.year) !== seasonEndYear) continue;
    const parsed = parseScoreboard({ events: [item] });
    if (parsed.length !== 1) refusal("invalid ESPN fixture identity");
    const game = parsed[0];
    if (game.status === "unknown") refusal(`unknown ESPN status for ${game.eventId}`);
    if (game.status !== "final") continue;
    if (!game.eventId || !game.date || game.homeScore === null || game.awayScore === null) {
      refusal("missing ESPN final identity, date or score");
    }
    const result = { eventId: game.eventId, date: game.date, home: game.homeAbbr, away: game.awayAbbr,
      homePts: game.homeScore, awayPts: game.awayScore };
    seedMatchKey(result);
    results.push(result);
  }
  return results;
}

export class HistoricalSeedIndex {
  private byKey = new Map<string, HistoricalSeedResult>();
  private byId = new Map<string, HistoricalSeedResult>();

  add(game: HistoricalSeedResult): void {
    const key = seedMatchKey(game);
    const sameId = this.byId.get(game.eventId);
    const sameKey = this.byKey.get(key);
    if ((sameId && JSON.stringify(sameId) !== JSON.stringify(game)) ||
        (sameKey && (sameKey.eventId !== game.eventId || sameKey.date !== game.date))) {
      refusal(`ambiguous ESPN fixture/result ${key}`);
    }
    this.byId.set(game.eventId, game);
    this.byKey.set(key, game);
  }

  get(game: HooprSeedGame): HistoricalSeedResult | undefined {
    return this.byKey.get(seedMatchKey(game));
  }

  get size(): number { return this.byKey.size; }
}

export interface HistoricalSeedRow {
  externalId: string;
  date: string;
  season: string;
  gameType: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  overtimePeriods: number;
  neutralSite: boolean;
  neutralVenueCity: string | null;
  tipOffUtc: string | null;
}

export interface ExistingSeedRow {
  externalId: string;
  date: string;
  season: string;
  gameType: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export function planHistoricalSeed(incoming: readonly HistoricalSeedRow[], existing: readonly ExistingSeedRow[]): HistoricalSeedRow[] {
  if (!incoming.length) refusal("no seed fixtures");
  const byId = new Map(existing.map(game => [game.externalId, game]));
  const fixture = (game: Pick<HistoricalSeedRow, "date" | "homeTeamId" | "awayTeamId">) => `${game.date}|${game.awayTeamId}|${game.homeTeamId}`;
  const fixtures = new Map<string, Set<string>>();
  for (const game of existing) {
    const key = fixture(game);
    if (!fixtures.has(key)) fixtures.set(key, new Set());
    fixtures.get(key)!.add(game.externalId);
  }
  const ids = new Set<string>();
  const targets = new Set<string>();
  const inserts: HistoricalSeedRow[] = [];
  for (const game of incoming) {
    const key = fixture(game);
    if (ids.has(game.externalId) || targets.has(key)) refusal(`duplicate seed identity ${game.externalId}`);
    ids.add(game.externalId);
    targets.add(key);
    const stored = byId.get(game.externalId);
    const collision = [...(fixtures.get(key) ?? [])].find(id => id !== game.externalId);
    if (collision) refusal(`fixture already stored as ${collision}`);
    if (!stored) { inserts.push(game); continue; }
    if (stored.date !== game.date || stored.season !== game.season || stored.gameType !== game.gameType ||
        stored.homeTeamId !== game.homeTeamId || stored.awayTeamId !== game.awayTeamId ||
        stored.status !== "final" || stored.homeScore !== game.homeScore || stored.awayScore !== game.awayScore) {
      refusal(`existing fixture/result differs for ${game.externalId}`);
    }
  }
  return inserts;
}

export function deduplicateSeedEvents<T extends { externalId: string }>(games: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const game of games) {
    const previous = byId.get(game.externalId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(game)) refusal(`conflicting ESPN event ${game.externalId}`);
    byId.set(game.externalId, game);
  }
  return [...byId.values()];
}
