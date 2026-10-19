import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestPublishedShotQualitySeason } from "@/lib/db/queries";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { execute } }));
const dialect = new PgDialect();

beforeEach(() => { execute.mockReset(); });
describe("shot-value publication discovery", () => {
  it("bounds the same usable-publication population strictly before the supplied season", async () => {
    execute.mockResolvedValue([{ latest: "2024-25" }]);
    expect(await getLatestPublishedShotQualitySeason("2026-27")).toBe("2024-25");
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("max(g.season)");
    expect(query.sql).toContain("g.season < $1");
    expect(query.params[0]).toBe("2026-27");
    expect(query.sql.match(/AND EXISTS/g)).toHaveLength(2);
  });

  it("leaves bare latest discovery unbounded and reports empty prior coverage as null", async () => {
    execute.mockResolvedValue([{ latest: null }]);
    expect(await getLatestPublishedShotQualitySeason()).toBeNull();
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).not.toContain("g.season <");
  });
});
