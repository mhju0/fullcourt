export const DB_RECONNECT_MAX_SECONDS = 2;

/**
 * Seconds the driver waits before reconnect attempt `retries`. The driver's own curve climbs to
 * 20s, so with the database down each request waited that long before its error reached the
 * reader. Measured 2026-10-05: 6–18s per request from the seventh failure on.
 */
export function dbReconnectDelaySeconds(retries: number): number {
  return Math.min(3 ** retries / 100, DB_RECONNECT_MAX_SECONDS);
}
