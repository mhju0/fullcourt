import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export function dbPoolConfig(url: string, env: Record<string, string | undefined> = process.env): PoolConfig {
  const requested = Number(env.DB_POOL_MAX);
  const ca = env.DATABASE_SSL_CA;
  if (ca && Array.from(new URL(url).searchParams.keys()).some(key => key.startsWith("ssl") || key === "uselibpqcompat")) {
    throw new Error("DATABASE_SSL_CA requires DATABASE_URL without SSL query parameters");
  }
  return {
    connectionString: url,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    max: Number.isSafeInteger(requested) && requested > 0 ? requested : env.VERCEL ? 1 : 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    pipeline: false,
  };
}

export function createDbPool(config: PoolConfig): Pool {
  const pool = new Pool(config);
  // pg removes failed idle clients itself; an unhandled error would crash the worker.
  pool.on("error", () => console.error("Database pool discarded an idle connection"));
  return pool;
}

export function createDatabase(pool: Pool) {
  const instance = drizzle(pool, { schema });
  // Drizzle 0.45.4 starts BEGIN before its release guard. Own checkout through BEGIN failure.
  instance.transaction = async (work, config) => {
    const client = await pool.connect();
    let failed = false;
    const onError = () => { failed = true; };
    client.on("error", onError);
    try {
      return await drizzle(client, { schema }).transaction(work, config);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      client.release(failed);
      client.removeListener("error", onError);
    }
  };
  return instance;
}
