import type { Pool } from "pg";
import { createDatabase, createDbPool, dbPoolConfig } from "./pool";

export type DbInstance = ReturnType<typeof createDatabase>;

type DbGlobal = {
  sqlClient?: Pool;
  dbInstance?: DbInstance;
};

const dbGlobal = globalThis as typeof globalThis & {
  __nbaRestAdvantageDb?: DbGlobal;
};

function getDbGlobal(): DbGlobal {
  dbGlobal.__nbaRestAdvantageDb ??= {};
  return dbGlobal.__nbaRestAdvantageDb;
}

function getOrCreateDb(): DbInstance {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const state = getDbGlobal();
  if (!state.dbInstance) {
    state.sqlClient = createDbPool(dbPoolConfig(url));
    state.dbInstance = createDatabase(state.sqlClient);
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
