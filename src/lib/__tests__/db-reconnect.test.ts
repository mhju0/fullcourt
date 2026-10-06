import { describe, expect, it } from "vitest";
import { DB_RECONNECT_MAX_SECONDS, dbReconnectDelaySeconds } from "@/lib/db/reconnect";

describe("database reconnect wait", () => {
  it("grows with each failed attempt", () => {
    expect(dbReconnectDelaySeconds(0)).toBeCloseTo(0.01, 5);
    expect(dbReconnectDelaySeconds(3)).toBeCloseTo(0.27, 5);
  });

  it("never exceeds the cap, however long the database has been down", () => {
    for (const retries of [5, 6, 10, 50, 1000]) {
      expect(dbReconnectDelaySeconds(retries)).toBe(DB_RECONNECT_MAX_SECONDS);
    }
    expect(DB_RECONNECT_MAX_SECONDS).toBe(2);
  });
});
