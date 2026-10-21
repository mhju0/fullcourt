import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertUniqueHooprMatches, deduplicateSeedEvents, historicalScoreboardResults, HistoricalSeedIndex, planHistoricalSeed, type HistoricalSeedRow } from "../../scripts/seed-season-contract";
import { scoreboard } from "../../scripts/seed_season_from_hoopr";
import { fetchScoreboard, parseUpcomingSeedEvent, validateUpcomingSeed } from "../../scripts/seed_upcoming_season_espn";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const row: HistoricalSeedRow = { externalId: "0020300652", date: "2004-01-28", season: "2003-04", gameType: "regular",
  homeTeamId: 1, awayTeamId: 2, homeScore: 94, awayScore: 99, overtimePeriods: 0, neutralSite: false, neutralVenueCity: null, tipOffUtc: null };
const result = { eventId: "240128010", date: row.date, home: "HOU", away: "SAC", homePts: 94, awayPts: 99 };
const hoopr = { ...result, gameId: row.externalId, gameType: "regular" };
const stored = { ...row, status: "final" };
const event = { id: result.eventId, season: { year: 2004, type: 2 }, competitions: [{ date: "2004-01-29T01:00Z",
  status: { type: { state: "post", completed: true, name: "STATUS_FINAL" } }, competitors: [
    { homeAway: "home", team: { abbreviation: "HOU" }, score: "94" },
    { homeAway: "away", team: { abbreviation: "SAC" }, score: "99" },
  ] }] };

describe("historical season identity", () => {
  it("refuses the actual repeated SAC 99 at HOU 94 fixture before fetching dates", () => {
    expect(() => assertUniqueHooprMatches([hoopr, { ...hoopr, gameId: "0020301107" }])).toThrow("ambiguous hoopR");
    expect(() => assertUniqueHooprMatches([{ ...hoopr, homePts: Number.NaN }])).toThrow("invalid");
    expect(() => assertUniqueHooprMatches([{ ...hoopr, homePts: 99 }])).toThrow("invalid");
  });
  it("uses the ESPN instant's Eastern date and refuses malformed/final results", () => {
    expect(historicalScoreboardResults({ events: [event] }, 2004)).toEqual([result]);
    expect(historicalScoreboardResults({ events: [event] }, 2005)).toEqual([]);
    for (const payload of [{}, { events: [null] }, { events: [{ ...event, season: undefined }] },
      { events: [{ ...event, competitions: [{ ...event.competitions[0], date: "bad" }] }] }]) {
      expect(() => historicalScoreboardResults(payload, 2004)).toThrow("REFUSING");
    }
  });
  it("deduplicates exact repeated provider events while refusing distinct IDs or dates", () => {
    const index = new HistoricalSeedIndex();
    index.add(result); index.add({ ...result });
    expect(index.size).toBe(1);
    expect(index.get(hoopr)?.date).toBe(row.date);
    expect(() => index.add({ ...result, eventId: "240404010", date: "2004-04-04" })).toThrow("ambiguous ESPN");
    expect(() => index.add({ ...result, date: "2004-01-29" })).toThrow("ambiguous ESPN");
  });
  it("inserts missing fixtures, preserves identical finals and refuses all existing identity/result changes", () => {
    expect(planHistoricalSeed([row], [])).toEqual([row]);
    expect(planHistoricalSeed([row], [stored])).toEqual([]);
    for (const change of [{ date: "2004-04-04" }, { season: "2004-05" }, { gameType: "playoffs" },
      { homeTeamId: 3 }, { awayTeamId: 3 }, { status: "scheduled" }, { homeScore: null }, { awayScore: 98 }, { externalId: "espn-240128010" }]) {
      expect(() => planHistoricalSeed([row], [{ ...stored, ...change }])).toThrow("REFUSING");
    }
    expect(() => planHistoricalSeed([row, row], [])).toThrow("duplicate");
    const duplicate = { ...stored, externalId: "espn-240128010" };
    for (const existing of [[stored, duplicate], [duplicate, stored]]) {
      expect(() => planHistoricalSeed([row], existing)).toThrow("already stored");
    }
  });
});

describe("upcoming schedule completeness", () => {
  it("accepts both supported full schedule sizes and excludes a neutral Cup championship from team totals", () => {
    for (const count of [80, 82]) {
      const games = Array.from({ length: count }, (_, day) => Array.from({ length: 15 }, (_, pair) => ({
        externalId: `espn-${day}-${pair}`, status: "scheduled" as const, date: `day-${day}`,
        home: `T${pair * 2}`, away: `T${pair * 2 + 1}`, tipOffUtc: "2026-10-21T00:00:00Z",
        neutralSite: false, neutralVenueCity: null, gameType: "regular",
      }))).flat();
      expect(validateUpcomingSeed([...games, { ...games[0], externalId: "espn-cup", date: "cup-day", gameType: "cup_final", neutralSite: true }])).toEqual([]);
    }
  });
  it("does not accept a balanced 15-game schedule as a full modern season", () => {
    const games = Array.from({ length: 15 }, (_, i) => ({ externalId: `espn-${i}`, status: "scheduled" as const,
      date: "2026-10-20", home: `T${i * 2}`, away: `T${i * 2 + 1}`, tipOffUtc: "2026-10-21T00:00:00Z",
      neutralSite: false, neutralVenueCity: null, gameType: "regular" }));
    expect(validateUpcomingSeed(games)).toContain("expected 80 or 82 regular-season games per team, saw 1");
  });
  it("deduplicates identical repeats and refuses conflicting event payloads", () => {
    const game = { externalId: "espn-1", date: "2026-10-20", status: "scheduled" };
    expect(deduplicateSeedEvents([game, { ...game }])).toEqual([game]);
    for (const change of [{ date: "2026-10-21" }, { status: "postponed" }]) {
      expect(() => deduplicateSeedEvents([game, { ...game, ...change }])).toThrow("conflicting ESPN");
    }
    const final = parseUpcomingSeedEvent(event, 2004)!;
    const scheduled = parseUpcomingSeedEvent({ ...event, competitions: [{ ...event.competitions[0],
      status: { type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" } } }] }, 2004)!;
    expect(final.status).toBe(scheduled.status);
    expect(() => deduplicateSeedEvents([final, scheduled])).toThrow("conflicting ESPN");
  });
  it("refuses malformed relevant fixtures instead of dropping them from a season", () => {
    for (const competitions of [[], [{ ...event.competitions[0], date: "bad" }],
      [{ ...event.competitions[0], status: { type: { state: "post", completed: false, name: "unexpected" } } }]]) {
      expect(() => parseUpcomingSeedEvent({ ...event, competitions }, 2004)).toThrow("Malformed ESPN");
    }
  });
});

it("both real seed fetchers create a missing cache tree and reuse validated cached responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "fullcourt-seed-cache-")); roots.push(root);
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ events: [] })));
  vi.stubGlobal("fetch", fetch);
  for (const [name, read] of [["historical", (dir: string) => scoreboard("2004-01-28", dir)],
    ["upcoming", (dir: string) => fetchScoreboard("2004-01-28", false, dir)]] as const) {
    const dir = join(root, name, "nested");
    expect(await read(dir)).toEqual({ events: [] });
    expect(JSON.parse(await readFile(join(dir, "sb-20040128.json"), "utf8"))).toEqual({ events: [] });
    expect(await read(dir)).toEqual({ events: [] });
    await writeFile(join(dir, "sb-20040128.json"), "{}");
    await expect(read(dir)).rejects.toThrow("invalid ESPN scoreboard");
  }
  expect(fetch).toHaveBeenCalledTimes(2);
});
