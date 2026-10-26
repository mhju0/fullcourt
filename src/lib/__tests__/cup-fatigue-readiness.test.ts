import { describe, expect, it } from "vitest";
import { cupPendingSides, cupSnapshotPendingSides, isCupFatigueWindow, type CupFatigueContext, type CupPhysicalGame } from "@/lib/cup-fatigue-readiness";
import { scoreGameFatigue, type FatigueTeam } from "@/lib/fatigue";
import { toFatigueScoreWrite } from "@/lib/daily-refresh";
import { neutralizeIfUnplayed, rowToRecentGame } from "@/lib/fatigue-recent-games";
import { getTableColumns } from "drizzle-orm";
import { fatigueScores } from "@/lib/db/schema";

const storedColumns = Object.fromEntries(Object.entries(getTableColumns(fatigueScores)).map(([key, column]) => [key, column.name]));

const teams: FatigueTeam[] = [
  { id: 1, abbreviation: "BOS", latitude: "42.366", longitude: "-71.062", altitudeFlag: false },
  { id: 2, abbreviation: "NYK", latitude: "40.751", longitude: "-73.994", altitudeFlag: false },
  { id: 3, abbreviation: "DEN", latitude: "39.749", longitude: "-105.008", altitudeFlag: true },
];

function fixture() {
  const games: CupPhysicalGame[] = Array.from({ length: 82 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 1 + index * 3)).toISOString().slice(0, 10);
    return { id: 1000 + index, season: "2026-27", date, gameType: "regular", status: "scheduled",
      homeTeamId: 1, awayTeamId: 2, homeAbbr: "BOS", awayAbbr: "NYK", homeLat: "42.366", homeLon: "-71.062", homeAltitude: false,
      awayLat: "40.751", awayLon: "-73.994", awayAltitude: false, overtimePeriods: 0,
      tipOffUtc: new Date(`${date}T23:00:00Z`), homeScore: null, awayScore: null, neutralSite: false, neutralVenueCity: null };
  });
  const target = games.find(game => game.date === "2026-12-12")!;
  games.push({ ...target, id: 9000, date: "2026-12-11", gameType: "cup_final", awayTeamId: 3, awayAbbr: "DEN", awayLat: "39.749", awayLon: "-105.008", awayAltitude: true,
    tipOffUtc: new Date("2026-12-12T01:00:00Z"), neutralSite: true, neutralVenueCity: "Indianapolis" });
  const context: CupFatigueContext = { games, teams, fatigue: [] };
  refreshStored(target, context);
  return { target, context };
}

function refreshStored(target: CupPhysicalGame, context: CupFatigueContext) {
  const start = new Date(`${target.date}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 30);
  const recent = (teamId: number) => context.games.filter(game => game.date >= start.toISOString().slice(0, 10) && game.date < target.date && [game.homeTeamId, game.awayTeamId].includes(teamId) && ["final", "scheduled", "live"].includes(game.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map(neutralizeIfUnplayed).map(game => rowToRecentGame(game, teamId));
  const result = scoreGameFatigue({ game: target, homeTeam: teams[0], awayTeam: teams[1], homeRecentGames: recent(1), awayRecentGames: recent(2) });
  context.fatigue = (["home", "away"] as const).map((side, index) => Object.fromEntries([
    ["game_id", target.id], ...Object.entries(toFatigueScoreWrite(index + 1, result[side])).map(([key, value]) => [storedColumns[key], value]),
  ]));
}

describe("Cup input readiness", () => {
  it("bounds the registered season and each edge of the thirty-day window", () => {
    expect(isCupFatigueWindow("2026-27", "2026-12-04")).toBe(false);
    expect(isCupFatigueWindow("2026-27", "2026-12-05")).toBe(true);
    expect(isCupFatigueWindow("2026-27", "2027-01-10")).toBe(true);
    expect(isCupFatigueWindow("2026-27", "2027-01-11")).toBe(false);
    expect(isCupFatigueWindow("2025-26", "2025-12-12")).toBe(false);
  });

  it("releases only a complete schedule with the exact stored scoring tuple", () => {
    const { target, context } = fixture();
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
    context.fatigue[0].is_overtime_penalty = true;
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: false });
    context.fatigue[1].score = Number(context.fatigue[1].score) + 0.01;
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
  });

  it("does not release an older response row merely because a later stored row is current", () => {
    const { target, context } = fixture();
    context.publishedFatigue = structuredClone(context.fatigue);
    context.publishedFatigue[0].is_three_in_four = !context.publishedFatigue[0].is_three_in_four;
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: false });
  });

  it("waits for refreshed tuples when a Cup result adds actual overtime", () => {
    const { target, context } = fixture();
    Object.assign(context.games.at(-1)!, { status: "final", overtimePeriods: 1, homeScore: 141, awayScore: 135 });
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: false });
    refreshStored(target, context);
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
  });

  it.each(["no-final", "wrong-venue", "missing-game", "held-game", "duplicate", "missing-cup"])('withholds incomplete %s inputs', kind => {
    const { target, context } = fixture();
    if (kind === "no-final") context.games.pop();
    if (kind === "wrong-venue") context.games.at(-1)!.neutralVenueCity = "Unknown";
    if (kind === "missing-game") context.games.shift();
    if (kind === "held-game") context.games[0].status = "postponed";
    if (kind === "duplicate") Object.assign(context.games[1], { date: context.games[0].date, tipOffUtc: context.games[0].tipOffUtc });
    if (kind === "missing-cup") context.games.find(game => game.date === "2026-12-06")!.date = "2026-12-02";
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
  });

  it("ignores unknown venues outside the target's relevant inputs", () => {
    const { target, context } = fixture();
    const future = context.games.find(game => game.date > "2027-03-01")!;
    future.neutralSite = true; future.neutralVenueCity = "Unknown";
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
    const prior = context.games.find(game => game.date === "2026-12-06")!;
    prior.neutralSite = true; prior.neutralVenueCity = "Unknown";
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
  });

  it("extends a known moved final's risk window without guessing its venue", () => {
    const { target, context } = fixture();
    context.games.at(-1)!.date = "2026-12-15";
    expect(cupPendingSides({ ...target, date: "2027-01-12" }, context)).toEqual({ home: true, away: true });
    Object.assign(target, { date: "2027-01-15", tipOffUtc: new Date("2027-01-15T23:00:00Z") });
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
    refreshStored(target, context);
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
  });

  it("requires current tuples after the nominal assignment window expires", () => {
    const { target, context } = fixture();
    context.fatigue = [];
    expect(cupPendingSides({ ...target, date: "2027-01-09" }, context)).toEqual({ home: true, away: true });
    for (const date of ["2027-01-10", "2027-01-11"]) {
      Object.assign(target, { date, tipOffUtc: new Date(`${date}T23:00:00Z`) });
      context.fatigue = [];
      expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
      refreshStored(target, context);
      expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
    }
  });

  it.each(["date", "status", "teams", "tip", "neutral", "city", "season", "type", "missing"])("fails closed before helper early exits when original %s metadata changes", field => {
    const { target, context } = fixture();
    const original = structuredClone(target);
    if (field === "date") target.date = "2027-01-12";
    if (field === "status") target.status = "cancelled";
    if (field === "teams") [target.homeTeamId, target.awayTeamId] = [target.awayTeamId, target.homeTeamId];
    if (field === "tip") target.tipOffUtc = new Date("2026-12-13T01:00:00Z");
    if (field === "neutral") target.neutralSite = true;
    if (field === "city") target.neutralVenueCity = "Indianapolis";
    if (field === "season") target.season = "2027-28";
    if (field === "type") target.gameType = "cup_final";
    if (field === "missing") context.games = context.games.filter(game => game.id !== target.id);
    expect(cupSnapshotPendingSides(original, context)).toEqual({ home: true, away: true });
  });

  it.each(["2027-01-10", "2027-01-11"])("keeps a moved regular Cup game's stale nonfinalist output pending on %s", date => {
    const { target, context } = fixture();
    Object.assign(target, { date, tipOffUtc: new Date(`${date}T23:00:00Z`) });
    refreshStored(target, context);
    const cupGame = context.games.find(game => game.date === "2026-12-09")!;
    Object.assign(cupGame, { date: "2026-12-12", tipOffUtc: new Date("2026-12-12T23:00:00Z") });
    expect(cupPendingSides(target, context).away).toBe(true);
    context.fatigue = [];
    expect(cupPendingSides(target, context).away).toBe(true);
    refreshStored(target, context);
    expect(cupPendingSides(target, context).away).toBe(false);
  });

  it("does not infer unresolved postponed timing has expired after moving outside the original Cup dates", () => {
    const { target, context } = fixture();
    Object.assign(target, { date: "2027-02-01", tipOffUtc: new Date("2027-02-01T23:00:00Z") });
    const moved = context.games.find(game => game.date === "2026-12-09")!;
    Object.assign(moved, { date: "2026-12-20", status: "postponed", tipOffUtc: null });
    refreshStored(target, context);
    expect(cupPendingSides(target, context)).toEqual({ home: true, away: true });
    moved.status = "cancelled";
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
    moved.status = "postponed";
    target.status = "final";
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
  });

  it("lets missing nominal slots expire while still verifying available physical inputs", () => {
    const { target, context } = fixture();
    Object.assign(target, { date: "2027-01-11", tipOffUtc: new Date("2027-01-11T23:00:00Z") });
    context.games = context.games.filter(game => game.gameType !== "cup_final" && (game.date < "2026-12-04" || game.date > "2026-12-10"));
    refreshStored(target, context);
    expect(cupPendingSides(target, context)).toEqual({ home: false, away: false });
  });

  it("preserves held fixtures and historical seasons", () => {
    const { target, context } = fixture(); context.games = [];
    expect(cupPendingSides({ ...target, status: "cancelled" }, context)).toEqual({ home: false, away: false });
    expect(cupPendingSides({ ...target, season: "2025-26" }, context)).toEqual({ home: false, away: false });
  });
});
