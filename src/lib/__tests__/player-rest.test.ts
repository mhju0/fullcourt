import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signedNumber } from "../signed-number";
import {
  buildRows,
  defaultPlayerVolume,
  careerTotals,
  effectSe,
  franchiseOptions,
  indexPayload,
  restEffect,
  S,
  searchKey,
  seasonLabel,
  seasonRow,
  zeroRestWorkload,
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
    const few = effectSe(100, 100, 100, 100, 200, 200)!;
    const many = effectSe(1000, 1000, 1000, 1000, 2000, 2000)!;
    expect(many).toBeLessThan(few);
    expect(few).toBeCloseTo(7.107, 2);
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

describe("exact shooting numerators", () => {
  const sarunas = [0, 1996, 0, 32, 17, 101, 43.07, 16, 34.38, 6, 58.33, 87, 11, 7];
  const payload = { ...PAYLOAD, names: ["Sarunas Marciulionis"], seasons: [sarunas], shrunk: [] };

  it("uses the same exact ratios for a season and its one-season career", () => {
    const row = seasonRow(indexPayload(payload), sarunas);
    const total = careerTotals([sarunas]);
    expect(row.noRestEfg).toBe(50 * 11 / 16);
    expect(row.restedEfg).toBe(50 * 7 / 6);
    expect(row.efg).toBe(50 * 87 / 101);
    expect(total.efg).toBe(row.efg);
    expect(total.effect).toBe(row.effect);
    expect(signedNumber(row.effect!, 1)).toBe("+24.0");
    expect(signedNumber(total.effect!, 1)).toBe("+24.0");
  });

  it("keeps the shipped Marciulionis season and covered career display consistent", () => {
    const shipped = JSON.parse(readFileSync(join(process.cwd(), "public/data/player-rest.json"), "utf8")) as PlayerRestPayload;
    const index = indexPayload(shipped);
    const player = shipped.names.indexOf("Sarunas Marciulionis");
    const seasons = index.seasonsByPlayer.get(player)!;
    expect(seasons).toHaveLength(1);
    expect(seasons[0].slice(11, 14)).toEqual([87, 11, 7]);
    expect(signedNumber(seasonRow(index, seasons[0]).effect!, 1)).toBe("+24.0");
    expect(signedNumber(careerTotals(seasons).effect!, 1)).toBe("+24.0");
    expect(index.career.has(player)).toBe(false);
  });

  it("pools integer numerators across seasons before division", () => {
    const second = [0, 1997, 0, 33, 20, 103, 44.17, 18, 41.67, 8, 62.5, 91, 15, 10];
    const total = careerTotals([sarunas, second]);
    expect(total.exactNumerators).toBe(true);
    expect(total.efg).toBe(50 * 178 / 204);
    expect(total.noRestEfg).toBe(50 * 26 / 34);
    expect(total.restedEfg).toBe(50 * 17 / 14);
    expect(total.effect).toBe(50 * 17 / 14 - 50 * 26 / 34);
  });

  it("keeps empty arms unavailable even when their numerator is zero", () => {
    const empty = [0, 1996, 0, 32, 17, 101, 43.07, 0, 0, 6, 58.33, 87, 0, 7];
    expect(seasonRow(indexPayload(payload), empty).noRestEfg).toBeNull();
    expect(seasonRow(indexPayload(payload), empty).effect).toBeNull();
    expect(careerTotals([empty]).effect).toBeNull();
  });

  it("retains the stored-rate fallback for legacy eleven-column rows", () => {
    const legacy = sarunas.slice(0, 11);
    const row = seasonRow(indexPayload(payload), legacy);
    expect(row.noRestEfg).toBe(34.38);
    expect(row.restedEfg).toBe(58.33);
    expect(careerTotals([legacy]).exactNumerators).toBe(false);
  });

  it("uses exact raw career differences while retaining the shipped error and shrinkage estimates", () => {
    const qualified = [0, 2024, 0, 30, 60, 560, 44.64, 320, 34.38, 240, 58.33, 500, 220, 280];
    const exactPayload = { ...payload, seasons: [qualified], shrunk: [[0, 23.96, 23.959, 1.25]] };
    const index = indexPayload(exactPayload);
    const [row] = buildRows(index, { year: "career", minFga: 0, query: "", sort: "fga", dir: -1 });
    expect(row.effect).toBe(careerTotals([qualified]).effect);
    expect(row.effect).not.toBe(23.96);
    expect(row.se).toBeNull();
    expect(row.underEvidenced).toBe(true);
    expect(index.career.get(0)?.shrunk).toBe(1.25);
  });
});

describe("regular-season fixture aliases in the published Shooting data", () => {
  const shipped = JSON.parse(readFileSync(join(process.cwd(), "public/data/player-rest.json"), "utf8")) as PlayerRestPayload;

  it.each([
    ["Shai Gilgeous-Alexander", 76, 1656, 1883],
    ["Victor Wembanyama", 46, 857, 958],
    ["Tyrese Haliburton", 73, 1006, 1170],
  ])("includes the Cup/Paris outcomes in %s's 2024-25 totals", (name, games, fga, numerator) => {
    const player = shipped.names.indexOf(String(name));
    const row = shipped.seasons.find((season) => season[S.PLAYER] === player && season[S.YEAR] === 2024)!;
    expect(row[S.GAMES]).toBe(games);
    expect(row[S.FGA]).toBe(fga);
    expect(row[11]).toBe(numerator);
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

  it("keeps raw career rows even without a model estimate", () => {
    expect(buildRows(index, base).map((r) => r.name)).toEqual(["Nikola Jokić", "Al-Farouq Aminu", "Fringe Player"]);
  });

  it("uses the shipped career delta, not a re-derivation, so the shrunk pair stays consistent", () => {
    const jokic = buildRows(index, base).find((r) => r.name === "Nikola Jokić")!;
    expect(jokic.effect).toBe(-1.71);
    expect(jokic.se).toBeNull();
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
    expect(row.se).toBeNull();
    expect(row.underEvidenced).toBe(true);
  });

  it("keeps legacy rows uncertain when exact second moments are absent", () => {
    const row = seasonRow(index, season(0, 2025, { noRestFga: 2000, noRestEfg: 45, restedFga: 2000, restedEfg: 55 }));
    expect(row.underEvidenced).toBe(true);
  });
});

describe("franchiseOptions", () => {
  it("builds one option per franchise, folding history into its label", () => {
    const opts = franchiseOptions(["DEN", "SEA", "OKC", "MIA/BOS"]);
    expect(opts.map((o) => o.value)).toEqual(["BOS", "DEN", "MIA", "OKC"]);
    expect(opts.find((o) => o.value === "OKC")!.label).toBe("OKC · SEA");
    expect(opts.find((o) => o.value === "DEN")!.label).toBe("DEN");
  });

  // The drift check from the spec: a future relocation adds a tricode the folding
  // table does not claim, which must break this test rather than silently grow the
  // dropdown past 30 franchises.
  it("claims every tricode in the shipped payload for exactly 30 franchises", () => {
    const payload = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "player-rest.json"), "utf8")
    ) as PlayerRestPayload;
    const opts = franchiseOptions(payload.teams);
    expect(opts.map((o) => o.value)).toEqual([
      "ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
      "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
      "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
    ]);
  });
});

describe("buildRows — team filter", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("keeps only that franchise's players in a season view", () => {
    expect(buildRows(index, { ...base, team: "POR" }).map((r) => r.name)).toEqual(["Al-Farouq Aminu"]);
  });

  it("matches a traded player under either of his season's teams", () => {
    expect(buildRows(index, { ...base, team: "BOS" }).map((r) => r.name)).toEqual(["Fringe Player"]);
    expect(buildRows(index, { ...base, team: "MIA" }).map((r) => r.name)).toEqual(["Fringe Player"]);
  });

  it("career view matches a player who ever played for the franchise", () => {
    expect(buildRows(index, { ...base, year: "career", team: "DEN" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
    expect(buildRows(index, { ...base, year: "career", team: "POR" }).map((r) => r.name)).toEqual(["Al-Farouq Aminu"]);
  });

  it("folds a historical tricode into its franchise", () => {
    const idx = indexPayload({ ...PAYLOAD, teams: ["SEA", "POR", "MIA/BOS"] });
    expect(buildRows(idx, { ...base, team: "OKC" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });
});

describe("zeroRestWorkload", () => {
  const payload = {
    generated: "2026-07-30",
    names: ["Alpha", "Beta", "Gamma"],
    teams: ["AAA", "BBB"],
    seasons: [
      // [player, year, team, age, games, fga, efg, noRestFga, noRestEfg, restedFga, restedEfg]
      [0, 2025, 0, 27, 70, 900, 55.0, 240, 52.1, 660, 56.4],
      [1, 2025, 1, 24, 68, 700, 51.0, 310, 49.8, 390, 52.0],
      [2, 2024, 0, 31, 60, 800, 54.0, 400, 53.0, 400, 55.0], // wrong season
    ],
    shrunk: [],
  };

  it("ranks a season's players by attempts taken on no rest", () => {
    expect(zeroRestWorkload(payload, 2025, 10)).toEqual([
      { name: "Beta", team: "BBB", noRestFga: 310, noRestEfg: 49.8, games: 68 },
      { name: "Alpha", team: "AAA", noRestFga: 240, noRestEfg: 52.1, games: 70 },
    ]);
  });

  it("honours the limit", () => {
    expect(zeroRestWorkload(payload, 2025, 1).map((r) => r.name)).toEqual(["Beta"]);
  });

  it("returns nothing for a season absent from the payload", () => {
    expect(zeroRestWorkload(payload, 1999, 10)).toEqual([]);
  });
});

describe("buildRows — position filter", () => {
  const index = indexPayload({ ...PAYLOAD, pos: ["C", "F", ""] });
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("keeps only players known to play the position", () => {
    expect(buildRows(index, { ...base, pos: "C" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });

  it("shows a player with no known position only under all positions", () => {
    for (const pos of ["G", "F", "C"] as const) {
      expect(buildRows(index, { ...base, pos }).map((r) => r.name)).not.toContain("Fringe Player");
    }
    expect(buildRows(index, base).map((r) => r.name)).toContain("Fringe Player");
  });

  it("matches nothing when the payload predates the pos array", () => {
    // Old CDN-cached JSON + new code: honest empty, not a crash and not silently wrong.
    expect(buildRows(indexPayload(PAYLOAD), { ...base, pos: "G" })).toEqual([]);
  });
});

describe("buildRows — evidencedOnly", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("drops exactly the rows rendered dim", () => {
    // Jokić 2025: effect −2.8 vs SE ≈ 4.39 → dim. Fringe: no effect → dim. Aminu: +10 vs 6.45 → kept.
    expect(buildRows(index, { ...base, evidencedOnly: true })).toEqual([]);
    expect(buildRows(index, base)).toHaveLength(3);
  });

  it("applies in career view too", () => {
    // Aminu's delta (1.0) is inside his SE (2.2) here, so the filter must drop him;
    // with the main fixture both career players are well-evidenced and a broken
    // filter would pass unnoticed.
    const idx = indexPayload({ ...PAYLOAD, shrunk: [[0, -1.71, 1.5, -1.06], [1, 1.0, 2.2, 0.9]] });
    expect(
      buildRows(idx, { ...base, year: "career", evidencedOnly: true }).map((r) => r.name)
    ).toEqual([]);
  });
});


describe("early-season observations", () => {
  it("defaults current season to Everyone while retaining an explicit attempt filter", () => {
    expect(defaultPlayerVolume(2026, 2026, null)).toBe(0);
    expect(defaultPlayerVolume(2026, 2026, "600")).toBe(600);
    expect(defaultPlayerVolume(2025, 2026, null)).toBe(300);
  });
  it("keeps a one-attempt 150% outlier, with unavailable sampling error", () => {
    const row = [0, 2026, 0, 20, 2, 2, 75, 1, 0, 1, 150, 3, 0, 3, 9, 0, 9];
    const result = seasonRow(indexPayload({ ...PAYLOAD, seasons: [row] }), row);
    expect(result.restedEfg).toBe(150);
    expect(result.effect).toBe(150);
    expect(result.se).toBeNull();
    expect(result.underEvidenced).toBe(true);
  });
  it("computes variance from misses and three-point makes rather than Bernoulli means", () => {
    // Each arm contains a miss and a made three: mean .75, sample variance 1.125.
    expect(effectSe(2, 2, 3, 3, 9, 9)).toBeCloseTo(100 * Math.sqrt(1.125));
    expect(effectSe(1, 2, 3, 3, 9, 9)).toBeNull();
    expect(effectSe(0, 2, 0, 3, 0, 9)).toBeNull();
  });
});
