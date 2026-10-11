import { describe, expect, it } from "vitest";
import { generateRefereeArtifacts, type RefereeInputGame } from "../../../scripts/fetch_officials";
import fixture from "./fixtures/referee-generator.json";

// Field projections of retained ESPN responses; provenance contains the original cache SHA-256s.
const providerGames: RefereeInputGame[] = [
  { externalId: "ordinary-1", gameType: "regular", season: "2019-20", date: "2020-02-24", away: "DET", home: "POR", homeScore: 107, awayScore: 104 },
  { externalId: "ordinary-2", gameType: "regular", season: "2019-20", date: "2020-02-29", away: "DEN", home: "LAC", homeScore: 132, awayScore: 103 },
  { externalId: "ordinary-3", gameType: "regular", season: "2019-20", date: "2020-03-01", away: "POR", home: "ATL", homeScore: 129, awayScore: 117 },
  { externalId: "ordinary-4", gameType: "regular", season: "2019-20", date: "2020-03-01", away: "GSW", home: "PHX", homeScore: 99, awayScore: 115 },
];
const correctedGames = providerGames.map((g, i) => ({ ...g,
  externalId: ["0021900848", "0021900886", "0021900888", "0021900894"][i],
  date: ["2020-02-23", "2020-02-28", "2020-02-29", "2020-02-29"][i],
}));

function harness() {
  const outputs = new Map<string, string>();
  const source = structuredClone(fixture);
  const io = {
    minimumCoverage: { whistle: 4, foulStyle: 4 },
    loadJson: async (_url: string, file: string): Promise<unknown> => {
      if (file.startsWith("sb-")) {
        const date = file.slice(3, -5) as keyof typeof source.scoreboards;
        return source.scoreboards[date] ?? { events: [] };
      }
      const id = file.slice(3, -5) as keyof typeof source.summaries;
      if (!source.summaries[id]) throw new Error(`No fixture for ${file}`);
      return source.summaries[id];
    },
    writeOutput: (path: string, contents: string) => { outputs.set(path, contents); },
    log: () => {},
  };
  return { source, outputs, io };
}

async function expectRefusal(games: RefereeInputGame[], alter: (h: ReturnType<typeof harness>) => void = () => {}) {
  const h = harness();
  h.outputs.set("src/data/referee-whistle.json", "original whistle");
  h.outputs.set("src/data/referee-foul-style.json", "original style");
  h.outputs.set("ml/data/officials/officials-games.json", "original corpus");
  const before = [...h.outputs];
  alter(h);
  await expect(generateRefereeArtifacts(games, ["2019-20"], h.io)).rejects.toThrow();
  expect([...h.outputs]).toEqual(before);
}

describe("referee generator publication", () => {
  it("derives whistle coverage from collected games, excluding the unplayed configured season", async () => {
    const { io, outputs } = harness();
    await generateRefereeArtifacts(providerGames, ["2015-16", "2019-20", "2026-27"], io);
    const whistle = JSON.parse(outputs.get("src/data/referee-whistle.json")!);
    expect(whistle.gamesCovered).toBe(4);
    expect([whistle.firstSeason, whistle.lastSeason, whistle.seasonsCovered]).toEqual([
      "2019-20", "2019-20", 1,
    ]);
  });

  it("derives foul-style coverage from its usable games", async () => {
    const { io, outputs } = harness();
    await generateRefereeArtifacts(providerGames, ["2015-16", "2019-20", "2026-27"], io);
    const style = JSON.parse(outputs.get("src/data/referee-foul-style.json")!);
    expect(style.gamesCovered).toBe(4);
    expect([style.firstSeason, style.lastSeason]).toEqual(["2019-20", "2019-20"]);
  });

  it.each(["overtime", "thin foul stream"])("excludes a season containing only %s games from style coverage", async (reason) => {
    const { io, outputs, source } = harness();
    const eventId = "401161999";
    const date = "2021-02-24";
    const summary = structuredClone(source.summaries["401161490"]);
    summary.header.id = eventId;
    summary.header.season.year = 2021;
    summary.header.competitions[0].id = eventId;
    summary.header.competitions[0].date = `${date}T12:00Z`;
    if (reason === "overtime") summary.plays.at(-1)!.period.number = 5;
    else summary.plays = summary.plays.slice(-1);
    Object.assign(source.summaries, { [eventId]: summary });
    Object.assign(source.scoreboards, { "20210224": { events: [summary.header] } });
    io.minimumCoverage.whistle = 5;
    await generateRefereeArtifacts([...providerGames, {
      ...providerGames[0], externalId: "extra-excluded", season: "2020-21", date,
    }], ["2019-20", "2020-21", "2026-27"], io);
    const whistle = JSON.parse(outputs.get("src/data/referee-whistle.json")!);
    const style = JSON.parse(outputs.get("src/data/referee-foul-style.json")!);
    expect([whistle.firstSeason, whistle.lastSeason, whistle.seasonsCovered, whistle.gamesCovered]).toEqual([
      "2019-20", "2020-21", 2, 5,
    ]);
    expect([style.firstSeason, style.lastSeason, style.gamesCovered, style.gamesExcluded]).toEqual([
      "2019-20", "2019-20", 4, 1,
    ]);
  });

  it("recovers exactly the four corrections and retains canonical stored dates", async () => {
    const { io, outputs } = harness();
    await generateRefereeArtifacts(correctedGames, ["2019-20"], io);
    const corpus = JSON.parse(outputs.get("ml/data/officials/officials-games.json")!);
    expect(corpus).toHaveLength(4);
    expect(corpus.map((g: { date: string }) => g.date).sort()).toEqual(correctedGames.map(g => g.date).sort());
  });

  it("refuses an unknown missing date instead of trying the adjacent date", async () => {
    await expectRefusal([{ ...providerGames[0], date: "2020-02-23" }, ...providerGames.slice(1)]);
  });

  it.each(["date", "season", "home", "away", "homeScore", "awayScore", "gameType"] as const)(
    "refuses a known crosswalk whose stored %s changed", async (field) => {
      const game = { ...correctedGames[0], [field]: typeof correctedGames[0][field] === "number" ? 999 : "wrong" };
      await expectRefusal([game, ...correctedGames.slice(1)]);
    }
  );

  it.each(["id", "competitionId", "season", "seasonType", "home", "score", "completed", "state", "date"])(
    "refuses a summary with invalid %s before overwriting any output", async (field) => {
      await expectRefusal(providerGames, ({ source }) => {
        const h = source.summaries["401161490"].header;
        const c = h.competitions[0];
        if (field === "id") h.id = "wrong";
        if (field === "competitionId") c.id = "wrong";
        if (field === "season") h.season.year = 2021;
        if (field === "seasonType") h.season.type = 3;
        if (field === "home") c.competitors[0].team.abbreviation = "DEN";
        if (field === "score") c.competitors[0].score = "1";
        if (field === "completed") c.status.type.completed = false;
        if (field === "state") c.status.type.state = "in";
        if (field === "date") c.date = "2020-02-25T12:00Z";
      });
    }
  );

  it("refuses ambiguous same-pair events", async () => {
    await expectRefusal(providerGames, ({ source }) => {
      const events = source.scoreboards["20200224"].events;
      events.push(structuredClone(events.find(e => e.id === "401161490")!));
    });
  });

  it.each(["id", "season", "seasonType", "score", "completed", "date"])(
    "refuses a scoreboard with invalid %s", async (field) => {
      await expectRefusal(providerGames, ({ source }) => {
        const e = source.scoreboards["20200224"].events.find(e => e.id === "401161490")!;
        const c = e.competitions[0];
        if (field === "id") c.id = "wrong";
        if (field === "season") e.season.year = 2021;
        if (field === "seasonType") e.season.type = 3;
        if (field === "score") c.competitors[0].score = "1";
        if (field === "completed") c.status.type.completed = false;
        if (field === "date") c.date = "2020-02-25T12:00Z";
      });
    }
  );

  it("refuses an approved correction whose ESPN event is absent or replaced", async () => {
    await expectRefusal(correctedGames, ({ source }) => {
      source.scoreboards["20200224"].events = [];
    });
    await expectRefusal(correctedGames, ({ source }) => {
      const event = source.scoreboards["20200224"].events.find(e => e.id === "401161490")!;
      event.id = "different";
      event.competitions[0].id = "different";
    });
  });

  it("refuses duplicate stored games", async () => {
    await expectRefusal([...providerGames, providerGames[0]]);
  });

  it("refuses empty foul-style population even when a test baseline is zero", async () => {
    await expectRefusal(providerGames, ({ source, io }) => {
      for (const summary of Object.values(source.summaries)) summary.plays.at(-1)!.period.number = 5;
      io.minimumCoverage.foulStyle = 0;
    });
  });

  it.each(["scoreboard", "summary"])("refuses a %s fetch error", async (which) => {
    await expectRefusal(providerGames, ({ io }) => {
      const load = io.loadJson;
      io.loadJson = async (url, file) => {
        if (file.startsWith(which === "scoreboard" ? "sb-" : "ev-")) throw new Error("provider unavailable");
        return load(url, file);
      };
    });
  });

  it("refuses empty input", async () => { await expectRefusal([]); });

  it("refuses a population below either current publication floor", async () => {
    await expectRefusal(providerGames, ({ io }) => { io.minimumCoverage.whistle = 5; });
    await expectRefusal(providerGames, ({ io }) => { io.minimumCoverage.foulStyle = 5; });
  });
});

describe("referee generator allowed missing data", () => {
  it("counts validated summaries with missing box data as skipped when floors remain satisfied", async () => {
    const { io, outputs, source } = harness();
    source.summaries["401161490"].boxscore.teams[0].statistics = [];
    io.minimumCoverage = { whistle: 3, foulStyle: 3 };
    await generateRefereeArtifacts(providerGames, ["2019-20"], io);
    const whistle = JSON.parse(outputs.get("src/data/referee-whistle.json")!);
    expect([whistle.gamesCovered, whistle.gamesSkipped]).toEqual([3, 1]);
  });
});
