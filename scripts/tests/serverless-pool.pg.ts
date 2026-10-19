import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { createDatabase, createDbPool, dbPoolConfig } from "../../src/lib/db/pool";
import { withCronDbDeadline } from "../../src/lib/daily-refresh-port";
import { integrityTestUrl } from "./integrity-test-url";

const url = integrityTestUrl();
const pool = createDbPool(dbPoolConfig(url, { VERCEL: "1" }));
const observer = createDbPool(dbPoolConfig(url, {}));
const db = createDatabase(pool);
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };

async function main() {
  try {
    const results = await Promise.all(Array.from({ length: 30 }, (_, id) =>
      db.execute(sql`select ${id}::int as identity, pg_sleep(0.001)`)));
    assert.deepEqual(results.map(result => result.rows[0].identity), Array.from({ length: 30 }, (_, id) => id));
    assert.equal(pool.totalCount, 1);
    pass("thirty concurrent reads retain identity through one unpipelined connection");

    await db.transaction(async tx => {
      await tx.execute(sql`create temporary table pool_commit(value int) on commit drop`);
      await tx.execute(sql`insert into pool_commit values (7)`);
      assert.equal((await tx.execute(sql`select value from pool_commit`)).rows[0].value, 7);
    });
    assert.equal((await db.execute(sql`select to_regclass('pg_temp.pool_commit') as relation`)).rows[0].relation, null);
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`create temporary table pool_rollback(value int)`);
      await tx.execute(sql`insert into pool_rollback values (9)`);
      throw new Error("rollback probe");
    }), /rollback probe/);
    assert.equal((await db.execute(sql`select to_regclass('pg_temp.pool_rollback') as relation`)).rows[0].relation, null);
    pass("transactions commit and rollback temporary writes without persistent mutations");

    const baseline = (await db.execute(sql`select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock`)).rows[0];
    await assert.rejects(withCronDbDeadline(db, Date.now() + 60, tx => tx.execute(sql`select pg_sleep(0.2)`)));
    const restored = (await db.execute(sql`select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock`)).rows[0];
    assert.deepEqual(restored, baseline);
    await withCronDbDeadline(db, Date.now() + 1_000, async tx => {
      const settings = (await tx.execute(sql`select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock`)).rows[0];
      assert.notEqual(settings.statement, baseline.statement);
      assert.notEqual(settings.lock, baseline.lock);
    });
    assert.deepEqual((await db.execute(sql`select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock`)).rows[0], baseline);
    pass("transaction-local deadline settings apply and reset after timeout and commit");

    const timeoutPool = createDbPool({ ...dbPoolConfig(url, { VERCEL: "1" }), connectionTimeoutMillis: 1_000 });
    const held = await timeoutPool.connect();
    try {
      await assert.rejects(timeoutPool.query("select 1"), /timeout/);
    } finally { held.release(); }
    assert.equal((await timeoutPool.query("select 1 as recovered")).rows[0].recovered, 1);
    await timeoutPool.end();
    pass("queue acquisition timeout releases its waiter and the single-slot pool recovers");

    await assert.rejects(db.transaction(async tx => {
      const pid = (await tx.execute(sql`select pg_backend_pid() as pid`)).rows[0].pid;
      await observer.query("select pg_terminate_backend($1)", [pid]);
      await tx.execute(sql`select 1`);
    }));
    assert.equal((await db.execute(sql`select 1 as recovered`)).rows[0].recovered, 1);
    assert.equal(pool.waitingCount, 0);
    pass("interrupted transaction discards its connection and subsequent requests reconnect");

    const beginPool = createDbPool(dbPoolConfig(url, { VERCEL: "1" }));
    try {
      beginPool.once("connect", client => {
        client.query = new Proxy(client.query, {
          apply(target, receiver, args) {
            if (args[0]?.text === "begin") {
              args[0] = { ...args[0], text: "begin isolation level invalid" };
            }
            return Reflect.apply(target, receiver, args);
          },
        });
      });
      await assert.rejects(createDatabase(beginPool).transaction(async () => {
        assert.fail("a rejected BEGIN must not enter the transaction callback");
      }));
      assert.equal((await beginPool.query("select 1 as recovered")).rows[0].recovered, 1);
      assert.equal(beginPool.waitingCount, 0);
      pass("server-rejected BEGIN releases the checked-out client and the next request succeeds");
    } finally { await beginPool.end(); }
    console.log(`${passed} real PostgreSQL pool contracts passed`);
  } finally {
    await Promise.all([pool.end(), observer.end()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
