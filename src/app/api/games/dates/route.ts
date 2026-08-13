import { z } from "zod";
import { CACHE, jsonRoute, seasonParam } from "@/lib/api-route";
import { getRegularSeasonGameDatesWithCounts } from "@/lib/db/queries";

/**
 * The date index behind the Games board's calendar, cached since 2026-08-14.
 *
 * It was the one read route left with no policy that carries no live score. The 2026-08-07 pass
 * exempted the live routes on purpose — an edge-cached score would fight the Realtime
 * subscription in `useLiveGames.ts` that corrects it — but this route answers only *which dates
 * have games and how many*, which no subscription touches and which a pipeline run is the only
 * thing that can move. It was exempted for a reason that never applied to it.
 *
 * `useGameSlate` fetches it once per season on mount, so every arrival at `/games` — the product
 * front door — paid a database round trip for an answer that changes at most once a day.
 *
 * `inSeason` rather than `historical` because the route accepts any season, including the one in
 * progress, where a postponement can genuinely move the list. Five minutes of staleness on a
 * calendar is invisible; an hour of it, on the day a game moves, would not be.
 */
export const GET = jsonRoute(
  "api/games/dates",
  z.object({
    season: seasonParam,
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
  ({ season, month }) => getRegularSeasonGameDatesWithCounts(season, month),
  CACHE.inSeason
);
