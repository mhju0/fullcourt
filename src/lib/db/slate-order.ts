import { asc } from "drizzle-orm";
import { games } from "./schema";

/**
 * The order of one date's games: earliest tip-off first, and games that start at the same
 * minute in deterministic source game-number order (D-79). ESPN agreement was observed on
 * one date, not established as a provider contract. Postgres sorts NULL last, so no tip-off
 * (before about 2002) falls back to its game number.
 */
export const slateOrder = () => [asc(games.tipOffUtc), asc(games.externalId)];
