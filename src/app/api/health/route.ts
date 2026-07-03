import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Drizzle + `postgres` need the Node.js runtime (not Edge). */
export const runtime = "nodejs";

/** Never prerender — this must hit the live DB at request time. */
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Public, unauthenticated liveness probe for uptime checkers. Runs the cheapest
 * possible query (`select 1`) against the live DB and reports up/down via the
 * HTTP status code (200 / 503) so monitors can read status without parsing JSON.
 *
 * This route intentionally does NOT use the app's `{ data, error }` envelope:
 * its contract is a dedicated health shape plus an honest status code. The raw
 * DB error is logged server-side only and never included in the response body
 * (consistent with the `api-errors` no-leak contract).
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", db: "up", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/health]", err);
    return NextResponse.json(
      { status: "error", db: "down", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
