/**
 * Client-safe error messaging for API routes.
 *
 * Security contract: the `error` field returned to the browser must NEVER carry
 * raw infrastructure detail — SQL text, table/column names, bind params,
 * connection strings, driver/stack internals. A leaked Drizzle "Failed query: …"
 * string discloses the whole schema, so the DEFAULT here is to hide.
 *
 * Only messages that were *authored as user-facing* — by throwing a
 * {@link PublicApiError} — are allowed through. Everything else (any Drizzle /
 * postgres / connection / unexpected error) collapses to a generic message.
 * There is intentionally no substring matching on the raw message: a heuristic
 * like `includes("not found")` would leak infra strings such as the pooler's
 * `tenant/user not found`.
 *
 * Note: the intentional 400/404 messages in the route handlers (Zod validation,
 * "Game not found") are returned as explicit string literals *directly* and
 * never pass through this function.
 */

const GENERIC_MESSAGE = "Something went wrong. Please try again later.";

/**
 * An error whose `message` is explicitly safe to surface to API clients.
 *
 * This is the ONLY mechanism by which a thrown error's message reaches the
 * browser in production. Construct it with a message you have deliberately
 * written for end users — never by wrapping a raw DB/driver error's message.
 *
 * @example
 *   throw new PublicApiError("Game not found", 404);
 */
export class PublicApiError extends Error {
  /** Suggested HTTP status for handlers that choose to honor it. */
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
  }
}

/**
 * Maps an unknown caught error to a client-safe message.
 *
 * - {@link PublicApiError} → its message passes through (safe by construction).
 * - Any other error in production → the generic message.
 * - Any other `Error` outside production → its raw `message`, to aid local
 *   debugging. This is a convenience only; every route also logs the full error
 *   server-side via `console.error`, so no diagnostic detail is lost when hidden.
 */
export function getPublicApiErrorMessage(err: unknown): string {
  if (err instanceof PublicApiError) {
    return err.message;
  }

  if (process.env.NODE_ENV !== "production" && err instanceof Error) {
    return err.message;
  }

  return GENERIC_MESSAGE;
}
