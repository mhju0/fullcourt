import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApiError, getPublicApiErrorMessage } from "@/lib/api-errors";

const GENERIC = "Something went wrong. Please try again later.";

// A representative raw Drizzle/postgres leak: full SQL + table/column names + params.
const RAW_DB_ERROR = new Error(
  'Failed query: select "games"."date" from "fatigue_scores" ' +
    'inner join "games" on "games"."id" = "fatigue_scores"."game_id" ' +
    'where "games"."game_type" = $1\nparams: regular'
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicApiErrorMessage — production (must never leak infra)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("hides a raw Drizzle 'Failed query' error behind the generic message", () => {
    const msg = getPublicApiErrorMessage(RAW_DB_ERROR);
    expect(msg).toBe(GENERIC);
    expect(msg).not.toContain("select");
    expect(msg).not.toContain("fatigue_scores");
    expect(msg).not.toContain("Failed query");
  });

  it("hides infra strings that happen to contain old-allowlist substrings", () => {
    // The pooler outage error literally contains "not found".
    expect(getPublicApiErrorMessage(new Error("tenant/user not found"))).toBe(GENERIC);
    expect(getPublicApiErrorMessage(new Error("invalid connection string"))).toBe(GENERIC);
    expect(getPublicApiErrorMessage(new Error("password authentication failed"))).toBe(GENERIC);
  });

  it("passes through an explicitly-authored PublicApiError message", () => {
    expect(getPublicApiErrorMessage(new PublicApiError("Game not found", 404))).toBe(
      "Game not found"
    );
  });

  it("returns the generic message for non-Error throwables", () => {
    expect(getPublicApiErrorMessage("boom")).toBe(GENERIC);
    expect(getPublicApiErrorMessage(undefined)).toBe(GENERIC);
    expect(getPublicApiErrorMessage({ message: "select * from secrets" })).toBe(GENERIC);
  });
});

describe("getPublicApiErrorMessage — development (may aid debugging)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("surfaces the raw Error message when NOT in production", () => {
    expect(getPublicApiErrorMessage(RAW_DB_ERROR)).toBe(RAW_DB_ERROR.message);
  });

  it("still passes PublicApiError through unchanged", () => {
    expect(getPublicApiErrorMessage(new PublicApiError("Bad season"))).toBe("Bad season");
  });
});
