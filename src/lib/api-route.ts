/**
 * The request envelope every read route shares.
 *
 * Before this module each route re-made the same five decisions — normalize the
 * search params, validate, shape a 400, shape a 500, log — and they drifted:
 * six independent copies of the season validator, six different fallback
 * messages for one failure, two ways of reading the URL, and a `data` field
 * typed non-null but filled with `null as unknown as T` on every error path.
 *
 * A route now supplies a Zod schema, the operation, and optionally how long a CDN
 * may hold the answer. Everything a caller of the HTTP surface must know — how
 * params are read, when it is a 400, what `data` is on failure — lives here.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage, PublicApiError } from "@/lib/api-errors";
import { NBA_SEASONS } from "@/lib/nba-season";
import type { ApiResponse } from "@/types";

/** The one season rule. Routes that need a different list say so explicitly. */
export const seasonParam = z.string().refine((s) => NBA_SEASONS.includes(s), {
  message: "Invalid season",
});

/** Minimum absolute rest advantage; absent means "no floor". */
export const minRAParam = z.coerce.number().finite().min(0).default(0);

/**
 * What a CDN may do with a **successful** response.
 *
 * `s-maxage` is how long the edge serves it without asking again. `stale-while-revalidate` is
 * how long it may keep serving that stale copy while refreshing in the background, and it is
 * the half that matters here: it takes the function off the reader's critical path, so a cold
 * start costs a background refresh instead of a spinner.
 *
 * These routes were uncacheable until 2026-08-07 — `force-dynamic` leaves
 * `max-age=0, must-revalidate`, so every visit executed a function that crossed the Pacific to
 * reach the database. Combined with traffic too low to keep a lambda warm, 7.8% of invocations
 * hit the execution-time limit. See `docs/TESTING_AND_CICD.md`.
 *
 * A policy is opt-in per route, because the right staleness is a claim about what the data is,
 * not a default. Live-score routes deliberately have none: they are read through Supabase
 * Realtime, and an edge-cached score would fight the subscription that corrects it.
 */
export const CACHE = {
  /** Finished tables that only a pipeline run can move — the backtest, a settled season's grid. */
  historical: "public, s-maxage=3600, stale-while-revalidate=86400",
  /** Includes the season in progress, where an hour of drift would be visible. */
  inSeason: "public, s-maxage=300, stale-while-revalidate=3600",
} as const;

export type CachePolicy = (typeof CACHE)[keyof typeof CACHE];

/** Next passes dynamic segments here; a route with no segments gets nothing. */
type SegmentContext<P> = { params: Promise<P> };

/**
 * Search params and dynamic segments merged into one record, with empty strings
 * dropped so `?month=` reads as absent rather than as an invalid value.
 */
async function readInput(
  req: NextRequest,
  ctx: SegmentContext<Record<string, string>> | undefined
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const [key, value] of req.nextUrl.searchParams) {
    if (value !== "") input[key] = value;
  }
  return ctx ? { ...input, ...(await ctx.params) } : input;
}

/**
 * Builds a `GET` handler: parse → operate → envelope.
 *
 * Throw {@link PublicApiError} from `operation` to return an authored message
 * with a chosen status (this is how 404 is expressed); every other throw is
 * logged and collapsed to a generic 500 by `getPublicApiErrorMessage`.
 *
 * `cache` is applied to the success path only. A cached 500 would outlive the outage that
 * produced it — for `stale-while-revalidate` measured in hours, long after the database came
 * back — so every failure path stays uncacheable no matter what the route asked for.
 */
export function jsonRoute<Schema extends z.ZodType, Data>(
  name: string,
  schema: Schema,
  operation: (input: z.output<Schema>) => Promise<Data>,
  cache?: CachePolicy
) {
  return async function GET(
    req: NextRequest,
    ctx?: SegmentContext<Record<string, string>>
  ): Promise<NextResponse<ApiResponse<Data>>> {
    const parsed = schema.safeParse(await readInput(req, ctx));

    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    try {
      return NextResponse.json(
        { data: await operation(parsed.data), error: null },
        cache ? { headers: { "Cache-Control": cache } } : undefined
      );
    } catch (err) {
      if (err instanceof PublicApiError) {
        return NextResponse.json({ data: null, error: err.message }, { status: err.status });
      }
      console.error(`[${name}]`, err);
      return NextResponse.json(
        { data: null, error: getPublicApiErrorMessage(err) },
        { status: 500 }
      );
    }
  };
}
