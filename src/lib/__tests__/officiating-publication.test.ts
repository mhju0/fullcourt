import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_PUBLICATION_BASE, type DailyManifest } from "@/lib/daily-publication";
import { parseOfficiatingSnapshot, mergeOfficiatingSeasons, type OfficiatingSnapshot } from "@/lib/officiating-publication";
import { loadOfficiatingPublication } from "@/lib/officiating-publication-server";
import { summarizeSeasons, type ReviewSeason } from "@/lib/officiating";

const bundled = vi.hoisted(() => ({ seasons: [] as ReviewSeason[] }));
vi.mock("@/data/officiating.json", () => ({ default: bundled }));
const NOW = "2026-10-23T12:00:00Z";
function snapshot(year = 2026, ids = [1], refreshedAt = NOW): OfficiatingSnapshot {
  const season = `${year}-${String(year + 1).slice(-2)}`;
  const games = ids.map((number) => {
    const id = `002${String(year).slice(-2)}${String(number).padStart(5, "0")}`;
    return { id, date: `${year}-10-${String(20 + number).padStart(2, "0")}`, home: "BOS", away: "NYK",
      homeName: "Boston Celtics", awayName: "New York Knicks", missed: 1, wrong: 1, ungraded: 0,
      categories: { Foul: 2 }, source: `https://official.nba.com/l2m/L2MReport.html?gameId=${id}`, sha256: String(number).repeat(64) };
  });
  return { schemaVersion: 1, generatedAt: refreshedAt,
    season: { season, refreshedAt, through: games.at(-1)!.date,
      indexSource: `https://official.nba.com/${season}-nba-officiating-last-two-minute-reports/`, indexSha256: "a".repeat(64),
      missed: games.length, wrong: games.length, categories: { Foul: games.length * 2 }, games },
    details: Object.fromEntries(games.map((game) => [`${game.id}-${game.sha256.slice(0, 16)}`, {
      id: game.id, sha256: game.sha256, crew: ["Official A", "Official B", "Official C"], source: game.source,
      events: ["INC", "IC"].map((grade, index) => ({ id: `${game.id}-${index}`, grade: grade as "INC" | "IC",
        period: "Q4", clock: "00:12", category: "Foul", verdict: "Fixture assessment", video: null })),
    }])) };
}
function fixturePublication(value: OfficiatingSnapshot) {
  const body = new TextEncoder().encode(JSON.stringify(value));
  const digest = createHash("sha256").update(body).digest("hex");
  const path = `blobs/officiating-${digest}.json`;
  const manifest: DailyManifest = { schemaVersion: 1, updatedAt: NOW,
    datasets: { officiating: { path, sha256: digest, bytes: body.length, generatedAt: value.generatedAt } },
    checks: { officiating: { checkedAt: NOW, status: "published" } } };
  return { body, digest, path, manifest };
}
function serve(value: OfficiatingSnapshot, retained: OfficiatingSnapshot[] = []) {
  const latest = fixturePublication(value);
  const blobs = [latest, ...retained.map(fixturePublication)];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `${DAILY_PUBLICATION_BASE}manifest.json`) return new Response(JSON.stringify(latest.manifest));
    const found = blobs.find((blob) => url === `${DAILY_PUBLICATION_BASE}${blob.path}`);
    return found ? new Response(found.body) : new Response("Missing", { status: 404 });
  }));
  return latest;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); bundled.seasons.splice(0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("officiating snapshot evidence", () => {
  it("links summary totals, reviewed games, source hash and identified errors to the same details", () => {
    const value = snapshot(2026, [1, 2]);
    const parsed = parseOfficiatingSnapshot(value)!;
    expect(parsed).not.toBeNull();
    expect(summarizeSeasons([parsed.season])).toMatchObject([{ missed: 2, wrong: 2, gameCount: 2, categories: { Foul: 4 } }]);
    for (const game of parsed.season.games) {
      const detail = parsed.details[`${game.id}-${game.sha256.slice(0, 16)}`];
      expect(detail).toMatchObject({ id: game.id, source: game.source, sha256: game.sha256 });
      expect(detail.events.filter((event) => event.grade === "INC")).toHaveLength(game.missed);
      expect(detail.events.filter((event) => event.grade === "IC")).toHaveLength(game.wrong);
    }
  });
  it.each(["summary", "game", "categories", "through", "detail-id", "detail-hash", "source", "duplicate-game", "duplicate-event", "missing-detail", "extra-detail"])("rejects inconsistent %s evidence", (fault) => {
    const value = snapshot();
    const game = value.season.games[0];
    const key = `${game.id}-${game.sha256.slice(0, 16)}`;
    const detail = value.details[key];
    if (fault === "summary") value.season.missed++;
    if (fault === "game") game.wrong++;
    if (fault === "categories") game.categories.Foul++;
    if (fault === "through") value.season.through = "2026-10-22";
    if (fault === "detail-id") detail.id = "0022600999";
    if (fault === "detail-hash") detail.sha256 = "b".repeat(64);
    if (fault === "source") detail.source = "https://example.com/report";
    if (fault === "duplicate-game") value.season.games.push(game);
    if (fault === "duplicate-event") detail.events[1].id = detail.events[0].id;
    if (fault === "missing-detail") delete value.details[key];
    if (fault === "extra-detail") value.details.extra = detail;
    expect(parseOfficiatingSnapshot(value)).toBeNull();
  });
  it("rejects mismatched season identity, same-team matchups and non-NBA sources", () => {
    const invalidSeason = snapshot();
    invalidSeason.season.season = "2026-28";
    expect(parseOfficiatingSnapshot(invalidSeason)).toBeNull();
    const sameTeam = snapshot();
    sameTeam.season.games[0].away = sameTeam.season.games[0].home;
    expect(parseOfficiatingSnapshot(sameTeam)).toBeNull();
    const badSource = snapshot();
    badSource.season.indexSource = "https://official.nba.com.evil.test/2026-27-nba-officiating-last-two-minute-reports/";
    expect(parseOfficiatingSnapshot(badSource)).toBeNull();
  });
  it.each(["2026-02-31", "2026-99-99", "2025-10-21"])("rejects invalid calendar or season game date %s", (date) => {
    const value = snapshot();
    value.season.games[0].date = date;
    value.season.through = date;
    expect(parseOfficiatingSnapshot(value)).toBeNull();
  });
  it("rejects future generation and inconsistent refresh chronology", () => {
    const future = snapshot();
    future.generatedAt = "2026-10-24T12:00:00Z";
    expect(parseOfficiatingSnapshot(future)).toBeNull();
    const reversed = snapshot();
    reversed.generatedAt = "2026-10-22T12:00:00Z";
    expect(parseOfficiatingSnapshot(reversed)).toBeNull();
    const nextEasternDate = snapshot(2026, [1], "2026-10-21T01:00:00Z");
    expect(parseOfficiatingSnapshot(nextEasternDate)).toBeNull();
  });
  it("rejects an ungraded count unsupported by the retained assessments", () => {
    const value = snapshot();
    value.season.games[0].ungraded = 999;
    expect(parseOfficiatingSnapshot(value)).toBeNull();
  });
  it.each(["Undetectable", "NCI", "NCC", ""] as const)("retains an actual %s assessment in the ungraded count", (grade) => {
    const value = snapshot();
    const game = value.season.games[0];
    const detail = value.details[`${game.id}-${game.sha256.slice(0, 16)}`];
    detail.events.push({ ...detail.events[0], id: "unclassified", grade });
    game.ungraded = 1;
    expect(parseOfficiatingSnapshot(value)).not.toBeNull();
    game.ungraded = 0;
    expect(parseOfficiatingSnapshot(value)).toBeNull();
  });
});

describe("officiating publication merging and recovery", () => {
  it("preserves all other bundled seasons and replaces only the matching, complete newer snapshot", () => {
    const historical = snapshot(2025).season;
    const previous = snapshot(2026, [1], "2026-10-22T12:00:00Z").season;
    const incoming = snapshot(2026, [1, 2]);
    const merged = mergeOfficiatingSeasons([previous, historical], incoming);
    expect(merged.map((season) => season.season)).toEqual(["2025-26", "2026-27"]);
    expect(merged[0]).toBe(historical);
    expect(merged[1]).toBe(incoming.season);
    expect(previous.games).toHaveLength(1);
  });
  it("preserves bundled records if an incoming generation removes any already published game", () => {
    const current = snapshot(2026, [1, 2], "2026-10-22T12:00:00Z").season;
    const merged = mergeOfficiatingSeasons([current], snapshot(2026, [2]));
    expect(merged).toEqual([current]);
    expect(merged[0]).toBe(current);
  });
  it("preserves the bundled generation on replay even if the replay contains additional IDs", () => {
    const current = snapshot(2026, [1]).season;
    const stale = snapshot(2026, [1, 2], "2026-10-22T12:00:00Z");
    expect(mergeOfficiatingSeasons([current], stale)).toEqual([current]);
  });
  it("serves the bundled archive after network failure without relabeling it as a new publication", async () => {
    const previous = snapshot(2026).season;
    bundled.seasons.push(previous);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    const result = await loadOfficiatingPublication();
    expect(result.seasons).toEqual([previous]);
    expect(result.seasons[0].publicationHash).toBeUndefined();
    expect(result.snapshot).toBeNull();
    expect(result.publication.status).toBe("failed");
  });
  it("does not expose a validly hashed but internally inconsistent dataset", async () => {
    const previous = snapshot(2025).season;
    bundled.seasons.push(previous);
    const corrupt = snapshot(2026);
    corrupt.season.missed++;
    serve(corrupt);
    const result = await loadOfficiatingPublication();
    expect(result.seasons).toEqual([previous]);
    expect(result.snapshot).toBeNull();
    expect(result.publication.status).toBe("failed");
  });
  it.each([0, false, "", null])("rejects a validly hashed primitive payload %j without claiming fresh publication", async (value) => {
    const previous = snapshot(2025).season;
    bundled.seasons.push(previous);
    const body = new TextEncoder().encode(JSON.stringify(value));
    const digest = createHash("sha256").update(body).digest("hex");
    const manifest = fixturePublication(snapshot()).manifest;
    manifest.datasets.officiating = { path: `blobs/officiating-${digest}.json`, sha256: digest, bytes: body.length, generatedAt: NOW };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify(manifest)) : new Response(body)));
    const result = await loadOfficiatingPublication();
    expect(result.seasons).toEqual([previous]);
    expect(result.snapshot).toBeNull();
    expect(result.publication.status).toBe("failed");
  });
  it("attaches the verified publication hash to precisely the accepted season", async () => {
    bundled.seasons.push(snapshot(2025).season);
    const value = snapshot(2026, [1, 2]);
    const p = serve(value);
    const result = await loadOfficiatingPublication();
    expect(result.snapshot).toEqual(value);
    expect(result.seasons[0].publicationHash).toBeUndefined();
    expect(result.seasons[1].publicationHash).toBe(p.digest);
    expect(result.publication).toMatchObject({ hash: p.digest, checkedAt: NOW, publishedAt: NOW, status: "published" });
    expect(result.publication.data).toBeUndefined();
  });
  it("rejects snapshot generation time that differs from the verified manifest provenance", async () => {
    const previous = snapshot(2025).season;
    bundled.seasons.push(previous);
    const p = serve(snapshot());
    p.manifest.datasets.officiating!.generatedAt = "2026-10-22T12:00:00Z";
    const result = await loadOfficiatingPublication();
    expect(result.seasons).toEqual([previous]);
    expect(result.snapshot).toBeNull();
    expect(result.publication.status).toBe("failed");
  });
  it("accepts equivalent generation instants with different timezone notation", async () => {
    const value = snapshot();
    const p = serve(value);
    p.manifest.datasets.officiating!.generatedAt = "2026-10-23T12:00:00+00:00";
    const result = await loadOfficiatingPublication();
    expect(result.snapshot).toEqual(value);
    expect(result.publication.status).toBe("published");
  });
  it("keeps pinned summary/game/detail views coherent after a newer bundled generation is released", async () => {
    const old = snapshot(2026, [1], "2026-10-22T12:00:00Z");
    const latest = snapshot(2026, [1, 2]);
    bundled.seasons.push(latest.season);
    serve(latest, [old]);
    const oldHash = fixturePublication(old).digest;
    const result = await loadOfficiatingPublication(oldHash);
    expect(result.snapshot).toEqual(old);
    expect(result.seasons[0].games).toHaveLength(1);
    expect(result.seasons[0].publicationHash).toBe(oldHash);
    expect(result.snapshot!.details).toEqual(old.details);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("retains the bundle when an unpinned runtime snapshot removes IDs, instead of serving mismatched details", async () => {
    const previous = snapshot(2026, [1, 2]).season;
    bundled.seasons.push(previous);
    serve(snapshot(2026, [1]));
    const result = await loadOfficiatingPublication();
    expect(result.seasons).toEqual([previous]);
    expect(result.snapshot).toBeNull();
    expect(result.publication.status).toBe("failed");
  });
});

describe("officiating cold-start rollover archives", () => {
  function rollover(corruptArchive = false, wrongArchiveSeason = false) {
    const now = "2027-10-23T12:00:00Z";
    vi.setSystemTime(new Date(now));
    const bundledPartial = snapshot(2026, [1, 2], "2026-10-23T12:00:00Z").season;
    bundled.seasons.push(snapshot(2025).season, bundledPartial);
    const archived = snapshot(2026, [1, 2, 3], "2027-04-15T12:00:00Z");
    archived.season.games[2].date = "2027-04-14";
    archived.season.through = "2027-04-14";
    const current = snapshot(2027, [1], now);
    const old = fixturePublication(archived);
    const latest = fixturePublication(current);
    latest.manifest.updatedAt = now;
    latest.manifest.checks.officiating = { checkedAt: now, status: "published" };
    latest.manifest.datasets.officiating = { ...latest.manifest.datasets.officiating!, season: "2027-28" };
    latest.manifest.history = { officiating: {
      [wrongArchiveSeason ? "2025-26" : "2026-27"]: { ...old.manifest.datasets.officiating!, season: wrongArchiveSeason ? "2025-26" : "2026-27" },
      "2027-28": latest.manifest.datasets.officiating,
    } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(latest.manifest));
      if (url.endsWith(latest.path)) return new Response(latest.body);
      if (url.endsWith(old.path)) return new Response(corruptArchive ? "tampered" : old.body);
      return new Response("Missing", { status: 404 });
    }));
    return { archived, current, old, latest, bundledPartial };
  }
  it("keeps the final prior remote season beyond the bundled partial while adding the next season's first report", async () => {
    const { archived, current, old, latest } = rollover();
    const result = await loadOfficiatingPublication();
    expect(result.seasons.map((season) => season.season)).toEqual(["2025-26", "2026-27", "2027-28"]);
    expect(summarizeSeasons(result.seasons).map((season) => [season.season, season.gameCount])).toEqual([
      ["2025-26", 1], ["2026-27", 3], ["2027-28", 1],
    ]);
    expect(result.seasons[1]).toMatchObject({ ...archived.season, publicationHash: old.digest });
    expect(result.seasons[2]).toMatchObject({ ...current.season, publicationHash: latest.digest });
    expect(result.snapshot).toEqual(current);
    expect(result.publication.status).toBe("published");
    const pinned = await loadOfficiatingPublication(old.digest);
    expect(pinned.snapshot).toEqual(archived);
    expect(pinned.seasons.find((season) => season.season === "2026-27")?.games).toHaveLength(3);
    expect(pinned.snapshot!.details).toEqual(archived.details);
  });
  it("isolates an invalid archived blob, preserves its bundled fallback, and still shows the valid next season", async () => {
    const { current, latest, bundledPartial } = rollover(true);
    const result = await loadOfficiatingPublication();
    expect(result.seasons[1]).toEqual(bundledPartial);
    expect(result.seasons[1].publicationHash).toBeUndefined();
    expect(result.seasons[2]).toMatchObject({ ...current.season, publicationHash: latest.digest });
    expect(result.snapshot).toEqual(current);
    expect(result.publication.status).toBe("failed");
  });
  it("does not merge a snapshot under a different manifest season even when its bytes and hash are valid", async () => {
    const { current, bundledPartial } = rollover(false, true);
    const result = await loadOfficiatingPublication();
    expect(result.seasons[1]).toEqual(bundledPartial);
    expect(result.seasons[2].games).toEqual(current.season.games);
    expect(result.publication.status).toBe("failed");
  });
});
