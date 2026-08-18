import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `publishableGames` is the one seam that applies the season-regime rule (ADR-0004) to every
 * reader that publishes a game row. Before it existed the two predicates were hand-written at
 * each call site and four readers had quietly omitted one — `getGameById` among them, which
 * served a 2019-20 Orlando bubble game carrying a rest advantage, reachable in two clicks from
 * the Games browser.
 *
 * A query test would need a database. This reads the source instead, which is the same posture
 * `playoff-seasons.test.ts` takes toward `ml/build_series_dataset.py`: the failure mode is a
 * reader forgetting the rule, and that is visible in the text.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "src", "lib", "db", "queries.ts"),
  "utf8"
);

/** Source of a top-level function, from its declaration to the closing brace in column 0. */
function bodyOf(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`);
  expect(start, `${name} not found in queries.ts`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf("\n}\n", start);
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

/** Every reader whose rows reach a page or an API response as games. */
const PUBLISHING_READERS = [
  "getGamesByDate",
  "getGameById",
  "getTeamRecentFinalResults",
  "getRegularSeasonGameDatesWithCounts",
  "getDataAsOf",
  "getCompletedGamesWithFatigue",
  "searchRegularSeasonGames",
  "getUpcomingGamesWithRA",
  "getRegularSeasonScheduleForDisparity",
  "getSeasonReportRows",
  "getSeasonGamesStamp",
] as const;

/**
 * Readers that count physical schedule load rather than publishable rows. They must stay
 * unfiltered to agree with `fatigue-recent-games.ts`, which is also unfiltered — filtering one
 * side would render two contradictory density figures on the same card.
 */
const DENSITY_READERS = ["getTeamGameCountsInDaysBefore", "computeIs4In6Map"] as const;

describe("publishableGames", () => {
  it.each(PUBLISHING_READERS)("%s applies the rule", (name) => {
    expect(bodyOf(name)).toContain("publishableGames(");
  });

  it.each(DENSITY_READERS)("%s deliberately does not", (name) => {
    expect(bodyOf(name)).not.toContain("publishableGames(");
  });

  it("names each deliberate exception, so an omission cannot pass as one", () => {
    const docblock = SOURCE.slice(
      SOURCE.indexOf("* The two predicates every reader"),
      SOURCE.indexOf("function publishableGames")
    );
    for (const name of [...DENSITY_READERS, "getShotQualityGrid"]) {
      expect(docblock).toContain(name);
    }
  });

  it("keeps getCompletedGamesStamp on the filtered read rather than its own", () => {
    // The stamp stopped issuing its own query on 2026-08-18, when the same count/max became
    // a published "as of" value (`getDataAsOf`). Delegation is what keeps the key and the
    // displayed figure describing one population — re-inlining the query here would also
    // re-open the chance of dropping the regime filter from one of the two.
    expect(bodyOf("getCompletedGamesStamp")).toContain("getDataAsOf()");
  });

  it("is the only place the predicates are written", () => {
    // A second hand-written copy is exactly how the four readers drifted. One occurrence,
    // inside the helper, makes repeating that impossible rather than merely discouraged.
    const gameType = SOURCE.match(/eq\(games\.gameType, "regular"\)/g) ?? [];
    expect(gameType).toHaveLength(1);
    expect(bodyOf("publishableGames")).toContain('eq(games.gameType, "regular")');

    const regime = SOURCE.match(/\bgameIsNormallyPlayed\b/g) ?? [];
    // Its own declaration, and the single use inside `publishableGames`.
    expect(regime).toHaveLength(2);
  });
});
