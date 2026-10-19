import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, createDbPool, dbPoolConfig } from "@/lib/db/pool";
import type { Pool } from "pg";
import { EventEmitter } from "node:events";

const local = "postgresql://test@127.0.0.1:5432/test";
afterEach(() => vi.restoreAllMocks());

describe("database connection lifecycle", () => {
  it("bounds serverless pools and disables pipelining without requiring local TLS", () => {
    expect(dbPoolConfig(local, { VERCEL: "1" })).toMatchObject({
      max: 1, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 5_000, pipeline: false,
    });
    expect(dbPoolConfig(local, {})).toMatchObject({ max: 5 });
    expect(dbPoolConfig(local, {})).not.toHaveProperty("ssl");
    expect(dbPoolConfig(local, { DB_POOL_MAX: "2" }).max).toBe(2);
    for (const value of ["2x", "1.5", "0", "-1", "Infinity"]) {
      expect(dbPoolConfig(local, { VERCEL: "1", DB_POOL_MAX: value }).max).toBe(1);
    }
  });

  it("verifies TLS with the configured CA and rejects URL overrides", () => {
    const env = { DATABASE_SSL_CA: "public-ca-pem" };
    expect(dbPoolConfig(local, env).ssl).toEqual({ ca: "public-ca-pem", rejectUnauthorized: true });
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) {
      expect(() => dbPoolConfig(`${local}?${key}=anything`, env)).toThrow("without SSL query parameters");
    }
  });

  it("handles idle connection failures without an uncaught pool error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = createDbPool(dbPoolConfig(local, {}));
    pool.emit("error", new Error("sensitive connection detail"));
    expect(log).toHaveBeenCalledExactlyOnceWith("Database pool discarded an idle connection");
    await pool.end();
  });

  it("releases a checked-out client when BEGIN fails before Drizzle's guard", async () => {
    const release = vi.fn();
    const query = vi.fn().mockRejectedValue(new Error("BEGIN disconnected"));
    const client = Object.assign(new EventEmitter(), { query, release });
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const work = vi.fn();
    await expect(createDatabase(pool).transaction(work)).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    expect(client.listenerCount("error")).toBe(0);
  });
});
