import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;
type SqlClient = ReturnType<typeof postgres>;

type DbGlobal = {
  sqlClient?: SqlClient;
  dbInstance?: DbInstance;
};

const dbGlobal = globalThis as typeof globalThis & {
  __nbaRestAdvantageDb?: DbGlobal;
};

function getDbGlobal(): DbGlobal {
  dbGlobal.__nbaRestAdvantageDb ??= {};
  return dbGlobal.__nbaRestAdvantageDb;
}

function dbPoolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return process.env.VERCEL ? 1 : 5;
}

function getOrCreateDb(): DbInstance {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const state = getDbGlobal();
  if (!state.dbInstance) {
    state.sqlClient = postgres(url, {
      prepare: false,
      max: dbPoolMax(),
      idle_timeout: 20,
      // Fast-fail: on Vercel the pool is a single slot (max=1), so a dead DB
      // would otherwise hold that slot for the full timeout and serialize every
      // request behind it. 5s leaves headroom for pooler cold-starts while
      // halving how long a down DB is waited on.
      connect_timeout: 5,
    });
    state.dbInstance = drizzle(state.sqlClient, { schema });
  }
  return state.dbInstance;
}

/**
 * Drizzle database client. Connection is created lazily on first use so that
 * importing this module during `next build` does not require `DATABASE_URL`.
 */
export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getOrCreateDb() as object, prop, receiver);
  },
});
