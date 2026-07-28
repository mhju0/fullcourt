import { describe, expect, it } from "vitest";
import {
  buildRows,
  careerTotals,
  effectSe,
  indexPayload,
  restEffect,
  S,
  searchKey,
  seasonLabel,
  seasonRow,
  type PlayerRestPayload,
} from "../player-rest";

/** [player, year, team, age, g, fga, efg, noRestFga, noRestEfg, restedFga, restedEfg] */
function season(
  player: number,
  year: number,
  opts: Partial<{
    team: number; age: number; g: number; fga: number; efg: number;
    noRestFga: number; noRestEfg: number; restedFga: number; restedEfg: number;
  }> = {}
): number[] {
  return [
    player, year, opts.team ?? 0, opts.age ?? 25, opts.g ?? 70,
    opts.fga ?? 1000, opts.efg ?? 50,
    opts.noRestFga ?? 200, opts.noRestEfg ?? 48,
    opts.restedFga ?? 300, opts.restedEfg ?? 52,
  ];
}

const PAYLOAD: PlayerRestPayload = {
  generated: "2026-07-28",
  names: ["Nikola Jokić", "Al-Farouq Aminu", "Fringe Player"],
  teams: ["DEN", "POR", "MIA/BOS"],
  seasons: [
    season(0, 2024, { fga: 1364, efg: 62.7, noRestFga: 247, noRestEfg: 64.8, restedFga: 313, restedEfg: 65.2 }),
    season(0, 2025, { age: 31, fga: 1132, efg: 61.8, noRestFga: 223, noRestEfg: 64.6, restedFga: 310, restedEfg: 61.8 }),
    season(1, 2025, { team: 1, age: 35, fga: 400, efg: 45, noRestFga: 100, noRestEfg: 42, restedFga: 150, restedEfg: 52 }),
    // no rested attempts at all, so no effect can be formed
    season(2, 2025, { team: 2, age: 22, fga: 120, efg: 40, noRestFga: 60, noRestEfg: 40, restedFga: 0, restedEfg: 0 }),
  ],
  shrunk: [
    [0, -1.71, 1.5, -1.06],
    [1, 10.11, 2.2, 6.4],
  ],
};

describe("seasonLabel", () => {
  it("formats a start year the way the rest of the site does", () => {
    expect(seasonLabel(2025)).toBe("2025-26");
    expect(seasonLabel(1999)).toBe("1999-00");
  });
});

describe("searchKey", () => {
  it("strips the diacritics that would otherwise hide the most-searched players", () => {
    expect(searchKey("Nikola Jokić")).toBe("nikola jokic");
    expect(searchKey("Luka Dončić")).toBe("luka doncic");
    expect(searchKey("Kristaps Porziņģis")).toBe("kristaps porzingis");
  });
});

describe("restEffect", () => {
  it("is rested minus no-rest, so positive means rest helps him", () => {
    expect(restEffect(48, 52)).toBe(4);
    expect(restEffect(60, 50)).toBe(-10);
  });

  it("is null when either arm is missing", () => {
    expect(restEffect(null, 52)).toBeNull();
    expect(restEffect(48, null)).toBeNull();
  });
});

describe("effectSe", () => {
  it("shrinks as either arm grows", () => {
    const few = effectSe(100, 100)!;
    const many = effectSe(1000, 1000)!;
    expect(many).toBeLessThan(few);
    expect(few).toBeCloseTo(7.07, 2);
  });

  it("is null when an arm is empty, since no difference exists to bound", () => {
    expect(effectSe(0, 300)).toBeNull();
    expect(effectSe(300, 0)).toBeNull();
  });
});

describe("careerTotals", () => {
  const index = indexPayload(PAYLOAD);

  it("equals the sum of the seasons it is printed under", () => {
    const seasons = index.seasonsByPlayer.get(0)!;
    const t = careerTotals(seasons);
    expect(t.games).toBe(seasons.reduce((a, r) => a + r[S.GAMES], 0));
    expect(t.fga).toBe(seasons.reduce((a, r) => a + r[S.FGA], 0));
    expect(t.noRestFga).toBe(247 + 223);
    expect(t.restedFga).toBe(313 + 310);
  });

  it("weights eFG% by attempts rather than averaging the season rates", () => {
    const t = careerTotals(index.seasonsByPlayer.get(0)!);
    const naive = (62.7 + 61.8) / 2;
    const weighted = (62.7 * 1364 + 61.8 * 1132) / (1364 + 1132);
    expect(t.efg).toBeCloseTo(weighted, 6);
    expect(t.efg).not.toBeCloseTo(naive, 6);
  });

  it("reports no effect when one arm never happened", () => {
    const t = careerTotals(index.seasonsByPlayer.get(2)!);
    expect(t.restedEfg).toBeNull();
    expect(t.effect).toBeNull();
  });
});

describe("buildRows — season view", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("returns one row per player who played that season", () => {
    expect(buildRows(index, base).map((r) => r.name)).toEqual([
      "Nikola Jokić", "Al-Farouq Aminu", "Fringe Player",
    ]);
  });

  it("excludes a season the player did not play", () => {
    expect(buildRows(index, { ...base, year: 2024 }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });

  it("applies the volume floor before sorting, so low-volume rates cannot top the table", () => {
    const byEfg = buildRows(index, { ...base, sort: "efg", minFga: 0 });
    expect(byEfg[0].name).toBe("Nikola Jokić");
    expect(buildRows(index, { ...base, minFga: 500 }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });

  it("matches an accent-free query against an accented name", () => {
    expect(buildRows(index, { ...base, query: "jokic" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });

  it("sorts by effect in both directions, keeping unformable effects last either way", () => {
    const desc = buildRows(index, { ...base, sort: "effect", dir: -1 });
    const asc = buildRows(index, { ...base, sort: "effect", dir: 1 });
    expect(desc[0].name).toBe("Al-Farouq Aminu");   // +10.0
    expect(asc[0].name).toBe("Nikola Jokić");       // -2.8
    expect(desc[desc.length - 1].name).toBe("Fringe Player");
    expect(asc[asc.length - 1].name).toBe("Fringe Player");
  });
});

describe("buildRows — career view", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: "career" as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("drops players with no career estimate rather than ranking a number it does not have", () => {
    expect(buildRows(index, base).map((r) => r.name)).toEqual(["Nikola Jokić", "Al-Farouq Aminu"]);
  });

  it("uses the shipped career delta, not a re-derivation, so the shrunk pair stays consistent", () => {
    const jokic = buildRows(index, base).find((r) => r.name === "Nikola Jokić")!;
    expect(jokic.effect).toBe(-1.71);
    expect(jokic.se).toBe(1.5);
  });

  it("shows the career span in place of a team", () => {
    const jokic = buildRows(index, base).find((r) => r.name === "Nikola Jokić")!;
    expect(jokic.context).toBe("2024-25–26");
    expect(jokic.age).toBe("25–31");
  });
});

describe("underEvidenced", () => {
  const index = indexPayload(PAYLOAD);

  it("flags a difference smaller than its own standard error", () => {
    const row = seasonRow(index, season(0, 2025, { noRestFga: 100, noRestEfg: 50, restedFga: 100, restedEfg: 51 }));
    expect(row.effect).toBeCloseTo(1, 6);
    expect(row.se!).toBeGreaterThan(1);
    expect(row.underEvidenced).toBe(true);
  });

  it("does not flag a difference the sample can actually support", () => {
    const row = seasonRow(index, season(0, 2025, { noRestFga: 2000, noRestEfg: 45, restedFga: 2000, restedEfg: 55 }));
    expect(row.underEvidenced).toBe(false);
  });
});
