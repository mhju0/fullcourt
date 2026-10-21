import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hosted production has one database connection (`pool.ts`), and pg-pool applies its 5s
 * connect timeout to requests queued behind a busy client. Two reads in `Promise.all` gain no
 * parallelism there, only the chance that the queued one times out behind a slow first read.
 */
const root = process.cwd();

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => keep(name) && !name.includes("__tests__"))
    .map((name) => join(dir, name));
}

const serverReaders = [
  ...files("src/lib/db", (name) => name.endsWith(".ts")),
  ...files("src/lib", (name) => /^[^/]+-server\.ts$/.test(name)),
  ...files("src/app/api", (name) => name.endsWith("route.ts")),
];

describe("server database reads", () => {
  it("covers the server readers", () => {
    expect(serverReaders).toContain(join("src/lib/db", "queries.ts"));
    expect(serverReaders).toContain(join("src/lib", "season-readiness-server.ts"));
    expect(serverReaders).toContain(join("src/app/api", "shot-quality/route.ts"));
  });

  it("never run in Promise.all", () => {
    const offenders = serverReaders.filter((file) =>
      /Promise\.all\(/.test(readFileSync(join(root, file), "utf8"))
    );
    expect(offenders.map((file) => relative(root, join(root, file)))).toEqual([]);
  });
});
