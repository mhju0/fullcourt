import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { slateOrder } from "@/lib/db/slate-order";

/**
 * A day's games used to come back in away-team-id order, which put a 7:30 tip above the 7:00
 * ones (owner phone review, 2026-10-07). The order is asserted on the generated SQL, since
 * the rows a database happens to return prove nothing about the clause.
 */
describe("slate order", () => {
  it("sorts by tip-off, then by the source game number", () => {
    const { sql: text } = new PgDialect().sqlToQuery(sql.join(slateOrder(), sql`, `));
    expect(text).toBe('"games"."tip_off_utc" asc, "games"."external_id" asc');
  });

  it("is the order the slate query uses", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "db", "queries.ts"), "utf8");
    expect(source).toContain(".orderBy(...slateOrder())");
    expect(source).not.toContain(".orderBy(asc(games.awayTeamId))");
  });
});
