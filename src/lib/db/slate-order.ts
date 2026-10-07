import { asc } from "drizzle-orm";
import { games } from "./schema";

/**
 * The order of one date's games: earliest tip-off first, and games that start at the same
 * minute in the source's own game-number order, which is how ESPN's scoreboard lists them
 * (D-79). Postgres sorts NULL last on an ascending key, so a game with no stored tip-off
 * (before about 2002) falls back to its game number.
 */
export const slateOrder = () => [asc(games.tipOffUtc), asc(games.externalId)];
