import { renderToStaticMarkup } from "react-dom/server";
import RestAdvantagePage from "@/app/behind-the-data/rest-advantage/page";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import facts from "../../../ml/fatigue_ablation_facts.json";
import { RESTED_AT_HOME, REST_SPLIT_SAMPLE } from "../rest-split-facts";

const percent = (wins: number, games: number) => Math.round(wins / games * 10000) / 100;

describe("generated ablation facts", () => {
  it("reproduces the canonical full-model population before any term is removed", () => {
    expect(facts.scoreReconstructionMismatches).toBe(0);
    expect(facts.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(facts.eligibleGames).toBe(REST_SPLIT_SAMPLE.scoredGames);
    expect(facts.baseline.called).toBe(RESTED_AT_HOME.games);
    expect(facts.baseline.wins).toBe(RESTED_AT_HOME.wins);
    expect(facts.baseline.winPct).toBe(percent(facts.baseline.wins, facts.baseline.called));
    expect(facts.baseline.edge).toBe(facts.baseline.wins - facts.baseline.called / 2);
  });

  it("accounts for every removed and newly selected call using exact counts", () => {
    expect(facts.terms).toHaveLength(8);
    expect(new Set(facts.terms.map((term) => term.term)).size).toBe(8);
    for (const term of facts.terms) {
      expect(term.calledWithout).toBe(facts.baseline.called - term.found + term.added);
      const winsWithout = facts.baseline.wins - term.foundWins + term.addedWins;
      expect(term.winPctWithout).toBe(percent(winsWithout, term.calledWithout));
      expect(term.foundWinPct).toBe(percent(term.foundWins, term.found));
      expect(term.edgeLostExact).toBe(facts.baseline.edge - (winsWithout - term.calledWithout / 2));
    }
  });

  it("still supports the named claims beside the generated table", () => {
    expect(facts.terms[0].term).toBe("Travel");
    expect(facts.terms.at(-1)!.term).toBe("Freshness");
    expect(facts.terms.filter((term) => term.edgeLostExact < 0).map((term) => term.term)).toEqual(["Freshness"]);
    for (const name of ["Travel", "Road segment"]) {
      expect(facts.terms.find((term) => term.term === name)!.delta).toBeGreaterThan(0);
    }
    const page = readFileSync(join(process.cwd(), "src/app/behind-the-data/rest-advantage/page.tsx"), "utf8");
    expect(page).toContain("const ABLATIONS = ablationFacts.terms");
    expect(page).toContain("const ABLATION_BASELINE = ablationFacts.baseline");
  });

  it("renders each named removed-call rate from its generated facts", () => {
    const html = renderToStaticMarkup(RestAdvantagePage());
    const backToBack = facts.terms.find((term) => term.term === "Back-to-back")!;
    const workload = facts.terms.find((term) => term.term === "Recent workload (decay)")!;
    expect(html).toContain(`Games selected by the back-to-back term but lost when it is removed won at ${backToBack.foundWinPct.toFixed(2)}%.`);
    expect(html).toContain(`For recent workload, that rate is ${workload.foundWinPct.toFixed(2)}%.`);
    expect(html).not.toContain("win rates above 63%");
  });
});
