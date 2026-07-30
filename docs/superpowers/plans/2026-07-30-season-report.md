# Season Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/season`, a sixth nav tab that reports one NBA season through FullCourt's rest-advantage lens — how the call scored, which teams converted a rest edge, the season's loudest calls, what the schedule cost each team, when the league was most tired, and who shot most on zero rest.

**Architecture:** One season-scoped SQL query feeds one pure reducer, which computes all seven sections in a single pass. A thin server module labels team IDs and caches per season; a `jsonRoute` exposes it; one client component renders it. This is the exact chain `schedule-disparity` already uses — no new patterns are introduced.

**Tech Stack:** Next.js App Router, Drizzle ORM over Supabase Postgres, Zod, SWR, recharts, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-30-season-report-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **One sign rule.** `restEdge = opponentFatigue − teamFatigue`; positive means *this* team is the fresher side. Stated once at the top of `src/lib/season-report.ts` and nowhere else. Matches `classifyRestAdvantage`'s existing orientation (`differential = away − home`, positive ⇒ home advantaged).
- **Never re-implement the ±0.5 rule.** Call `classifyRestAdvantage` from `@/lib/rest-advantage-evidence`. A second copy of that threshold is a defect.
- **`MIN_GAMES_FOR_INFERENCE = 100`.** Below this many decidable games, the rate tiles and verdict show a "too early" state instead of a number.
- **RA≥5 and RA≥7 are never published per season.** A season holds ~46 and ~9 such games. The per-season threshold view stops at RA≥2.
- **No season count in this page's copy.** Not "41-season", not `NBA_SEASONS.length`. Section headings inject the season label: `2025-26 VS HISTORY`.
- **No hardcoded "this season".** The selector reaches back to 1985-86; every label takes the season as data.
- **Aggregates cover completed games only.** `scheduledGames` is a bare count for the progress tile; every rate, total and average ignores games without a final score or without both fatigue rows.
- **Deterministic ordering everywhere.** Every sort has an explicit final tie-break on `teamId` or `gameId`. No comparator may return `NaN`.
- Styling comes from `@/lib/terminal-styles` (`termCardStyle`, `termThStyle`, `termTdStyle`) and CSS variables (`--term-text`, `--term-text-muted`, `--term-blue`, `--term-red`, `--term-neutral`, `--term-border`, `--term-surface`, `--term-surface-2`, `--term-radius`). Never hardcode a hex.
- A JSX text node that wraps to the next source line **loses its leading space**. Use hyphenated forms or an explicit `{" "}`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/season-report.ts` | **Create.** All types, the pure `buildSeasonReport` reducer, the band/verdict/norm helpers. No DB, no React. |
| `src/lib/__tests__/season-report.test.ts` | **Create.** Unit tests including the anti-drift test against `buildHistoricalBacktest`. |
| `src/lib/rest-advantage-evidence.ts` | **Modify.** Export the existing private `winPct` so both reducers round identically. |
| `src/lib/db/queries.ts` | **Modify.** Add `isThreeInFour` to `FATIGUE_COLUMNS`; add `getSeasonReportRows(season)`. |
| `src/lib/season-report-server.ts` | **Create.** Fetch + label + cache per season. |
| `src/app/api/season-report/route.ts` | **Create.** `jsonRoute` with a season param. |
| `src/app/season/page.tsx` | **Create.** Server shell: metadata + `PageHeader` + lazy content. |
| `src/components/season-report-lazy.tsx` | **Create.** Skeleton. |
| `src/components/season-report-content.tsx` | **Create.** Selector, tiles, and all seven sections. |
| `src/lib/primary-navigation.ts` | **Modify.** Sixth `DIRECT_NAV_ITEMS` entry. |
| `e2e/about.spec.ts` | **Modify.** Nav link count 5 → 6, two places. |
| `e2e/season.spec.ts` | **Create.** Smoke test. |
| `src/app/page.tsx` | **Modify.** Repoint `OffSeasonBanner` to `/season`, drop the season count. |

**Why all types live in `src/lib/season-report.ts`** rather than split between the module and `src/types/index.ts` the way `schedule-disparity` splits them: `season-report.ts` imports `rest-advantage-evidence.ts`, which imports `@/types`. Declaring the response type in `@/types` would make that a cycle. Type-only cycles are erased at compile time and would work, but one file holding one module's vocabulary is simpler to read and impossible to get out of step.

---

### Task 1: The pure reducer — rates, bands and the anti-drift guarantee

**Files:**
- Create: `src/lib/season-report.ts`
- Create: `src/lib/__tests__/season-report.test.ts`
- Modify: `src/lib/rest-advantage-evidence.ts:47-49`

**Interfaces:**
- Consumes: `classifyRestAdvantage`, `winPct` and `HistoricalGameEvidenceRow` from `@/lib/rest-advantage-evidence`.
- Produces: `SeasonReportSide`, `SeasonReportRow`, `SeasonReportRate`, `SeasonReport`, `buildSeasonReport(season, rows)`, `winRateBand(wins, games)`, `MIN_GAMES_FOR_INFERENCE`. Tasks 2 and 3 extend `SeasonReport` in place; Task 4 consumes `SeasonReportRow` and `buildSeasonReport`; Task 6 consumes the whole shape.

- [ ] **Step 1: Export the shared `winPct`**

Both reducers must round identically or the anti-drift test in Step 6 becomes a coin flip. In `src/lib/rest-advantage-evidence.ts`, add `export` to the existing helper — change nothing else about it:

```ts
/** Win percentage to one decimal. Shared so two surfaces cannot round one statistic differently. */
export function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/__tests__/season-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSeasonReport,
  MIN_GAMES_FOR_INFERENCE,
  winRateBand,
  type SeasonReportRow,
  type SeasonReportSide,
} from "@/lib/season-report";

/** A fatigue side with everything neutral except the score, so a test states only what it means. */
function side(score: number, extra: Partial<SeasonReportSide> = {}): SeasonReportSide {
  return {
    fatigueScore: String(score),
    travelDistanceMiles: "0",
    isBackToBack: false,
    isThreeInFour: false,
    hasTimeZoneDisplacement: false,
    ...extra,
  };
}

/** Home team 1 beats away team 2 by 10, home the fresher side, unless overridden. */
function game(overrides: Partial<SeasonReportRow> & { gameId: number }): SeasonReportRow {
  return {
    date: "2025-10-21",
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 100,
    awayScore: 90,
    home: side(1),
    away: side(4),
    ...overrides,
  };
}

describe("winRateBand", () => {
  it("returns the 95% Wald half-width in percentage points", () => {
    // p = 0.52, n = 100 → 1.96 * sqrt(0.52 * 0.48 / 100) = 0.0979
    expect(winRateBand(52, 100)).toBe(9.8);
  });

  it("is null with no games rather than NaN", () => {
    expect(winRateBand(0, 0)).toBeNull();
  });
});

describe("buildSeasonReport — the sign rule", () => {
  it("treats the lower fatigue score as the rested side and signs the margin from its view", () => {
    // home 1.0 vs away 4.0 → differential +3.0 → home is rested, and home won by 10.
    const report = buildSeasonReport("2025-26", [game({ gameId: 1 })]);

    expect(report.overall.games).toBe(1);
    expect(report.overall.restedTeamWins).toBe(1);
  });

  it("counts a rested loss as a loss, whichever side was rested", () => {
    // away 1.0 vs home 4.0 → away is rested, and away lost by 10.
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(4), away: side(1) }),
    ]);

    expect(report.overall.games).toBe(1);
    expect(report.overall.restedTeamWins).toBe(0);
  });
});

describe("buildSeasonReport — what counts", () => {
  it("excludes games inside the neutral band from every rate", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(1), away: side(1.4) }), // 0.4 → neutral
    ]);

    expect(report.completedGames).toBe(1);
    expect(report.overall.games).toBe(0);
    expect(report.overall.band).toBeNull();
  });

  it("excludes games missing a score or a fatigue side, but still counts them as scheduled", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, homeScore: null, awayScore: null }),
      game({ gameId: 2, home: null }),
    ]);

    expect(report.scheduledGames).toBe(2);
    expect(report.completedGames).toBe(0);
    expect(report.overall.games).toBe(0);
  });

  it("splits the RA >= 2 tier out of the overall rate", () => {
    const report = buildSeasonReport("2025-26", [
      game({ gameId: 1, home: side(1), away: side(4) }), // 3.0 → both tiers
      game({ gameId: 2, home: side(1), away: side(2) }), // 1.0 → overall only
    ]);

    expect(report.overall.games).toBe(2);
    expect(report.atLeastTwo.games).toBe(1);
  });

  it("renders an empty season without throwing", () => {
    const report = buildSeasonReport("1998-99", []);

    expect(report.season).toBe("1998-99");
    expect(report.scheduledGames).toBe(0);
    expect(report.overall.games).toBe(0);
    expect(report.overall.winPct).toBe(0);
    expect(report.overall.band).toBeNull();
  });
});

describe("buildSeasonReport — MIN_GAMES_FOR_INFERENCE", () => {
  it("is the documented gate of 100 decidable games", () => {
    expect(MIN_GAMES_FOR_INFERENCE).toBe(100);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/season-report"`.

- [ ] **Step 4: Write the reducer**

Create `src/lib/season-report.ts`. Tasks 2 and 3 will add fields; this task lands the skeleton, the rates and the bands.

```ts
/**
 * Season Report — one season, reduced from its own games.
 *
 * ONE SIGN RULE, applied nowhere else in this module: a rest edge is always the
 * opponent's fatigue score minus this team's. Positive means THIS team is the
 * fresher side. That is the orientation `classifyRestAdvantage` already uses
 * (`differential = away − home`, positive ⇒ home advantaged), so nothing here
 * flips a sign and no two views on this page can disagree.
 *
 * Everything is pure. The DB layer supplies rows, `season-report-server.ts`
 * attaches team names, and this file decides every number on the page.
 *
 * Why the types live here rather than in `@/types`: this module imports
 * `rest-advantage-evidence`, which imports `@/types`, so declaring the response
 * shape there would close a cycle. One file per module vocabulary is also one
 * fewer place for the two halves to drift apart.
 */

import { classifyRestAdvantage, winPct } from "@/lib/rest-advantage-evidence";

/**
 * Decidable games below which a season's rest win rate is shown as "too early"
 * rather than as a finding.
 *
 * A full season yields ~940 decidable games, worth ±3.2pp. At 100 the interval
 * is ±9.8pp — wide, but the number is no longer meaningless, and the band is
 * printed beside it either way. This is a display gate, not a modelling one.
 */
export const MIN_GAMES_FOR_INFERENCE = 100;

/** One team's fatigue row for one game, as the DB layer hands it over. */
export interface SeasonReportSide {
  /** Postgres `decimal`, so a string. */
  fatigueScore: string;
  travelDistanceMiles: string;
  isBackToBack: boolean;
  isThreeInFour: boolean;
  hasTimeZoneDisplacement: boolean;
}

/**
 * One regular-season game.
 *
 * Sides are nested rather than flattened into ten `home*`/`away*` fields because
 * every consumer here handles the two symmetrically, and a nested pair cannot be
 * mixed up the way `homeIsThreeInFour` and `awayIsThreeInFour` can.
 *
 * A side is null when no fatigue row exists for it (the query left-joins so the
 * game still counts toward `scheduledGames`); such games are skipped by every
 * aggregate.
 */
export interface SeasonReportRow {
  gameId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  home: SeasonReportSide | null;
  away: SeasonReportSide | null;
}

/** A rest-advantage hit rate with the interval that says whether to believe it. */
export interface SeasonReportRate {
  games: number;
  restedTeamWins: number;
  /** Percentage to one decimal, rounded by the shared `winPct`. */
  winPct: number;
  /** Half-width of the 95% Wald interval in percentage points. Null with no games. */
  band: number | null;
}

export interface SeasonReport {
  season: string;
  /** Every regular-season game in the season — the progress tile's denominator. */
  scheduledGames: number;
  /** Games with a final score and both fatigue sides — every aggregate's denominator. */
  completedGames: number;
  overall: SeasonReportRate;
  atLeastTwo: SeasonReportRate;
}

/**
 * Half-width of the 95% Wald interval, in percentage points to one decimal.
 *
 * Wald rather than Wilson: at the sample sizes this page publishes (gated at 100
 * games, typically 400–950) and rates near 0.5, the two agree to well under the
 * 0.1pp this rounds to, and Wald is one line.
 */
export function winRateBand(wins: number, games: number): number | null {
  if (games === 0) return null;
  const p = wins / games;
  return Math.round(196 * Math.sqrt((p * (1 - p)) / games)) / 10;
}

function rate(wins: number, games: number): SeasonReportRate {
  return {
    games,
    restedTeamWins: wins,
    winPct: winPct(wins, games),
    band: winRateBand(wins, games),
  };
}

/** The RA tier published per season alongside the overall rate. RA≥5 and ≥7 are not. */
const SECOND_TIER_THRESHOLD = 2;

export function buildSeasonReport(
  season: string,
  rows: readonly SeasonReportRow[]
): SeasonReport {
  let completedGames = 0;
  let overallGames = 0;
  let overallWins = 0;
  let tierGames = 0;
  let tierWins = 0;

  for (const row of rows) {
    if (row.home === null || row.away === null) continue;
    if (row.homeScore === null || row.awayScore === null) continue;
    completedGames++;

    const homeFatigue = Number.parseFloat(row.home.fatigueScore);
    const awayFatigue = Number.parseFloat(row.away.fatigueScore);
    const { differential, advantageTeam } = classifyRestAdvantage(homeFatigue, awayFatigue);
    if (advantageTeam === "neutral") continue;

    const homeWon = row.homeScore > row.awayScore;
    const restedTeamWon = advantageTeam === "home" ? homeWon : !homeWon;

    overallGames++;
    if (restedTeamWon) overallWins++;
    if (Math.abs(differential) >= SECOND_TIER_THRESHOLD) {
      tierGames++;
      if (restedTeamWon) tierWins++;
    }
  }

  return {
    season,
    scheduledGames: rows.length,
    completedGames,
    overall: rate(overallWins, overallGames),
    atLeastTwo: rate(tierWins, tierGames),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the failing anti-drift test**

This is the most important test in the plan. `/analysis` and `/season` both publish "the rest-advantage win rate for season X". Two code paths computing one statistic is exactly where drift happens; this makes divergence a build failure.

Append to `src/lib/__tests__/season-report.test.ts`:

```ts
import { buildHistoricalBacktest, type HistoricalGameEvidenceRow } from "@/lib/rest-advantage-evidence";

/** The same game, in the shape the /analysis reducer consumes. */
function toEvidenceRow(row: SeasonReportRow, season: string): HistoricalGameEvidenceRow {
  return {
    date: row.date,
    season,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    // Only called for rows both reducers accept, so the sides are present.
    homeFatigueScore: row.home!.fatigueScore,
    awayFatigueScore: row.away!.fatigueScore,
  };
}

describe("buildSeasonReport vs buildHistoricalBacktest", () => {
  it("reports the identical rest win rate for a season, so the two pages cannot drift", () => {
    // A spread of gaps and outcomes: neutral, sub-2, over-2, both sides rested, both results.
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, home: side(1), away: side(5) }),                          // 4.0 home, HIT
      game({ gameId: 2, home: side(5), away: side(1) }),                          // 4.0 away, MISS
      game({ gameId: 3, home: side(1), away: side(1.2) }),                        // neutral
      game({ gameId: 4, home: side(2), away: side(3) }),                          // 1.0 home, HIT
      game({ gameId: 5, home: side(3), away: side(2), homeScore: 88, awayScore: 99 }), // 1.0 away, HIT
      game({ gameId: 6, home: side(1), away: side(9), homeScore: 90, awayScore: 100 }), // 8.0 home, MISS
    ];

    const report = buildSeasonReport("2024-25", rows);
    const backtest = buildHistoricalBacktest(rows.map((r) => toEvidenceRow(r, "2024-25")));
    const season = backtest.seasonWinRates.find((s) => s.season === "2024-25");

    expect(season).toBeDefined();
    expect(report.overall.games).toBe(season!.games);
    expect(report.overall.restedTeamWins).toBe(season!.restedTeamWins);
    expect(report.overall.winPct).toBe(season!.winPct);
  });

  it("matches the backtest's own RA >= 2 bucket", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, home: side(1), away: side(5) }),
      game({ gameId: 2, home: side(2), away: side(3) }),
      game({ gameId: 3, home: side(1), away: side(9), homeScore: 90, awayScore: 100 }),
    ];

    const report = buildSeasonReport("2024-25", rows);
    const bucket = buildHistoricalBacktest(
      rows.map((r) => toEvidenceRow(r, "2024-25"))
    ).thresholds.find((t) => t.threshold === 2);

    expect(bucket).toBeDefined();
    expect(report.atLeastTwo.games).toBe(bucket!.games);
    expect(report.atLeastTwo.restedTeamWins).toBe(bucket!.restedTeamWins);
    expect(report.atLeastTwo.winPct).toBe(bucket!.winPct);
  });
});
```

- [ ] **Step 7: Run the anti-drift tests**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: PASS, 11 tests. If either drift test fails, the reducer diverges from `/analysis` — fix `season-report.ts`, never the assertion.

- [ ] **Step 8: Prove the drift test discriminates**

A test that cannot fail is not a test. Temporarily break the reducer and confirm it catches it.

In `src/lib/season-report.ts`, change `if (advantageTeam === "neutral") continue;` to `if (advantageTeam === "neutral") { overallGames++; continue; }`.

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: FAIL on "reports the identical rest win rate".

Now revert that one line and re-run. Expected: PASS, 11 tests.

- [ ] **Step 9: Typecheck, lint and commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/season-report.ts src/lib/__tests__/season-report.test.ts src/lib/rest-advantage-evidence.ts
git commit -m "Add the Season Report reducer with an anti-drift test against the backtest"
```

---

### Task 2: Per-team sections — rest edge conversion and schedule tax

**Files:**
- Modify: `src/lib/season-report.ts`
- Modify: `src/lib/__tests__/season-report.test.ts`

**Interfaces:**
- Consumes: `SeasonReportRow`, `SeasonReportSide`, `buildSeasonReport` from Task 1.
- Produces: `SeasonReportTeam` with fields `teamId`, `restedGames`, `restedWins`, `restedWinPct`, `tiredGames`, `tiredWins`, `tiredWinPct`, `swing`, `travelMiles`, `backToBacks`, `threeInFours`, `jetLagGames`; and `SeasonReport.teams: SeasonReportTeam[]`. Task 4 maps `teamId` to a name; Task 6 renders both sections from this one array.

Two sections share one array because they share one grain — the team-season — and splitting them would mean two passes over the same rows for no gain.

**The measured reason `swing` exists:** raw win-when-rested is a standings table. In 2025-26 OKC won 83% of its rested games and 70% of its tired ones; UTA won 20% and 33%. Subtracting each team's own tired rate makes the team its own control, which is the only version that answers "who squanders a rest edge". `swing` carries ~12pp of standard error on ~30+30 games, so Task 6 renders it as a record table and crowns nobody.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/season-report.test.ts`:

```ts
describe("buildSeasonReport — rest edge conversion", () => {
  it("scores each team against its own tired record, not the league's", () => {
    const rows: SeasonReportRow[] = [
      // Team 1 rested and wins twice.
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 2, home: side(1), away: side(4) }),
      game({ gameId: 2, homeTeamId: 1, awayTeamId: 3, home: side(1), away: side(4) }),
      // Team 1 tired and loses twice (it is away, and away loses 90-100).
      game({ gameId: 3, homeTeamId: 2, awayTeamId: 1, home: side(1), away: side(4) }),
      game({ gameId: 4, homeTeamId: 3, awayTeamId: 1, home: side(1), away: side(4) }),
    ];

    const team1 = buildSeasonReport("2025-26", rows).teams.find((t) => t.teamId === 1);

    expect(team1).toMatchObject({
      restedGames: 2,
      restedWins: 2,
      restedWinPct: 100,
      tiredGames: 2,
      tiredWins: 0,
      tiredWinPct: 0,
      swing: 100,
    });
  });

  it("leaves swing null when a team has no games on one side of the split", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 2, home: side(1), away: side(4) }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    expect(teams.find((t) => t.teamId === 1)).toMatchObject({ tiredGames: 0, swing: null });
    expect(teams.find((t) => t.teamId === 2)).toMatchObject({ restedGames: 0, swing: null });
  });

  it("sorts by swing descending, nulls last, tie-broken on teamId", () => {
    const rows: SeasonReportRow[] = [
      // Home is the fresher side and home always wins here, so whoever is home is
      // rested-and-won and whoever is away is tired-and-lost. Teams 3 and 4 each get
      // one of each → swing +100 both.
      game({ gameId: 1, homeTeamId: 3, awayTeamId: 4, home: side(1), away: side(4) }),
      game({ gameId: 2, homeTeamId: 4, awayTeamId: 3, home: side(1), away: side(4) }),
      // Away is the fresher side and away always loses, so teams 5 and 6 are each
      // rested-and-lost once and tired-and-won once → swing −100 both.
      game({ gameId: 3, homeTeamId: 6, awayTeamId: 5, home: side(4), away: side(1) }),
      game({ gameId: 4, homeTeamId: 5, awayTeamId: 6, home: side(4), away: side(1) }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    // +100 pair first in teamId order, then the −100 pair in teamId order.
    expect(teams.map((t) => t.teamId)).toEqual([3, 4, 5, 6]);
    expect(teams.map((t) => t.swing)).toEqual([100, 100, -100, -100]);
  });

  it("puts every null swing after every scored one, whatever the teamIds", () => {
    const rows: SeasonReportRow[] = [
      // Team 1 is the fresher side here and wins → rested 1-0.
      game({ gameId: 1, homeTeamId: 1, awayTeamId: 9, home: side(1), away: side(4) }),
      // Team 1 is the tireder side here and loses → tired 0-1. Team 2 only ever rests.
      game({ gameId: 2, homeTeamId: 2, awayTeamId: 1, home: side(1), away: side(4) }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    // Team 1 has both arms (+100); teams 2 and 9 have one arm each, so they trail in teamId order.
    expect(teams.map((t) => t.teamId)).toEqual([1, 2, 9]);
    expect(teams.map((t) => t.swing)).toEqual([100, null, null]);
  });
});

describe("buildSeasonReport — schedule tax", () => {
  it("counts schedule facts on every completed game, including neutral ones", () => {
    const rows: SeasonReportRow[] = [
      game({
        gameId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        // Neutral, so this game contributes to no rate at all.
        home: side(1, { travelDistanceMiles: "500.4", isBackToBack: true }),
        away: side(1.2, { travelDistanceMiles: "1200.6", isThreeInFour: true, hasTimeZoneDisplacement: true }),
      }),
    ];

    const teams = buildSeasonReport("2025-26", rows).teams;

    expect(teams.find((t) => t.teamId === 1)).toMatchObject({
      restedGames: 0,
      tiredGames: 0,
      travelMiles: 500,
      backToBacks: 1,
      threeInFours: 0,
      jetLagGames: 0,
    });
    expect(teams.find((t) => t.teamId === 2)).toMatchObject({
      travelMiles: 1201,
      backToBacks: 0,
      threeInFours: 1,
      jetLagGames: 1,
    });
  });

  it("ignores games without a final score, so future travel is not counted as flown", () => {
    const rows: SeasonReportRow[] = [
      game({
        gameId: 1,
        homeTeamId: 1,
        homeScore: null,
        awayScore: null,
        home: side(1, { travelDistanceMiles: "999" }),
      }),
    ];

    expect(buildSeasonReport("2025-26", rows).teams).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: FAIL — `report.teams` is undefined.

- [ ] **Step 3: Implement the team grain**

In `src/lib/season-report.ts`, add the type after `SeasonReportRate`:

```ts
/**
 * One team's season, at the only grain both per-team sections need.
 *
 * `swing` is the section's whole point. A raw win-rate-when-rested column ranks
 * team quality: in 2025-26 OKC won 83% of its rested games and also 70% of its
 * tired ones. Subtracting a team's own tired rate makes it its own control.
 * On ~30 games per arm that difference carries ~12pp of standard error, so it is
 * a record, not a ranking — the UI must not crown a winner on it.
 */
export interface SeasonReportTeam {
  teamId: number;
  /** Games this team entered as the fresher side (edge ≥ 0.5), and its record there. */
  restedGames: number;
  restedWins: number;
  /** Null when `restedGames` is 0 — distinct from a genuine 0%. */
  restedWinPct: number | null;
  tiredGames: number;
  tiredWins: number;
  tiredWinPct: number | null;
  /** restedWinPct − tiredWinPct, one decimal. Null when either arm is empty. */
  swing: number | null;
  /** Schedule facts. Counted on every completed game, decidable or not. */
  travelMiles: number;
  backToBacks: number;
  threeInFours: number;
  jetLagGames: number;
}
```

Add `teams: SeasonReportTeam[];` to `SeasonReport`.

Add these two helpers above `buildSeasonReport`:

```ts
/**
 * Mutable accumulator. The percentages and the swing are derived once at the end;
 * `travelMiles` accumulates as a float here and is rounded in the same place.
 */
type TeamAccumulator = Omit<SeasonReportTeam, "restedWinPct" | "tiredWinPct" | "swing">;

function teamEntry(teams: Map<number, TeamAccumulator>, teamId: number): TeamAccumulator {
  const existing = teams.get(teamId);
  if (existing !== undefined) return existing;

  const created: TeamAccumulator = {
    teamId,
    restedGames: 0,
    restedWins: 0,
    tiredGames: 0,
    tiredWins: 0,
    travelMiles: 0,
    backToBacks: 0,
    threeInFours: 0,
    jetLagGames: 0,
  };
  teams.set(teamId, created);
  return created;
}

/** The schedule facts, which are true of a game whether or not its rest gap was decidable. */
function accumulateScheduleTax(entry: TeamAccumulator, side: SeasonReportSide): void {
  entry.travelMiles += Number.parseFloat(side.travelDistanceMiles);
  if (side.isBackToBack) entry.backToBacks++;
  if (side.isThreeInFour) entry.threeInFours++;
  if (side.hasTimeZoneDisplacement) entry.jetLagGames++;
}
```

In `buildSeasonReport`, declare the map beside the counters:

```ts
  const teams = new Map<number, TeamAccumulator>();
```

Accumulate the schedule facts immediately **after** the two `Number.parseFloat` lines that
produce `homeFatigue` and `awayFatigue` — not straight after `completedGames++`. Task 3 adds
the fatigue-calendar bucket to this same spot and needs both parsed scores available, so
putting these two lines below the parse now saves shuffling them later:

```ts
    accumulateScheduleTax(teamEntry(teams, row.homeTeamId), row.home);
    accumulateScheduleTax(teamEntry(teams, row.awayTeamId), row.away);
```

After the `if (Math.abs(differential) >= SECOND_TIER_THRESHOLD)` block, record the split:

```ts
    const restedTeamId = advantageTeam === "home" ? row.homeTeamId : row.awayTeamId;
    const tiredTeamId = advantageTeam === "home" ? row.awayTeamId : row.homeTeamId;

    const rested = teamEntry(teams, restedTeamId);
    rested.restedGames++;
    if (restedTeamWon) rested.restedWins++;

    const tired = teamEntry(teams, tiredTeamId);
    tired.tiredGames++;
    if (!restedTeamWon) tired.tiredWins++;
```

Before the `return`, finalize and sort:

```ts
  const teamRows: SeasonReportTeam[] = [...teams.values()].map((t) => {
    const restedWinPct = t.restedGames > 0 ? winPct(t.restedWins, t.restedGames) : null;
    const tiredWinPct = t.tiredGames > 0 ? winPct(t.tiredWins, t.tiredGames) : null;
    return {
      ...t,
      restedWinPct,
      tiredWinPct,
      swing:
        restedWinPct === null || tiredWinPct === null
          ? null
          : Math.round((restedWinPct - tiredWinPct) * 10) / 10,
      travelMiles: Math.round(t.travelMiles),
    };
  });

  // Nulls last, explicitly. A `(b.swing ?? -Infinity) - (a.swing ?? -Infinity)` comparator
  // returns NaN when both are null, which leaves the order down to the sort implementation.
  teamRows.sort((a, b) => {
    if (a.swing === null && b.swing === null) return a.teamId - b.teamId;
    if (a.swing === null) return 1;
    if (b.swing === null) return -1;
    return b.swing - a.swing || a.teamId - b.teamId;
  });
```

Add `teams: teamRows,` to the returned object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: PASS, 16 tests. The Task 1 drift tests must still pass — they assert on `overall`/`atLeastTwo`, which this task does not touch.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/season-report.ts src/lib/__tests__/season-report.test.ts
git commit -m "Compute rest edge conversion and schedule tax per team"
```

---

### Task 3: Game-grain sections — loudest calls and the fatigue calendar

**Files:**
- Modify: `src/lib/season-report.ts`
- Modify: `src/lib/__tests__/season-report.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `SeasonReportCall` (`gameId`, `date`, `homeTeamId`, `awayTeamId`, `homeScore`, `awayScore`, `restAdvantage`, `advantageTeam`, `restedTeamWon`, `restedMargin`), `SeasonReportWeek` (`week`, `startDate`, `games`, `avgFatigue`), plus `SeasonReport.loudestCalls` and `SeasonReport.weeks`. Also `seasonReportVerdict` and `allSeasonNormExcluding`, both consumed by Task 6.

**Why loudest calls rank by rest advantage, not margin:** margin and rest gap are uncorrelated. Ranking 2025-26's correct calls by margin surfaces BKN@DET (+53 at RA 1.57) and PHX@OKC (+49 at RA 1.01) — blowouts the model had no conviction about. Ranking by conviction and tagging the result puts hits and misses in one honest table.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/season-report.test.ts`:

```ts
import { allSeasonNormExcluding, seasonReportVerdict } from "@/lib/season-report";

describe("buildSeasonReport — loudest calls", () => {
  it("ranks by rest advantage rather than margin, and signs the margin from the rested side", () => {
    const rows: SeasonReportRow[] = [
      // Small gap, huge margin. Must NOT outrank the game below.
      game({ gameId: 1, home: side(1), away: side(2), homeScore: 140, awayScore: 90 }),
      // Big gap, small margin, and the rested side lost.
      game({ gameId: 2, home: side(1), away: side(9), homeScore: 98, awayScore: 100 }),
    ];

    const calls = buildSeasonReport("2025-26", rows).loudestCalls;

    expect(calls.map((c) => c.gameId)).toEqual([2, 1]);
    expect(calls[0]).toMatchObject({
      restAdvantage: 8,
      advantageTeam: "home",
      restedTeamWon: false,
      restedMargin: -2,
    });
    expect(calls[1]).toMatchObject({ restedTeamWon: true, restedMargin: 50 });
  });

  it("keeps at most ten, tie-broken on date then gameId", () => {
    const rows: SeasonReportRow[] = Array.from({ length: 12 }, (_, i) =>
      game({ gameId: 100 - i, date: "2025-11-02", home: side(1), away: side(4) })
    );

    const calls = buildSeasonReport("2025-26", rows).loudestCalls;

    expect(calls).toHaveLength(10);
    // Every gap is identical, so the tie-break decides: ascending gameId.
    expect(calls.map((c) => c.gameId)).toEqual([89, 90, 91, 92, 93, 94, 95, 96, 97, 98]);
  });

  it("excludes neutral games — a call the model never made is not a loud one", () => {
    const rows: SeasonReportRow[] = [game({ gameId: 1, home: side(1), away: side(1.2) })];

    expect(buildSeasonReport("2025-26", rows).loudestCalls).toEqual([]);
  });
});

describe("buildSeasonReport — fatigue calendar", () => {
  it("buckets into seven-day weeks counted from the season's first game", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, date: "2025-10-21", home: side(2), away: side(4) }), // week 1
      game({ gameId: 2, date: "2025-10-27", home: side(3), away: side(3) }), // week 1 (day 6)
      game({ gameId: 3, date: "2025-10-28", home: side(6), away: side(8) }), // week 2 (day 7)
    ];

    const weeks = buildSeasonReport("2025-26", rows).weeks;

    expect(weeks).toEqual([
      { week: 1, startDate: "2025-10-21", games: 2, avgFatigue: 3 },
      { week: 2, startDate: "2025-10-28", games: 1, avgFatigue: 7 },
    ]);
  });

  it("averages across both sides of every completed game, decidable or not", () => {
    const rows: SeasonReportRow[] = [
      game({ gameId: 1, date: "2025-10-21", home: side(1), away: side(1.2) }), // neutral
    ];

    expect(buildSeasonReport("2025-26", rows).weeks).toEqual([
      { week: 1, startDate: "2025-10-21", games: 1, avgFatigue: 1.1 },
    ]);
  });

  it("has no weeks at all for a season with nothing completed", () => {
    expect(buildSeasonReport("2025-26", []).weeks).toEqual([]);
  });
});

describe("allSeasonNormExcluding", () => {
  it("drops the displayed season so it is not compared against itself", () => {
    const norm = allSeasonNormExcluding(
      [
        { season: "2024-25", games: 100, restedTeamWins: 60 },
        { season: "2025-26", games: 100, restedTeamWins: 40 },
      ],
      "2025-26"
    );

    expect(norm).toBe(60);
  });

  it("pools games rather than averaging season rates", () => {
    // 90 of 200 = 45%. Averaging the two rates would give 50%.
    const norm = allSeasonNormExcluding(
      [
        { season: "2023-24", games: 100, restedTeamWins: 80 },
        { season: "2024-25", games: 100, restedTeamWins: 10 },
      ],
      "2025-26"
    );

    expect(norm).toBe(45);
  });

  it("is null when the displayed season is the only one", () => {
    expect(
      allSeasonNormExcluding([{ season: "2025-26", games: 100, restedTeamWins: 50 }], "2025-26")
    ).toBeNull();
  });
});

describe("seasonReportVerdict", () => {
  const rateOf = (wins: number, games: number): SeasonReportRate => ({
    games,
    restedTeamWins: wins,
    winPct: Math.round((wins / games) * 1000) / 10,
    band: winRateBand(wins, games),
  });

  it("is too early below the gate, however far the rate sits from the norm", () => {
    expect(seasonReportVerdict(rateOf(99, 99), 55.6)).toEqual({ kind: "tooEarly", games: 99 });
  });

  it("is too early when no norm is available", () => {
    expect(seasonReportVerdict(rateOf(500, 1000), null)).toEqual({ kind: "tooEarly", games: 1000 });
  });

  it("is in line when the gap falls inside the band", () => {
    // 52% of 940 → band 3.2, so a 54.0 norm is 2.0 away and inside it.
    const verdict = seasonReportVerdict(rateOf(489, 940), 54);

    expect(verdict.kind).toBe("inLine");
  });

  it("is below when the norm sits outside the band above the rate", () => {
    const verdict = seasonReportVerdict(rateOf(489, 940), 55.6);

    expect(verdict).toMatchObject({ kind: "below", norm: 55.6, band: 3.2 });
  });

  it("is above when the rate clears the norm by more than the band", () => {
    const verdict = seasonReportVerdict(rateOf(600, 940), 55.6);

    expect(verdict.kind).toBe("above");
  });
});
```

Add `type SeasonReportRate` to the `@/lib/season-report` import list at the top of the test file — `rateOf` above is annotated with it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: FAIL — `loudestCalls` undefined and `seasonReportVerdict` not exported.

- [ ] **Step 3: Implement both sections plus the verdict**

In `src/lib/season-report.ts`, add to the imports:

```ts
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
```

Add the constants beside the existing ones:

```ts
/** How many games the loudest-calls table holds. */
const LOUDEST_CALL_COUNT = 10;

/** Days per fatigue-calendar bucket, counted from the season's first game. */
const CALENDAR_BUCKET_DAYS = 7;
```

Add the types after `SeasonReportTeam`:

```ts
/**
 * One game the model had an opinion about, ranked by how loud that opinion was.
 *
 * Ranked by rest advantage and NOT by margin: the two are uncorrelated, so a
 * margin ranking surfaces blowouts the model had no conviction about (2025-26's
 * biggest "correct" margins sat at rest gaps of 1.0 and 1.6). Conviction plus
 * the result is the honest ordering, and it puts hits and misses in one table.
 */
export interface SeasonReportCall {
  gameId: number;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  /** Absolute rest advantage to two decimals. */
  restAdvantage: number;
  advantageTeam: "home" | "away";
  restedTeamWon: boolean;
  /** Final margin from the rested side's view, so a miss is negative. */
  restedMargin: number;
}

/** One seven-day bucket of the season, for the league fatigue curve. */
export interface SeasonReportWeek {
  /** 1-based. */
  week: number;
  /** First calendar day of the bucket, YYYY-MM-DD. */
  startDate: string;
  games: number;
  /** Mean fatigue over both sides of every completed game in the bucket, two decimals. */
  avgFatigue: number;
}

/**
 * The one sentence under the tiles. Three states and no superlative: a "biggest
 * gap since 2011-12" claim reads as a finding and is a ranking of noise.
 */
export type SeasonReportVerdict =
  | { kind: "tooEarly"; games: number }
  | { kind: "inLine"; winPct: number; band: number; norm: number }
  | { kind: "above"; winPct: number; band: number; norm: number }
  | { kind: "below"; winPct: number; band: number; norm: number };
```

Add `loudestCalls: SeasonReportCall[];` and `weeks: SeasonReportWeek[];` to `SeasonReport`.

Add the bucket helper above `buildSeasonReport`:

```ts
/**
 * Which seven-day bucket a date falls in, counted from the season's first game.
 *
 * Bucketed off the first game rather than by ISO week so the first bucket is
 * always full and no season opens with a two-day sliver that reads as a quiet week.
 */
function bucketIndex(firstDate: string, date: string): number {
  const days = differenceInCalendarDays(parseISO(date), parseISO(firstDate));
  return Math.floor(days / CALENDAR_BUCKET_DAYS);
}
```

In `buildSeasonReport`, declare the accumulators beside `teams`:

```ts
  const calls: SeasonReportCall[] = [];
  const buckets = new Map<number, { games: number; fatigueSum: number }>();
  // Rows arrive date-ascending from the query, so the first completed game dates the calendar.
  let firstDate: string | null = null;
```

Immediately after the two `accumulateScheduleTax` lines:

```ts
    if (firstDate === null) firstDate = row.date;
    const week = bucketIndex(firstDate, row.date);
    const bucket = buckets.get(week) ?? { games: 0, fatigueSum: 0 };
    bucket.games++;
    bucket.fatigueSum += homeFatigue + awayFatigue;
    buckets.set(week, bucket);
```

This must sit **after** `homeFatigue`/`awayFatigue` are parsed. Move those two `const` lines above the `accumulateScheduleTax` calls if they are not already there.

At the end of the loop body, after the rested/tired accumulation:

```ts
    calls.push({
      gameId: row.gameId,
      date: row.date,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      restAdvantage: Math.round(Math.abs(differential) * 100) / 100,
      advantageTeam,
      restedTeamWon,
      restedMargin:
        advantageTeam === "home"
          ? row.homeScore - row.awayScore
          : row.awayScore - row.homeScore,
    });
```

Before the `return`, finalize both:

```ts
  calls.sort(
    (a, b) =>
      b.restAdvantage - a.restAdvantage ||
      a.date.localeCompare(b.date) ||
      a.gameId - b.gameId
  );

  const weeks: SeasonReportWeek[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, bucket]) => ({
      week: index + 1,
      // firstDate is non-null whenever a bucket exists — a bucket is only ever created
      // on the same line that sets it.
      startDate: format(
        addDays(parseISO(firstDate as string), index * CALENDAR_BUCKET_DAYS),
        "yyyy-MM-dd"
      ),
      games: bucket.games,
      // Two sides per game, so the denominator is games * 2.
      avgFatigue: Math.round((bucket.fatigueSum / (bucket.games * 2)) * 100) / 100,
    }));
```

Add `loudestCalls: calls.slice(0, LOUDEST_CALL_COUNT),` and `weeks,` to the returned object.

Finally, append the two pure exports at the end of the file:

```ts
/**
 * The all-season rest win rate with one season withheld.
 *
 * Withheld because a page that compares 2025-26 against a baseline containing
 * 2025-26 is grading against itself. Games are pooled rather than season rates
 * averaged, so a short season cannot weigh as much as a full one.
 */
export function allSeasonNormExcluding(
  seasonWinRates: readonly { season: string; games: number; restedTeamWins: number }[],
  season: string
): number | null {
  let games = 0;
  let wins = 0;
  for (const row of seasonWinRates) {
    if (row.season === season) continue;
    games += row.games;
    wins += row.restedTeamWins;
  }
  return games === 0 ? null : winPct(wins, games);
}

/**
 * Which of the three things the page is allowed to say about a season's rate.
 *
 * "Inside the band" means the season and the norm are not distinguishable at
 * this sample size, which is the common case: a full season carries ±3.2pp and
 * seasons rarely move further than that.
 */
export function seasonReportVerdict(
  rate: SeasonReportRate,
  norm: number | null
): SeasonReportVerdict {
  if (rate.games < MIN_GAMES_FOR_INFERENCE || rate.band === null || norm === null) {
    return { kind: "tooEarly", games: rate.games };
  }

  const delta = rate.winPct - norm;
  const shared = { winPct: rate.winPct, band: rate.band, norm };
  if (Math.abs(delta) <= rate.band) return { kind: "inLine", ...shared };
  return { kind: delta > 0 ? "above" : "below", ...shared };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/season-report.test.ts`
Expected: PASS, 30 tests.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/season-report.ts src/lib/__tests__/season-report.test.ts
git commit -m "Add loudest calls, the fatigue calendar and the season verdict"
```

---

### Task 4: Data layer — query, server module, API route

**Files:**
- Modify: `src/lib/db/queries.ts:61-73` (add one column to `FATIGUE_COLUMNS`), and append `getSeasonReportRows`
- Create: `src/lib/season-report-server.ts`
- Create: `src/app/api/season-report/route.ts`

**Interfaces:**
- Consumes: `buildSeasonReport`, `SeasonReportRow`, `SeasonReport`, `SeasonReportTeam` from Tasks 1–3; `getTeamDirectory`, `latestFatigueSubquery`, `gameIsNormallyPlayed` from `queries.ts`; `jsonRoute`, `seasonParam` from `@/lib/api-route`.
- Produces: `getSeasonReportRows(season): Promise<SeasonReportRow[]>`, `getSeasonReport(season): Promise<SeasonReportResponse>`, and `SeasonReportResponse` (declared in `season-report.ts`) which Task 6 consumes. `GET /api/season-report?season=YYYY-YY`.

- [ ] **Step 1: Add `isThreeInFour` to the shared fatigue columns**

`FATIGUE_COLUMNS` (`src/lib/db/queries.ts:61`) does not currently select `isThreeInFour`, and the schedule-tax section needs it. Add one line:

```ts
  isThreeInFour: fatigueScores.isThreeInFour,
```

Purely additive: both consumers of the constant (`latestFatigueSubquery`, `latestFatigueLateral`) widen their projection, and every outer query names the fields it wants, so nothing else changes. `/schedule` derives its own three-in-four figure from dates and is untouched.

- [ ] **Step 2: Write the query**

Append to `src/lib/db/queries.ts`. Import the row type at the top beside the existing `DisparityGameRow` import:

```ts
import type { SeasonReportRow } from "@/lib/season-report";
```

```ts
/**
 * Every regular-season game in one season with both sides' latest fatigue row.
 *
 * LEFT joins and no status filter, unlike `getCompletedGamesWithFatigue`: the
 * progress tile needs a count of the season's scheduled games, and the reducer
 * is what decides that a game without a score or without both fatigue sides
 * contributes to no aggregate. `gameIsNormallyPlayed` still applies — the 2019-20
 * bubble is not games anyone travelled to.
 */
export async function getSeasonReportRows(season: string): Promise<SeasonReportRow[]> {
  const homeFatigue = latestFatigueSubquery("home_fatigue_season_report");
  const awayFatigue = latestFatigueSubquery("away_fatigue_season_report");

  const rows = await db
    .select({
      gameId: games.id,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeIsThreeInFour: homeFatigue.isThreeInFour,
      homeHasTimeZoneDisplacement: homeFatigue.hasTimeZoneDisplacement,
      awayFatigueScore: awayFatigue.score,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayIsThreeInFour: awayFatigue.isThreeInFour,
      awayHasTimeZoneDisplacement: awayFatigue.hasTimeZoneDisplacement,
    })
    .from(games)
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(
      and(eq(games.season, season), eq(games.gameType, "regular"), gameIsNormallyPlayed)
    )
    // Date-ascending is a contract, not a convenience: the reducer dates its fatigue
    // calendar from the first row it accepts.
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    gameId: Number(r.gameId),
    date: String(r.date),
    homeTeamId: Number(r.homeTeamId),
    awayTeamId: Number(r.awayTeamId),
    homeScore: r.homeScore === null ? null : Number(r.homeScore),
    awayScore: r.awayScore === null ? null : Number(r.awayScore),
    home:
      r.homeFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.homeFatigueScore),
            travelDistanceMiles: String(r.homeTravelDistanceMiles),
            isBackToBack: Boolean(r.homeIsBackToBack),
            isThreeInFour: Boolean(r.homeIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.homeHasTimeZoneDisplacement),
          },
    away:
      r.awayFatigueScore === null
        ? null
        : {
            fatigueScore: String(r.awayFatigueScore),
            travelDistanceMiles: String(r.awayTravelDistanceMiles),
            isBackToBack: Boolean(r.awayIsBackToBack),
            isThreeInFour: Boolean(r.awayIsThreeInFour),
            hasTimeZoneDisplacement: Boolean(r.awayHasTimeZoneDisplacement),
          },
  }));
}
```

- [ ] **Step 3: Declare the response type**

Append to `src/lib/season-report.ts`:

```ts
/** A team row with the labels the UI needs, attached by the server module. */
export interface SeasonReportTeamLabelled extends SeasonReportTeam {
  abbreviation: string;
  name: string;
}

/** What `/api/season-report` returns. */
export interface SeasonReportResponse extends Omit<SeasonReport, "teams"> {
  teams: SeasonReportTeamLabelled[];
  /** True while any game in the season is unplayed, so the figures may still revise. */
  provisional: boolean;
  /** ET date the figures were computed, for the as-of line on a provisional season. */
  asOf: string;
}
```

- [ ] **Step 4: Write the server module**

Create `src/lib/season-report-server.ts`:

```ts
import { getSeasonReportRows, getTeamDirectory } from "@/lib/db/queries";
import { formatEasternDateKey } from "@/lib/nba-season";
import { buildSeasonReport, type SeasonReportResponse } from "@/lib/season-report";
import { getCompletedGamesStamp } from "@/lib/db/queries";

/**
 * One season's report, held until a game goes final.
 *
 * Same stamp trick as `rest-advantage-evidence-server.ts`, and the same reason:
 * the figures cannot change while no game has finished, and this reads every
 * game in a season with no LIMIT. Bounded by the season list, which is closed.
 */
let cache: { stamp: string; bySeason: Map<string, SeasonReportResponse> } | null = null;

/** Complete server-side Season Report operation, including retrieval. */
export async function getSeasonReport(season: string): Promise<SeasonReportResponse> {
  const stamp = await getCompletedGamesStamp();
  if (cache === null || cache.stamp !== stamp) {
    cache = { stamp, bySeason: new Map() };
  }

  const hit = cache.bySeason.get(season);
  if (hit !== undefined) return hit;

  const [rows, directory] = await Promise.all([
    getSeasonReportRows(season),
    getTeamDirectory(),
  ]);

  const report = buildSeasonReport(season, rows);
  const byId = new Map(directory.map((t) => [t.id, t]));

  const response: SeasonReportResponse = {
    ...report,
    teams: report.teams.map((t) => {
      const team = byId.get(t.teamId);
      return {
        ...t,
        abbreviation: team?.abbreviation ?? "—",
        name: team?.name ?? `Team ${t.teamId}`,
      };
    }),
    provisional: report.completedGames < report.scheduledGames,
    asOf: formatEasternDateKey(new Date()),
  };

  cache.bySeason.set(season, response);
  return response;
}
```

Merge the two `@/lib/db/queries` imports into one statement — the split above is for readability of the diff only.

- [ ] **Step 5: Write the route**

Create `src/app/api/season-report/route.ts`:

```ts
import { z } from "zod";
import { jsonRoute, seasonParam } from "@/lib/api-route";
import { NBA_SEASONS } from "@/lib/nba-season";
import { getSeasonReport } from "@/lib/season-report-server";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

// The shared season rule, not the browsable list: this page reports games that were played,
// so an upcoming season with no games is not a valid request. Defaults to the newest season
// with data, which is the current one by construction — NBA_SEASONS is derived from the ET date.
const seasonSchema = seasonParam.default(NBA_SEASONS[NBA_SEASONS.length - 1]);

export const GET = jsonRoute(
  "api/season-report",
  z.object({ season: seasonSchema }),
  ({ season }) => getSeasonReport(season)
);
```

- [ ] **Step 6: Verify the route against the live database**

```bash
pnpm dev
```

In another shell:

```bash
curl -s 'http://localhost:3000/api/season-report?season=2025-26' \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(d['season'], d['scheduledGames'], d['completedGames']); print('overall', d['overall']); print('teams', len(d['teams'])); print('calls', len(d['loudestCalls'])); print('weeks', len(d['weeks']))"
```

Expected, matching the figures measured during design:
- `2025-26 1230 1230`
- `overall {'games': 940, 'restedTeamWins': 489, 'winPct': 52.0, 'band': 3.2}`
- `teams 30`, `calls 10`, `weeks` around 26–27

Then confirm the two guards:

```bash
curl -s 'http://localhost:3000/api/season-report?season=1975-76' | head -c 200   # expect a 400 "Invalid season"
curl -s 'http://localhost:3000/api/season-report' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['season'])"  # expect 2025-26
```

If `overall` does not read exactly 940/489/52.0, stop and diagnose rather than adjusting the reducer to fit — Task 1's drift test pins this to `/analysis`, so a mismatch means the query is admitting or dropping games the backtest does not.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test:run
git add src/lib/db/queries.ts src/lib/season-report.ts src/lib/season-report-server.ts src/app/api/season-report/route.ts
git commit -m "Serve the Season Report over one season-scoped query"
```

---

### Task 5: Page shell, navigation and the scorecard

**Files:**
- Create: `src/app/season/page.tsx`
- Create: `src/components/season-report-lazy.tsx`
- Create: `src/components/season-report-content.tsx`
- Create: `e2e/season.spec.ts`
- Modify: `src/lib/primary-navigation.ts`
- Modify: `e2e/about.spec.ts:17` and `e2e/about.spec.ts:47`

**Interfaces:**
- Consumes: `SeasonReportResponse`, `seasonReportVerdict`, `allSeasonNormExcluding` from `@/lib/season-report`; `apiFetcher`; `AnalysisResponse` from `@/types`.
- Produces: a `SeasonReportContent` component rendering the selector, three tiles and the vs-history section. Task 6 adds sections to the same component; Task 7 appends the last one.

This task ships a working page with sections 1 and 2. Sections 3–7 land in Tasks 6 and 7.

- [ ] **Step 1: Add the nav entry**

In `src/lib/primary-navigation.ts`, insert as the **second** `DIRECT_NAV_ITEMS` entry, between `GAMES` and `SCHEDULE EDGE`:

```ts
  {
    href: "/season",
    // Not "SEASON REVIEW": review implies the season has ended, and this page runs live from
    // October. Not bare "SEASON": GAMES already browses any season's slate and SCHEDULE EDGE
    // already ranks teams inside one, so the noun alone collides with two tabs we own.
    label: "SEASON REPORT",
    guideDescription:
      "Read one season end to end — how the rest call scored, which teams converted a rest edge, and what the schedule cost each of them.",
  },
```

Second, not last: a reader who has just looked at today's games is one step from the season those games belong to. Moving it is a one-line change if the order reads wrong on screen.

- [ ] **Step 2: Update the two nav count assertions**

`e2e/about.spec.ts` asserts the nav has exactly five links, in two places. Change both `toHaveCount(5)` to `toHaveCount(6)`.

Do not touch `e2e/onboarding.spec.ts`: its copy must never state a count, because the guide renders all of `PRIMARY_NAV_ITEMS`.

- [ ] **Step 3: Write the failing e2e smoke test**

Create `e2e/season.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("Season Report", () => {
  test("renders the scorecard and switches season", async ({ page }) => {
    await page.goto("/season");

    await expect(page.getByRole("heading", { level: 1, name: "Season Report" })).toBeVisible();

    // The rate tile is data-dependent, so wait for it rather than for a fixed timeout.
    const rate = page.getByTestId("season-rest-win-rate");
    await expect(rate).toBeVisible();
    await expect(rate).not.toHaveText("");

    const selector = page.getByLabel("SEASON");
    await expect(selector).toHaveValue(/^\d{4}-\d{2}$/);

    await selector.selectOption("2015-16");
    await expect(page.getByTestId("season-vs-history-heading")).toHaveText("2015-16 VS HISTORY");
  });

  test("is reachable from the primary nav", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "SEASON REPORT" }).click();

    await expect(page).toHaveURL(/\/season$/);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test:e2e e2e/season.spec.ts`
Expected: FAIL — `/season` 404s.

- [ ] **Step 5: Write the content component**

Create `src/components/season-report-content.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { SeasonSelector } from "@/components/season-selector"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetcher } from "@/lib/fetcher"
import { NBA_SEASONS } from "@/lib/nba-season"
import {
  allSeasonNormExcluding,
  seasonReportVerdict,
  type SeasonReportRate,
  type SeasonReportResponse,
  type SeasonReportVerdict,
} from "@/lib/season-report"
import { termCardStyle } from "@/lib/terminal-styles"
import type { AnalysisResponse } from "@/types"

// The newest season with data, which is the current one by construction: NBA_SEASONS is
// derived from the ET date. No separate "is it the current season" question to get wrong.
const LATEST_SEASON = NBA_SEASONS[NBA_SEASONS.length - 1]

/** One decimal with a sign, for a swing or a gap. */
function signedPct(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`
}

function Tile({
  label,
  value,
  sub,
  accent = "var(--term-neutral)",
  testId,
}: {
  label: string
  value: string
  sub: string
  accent?: string
  testId?: string
}) {
  return (
    <div
      className="mono flex flex-col gap-2"
      style={{
        background: "var(--term-surface)",
        border: "1px solid var(--term-border)",
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--term-radius)",
        padding: "14px 14px 16px",
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 500 }}>
        {label}
      </span>
      <span
        className="tabular-nums"
        data-testid={testId}
        style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--term-text)", lineHeight: 1 }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--term-text-muted)" }}>{sub}</span>
    </div>
  )
}

/** A rate tile that refuses to print a number it cannot stand behind. */
function RateTile({ label, rate, testId }: { label: string; rate: SeasonReportRate; testId?: string }) {
  const gated = rate.band === null
  return (
    <Tile
      label={label}
      value={gated ? "—" : `${rate.winPct.toFixed(1)}%`}
      sub={
        gated
          ? "NO DECIDABLE GAMES YET"
          : `±${rate.band!.toFixed(1)} · ${rate.games.toLocaleString()} GAMES`
      }
      accent={gated ? "var(--term-neutral)" : "var(--term-blue)"}
      testId={testId}
    />
  )
}

function SectionDivider({ label, descriptor, testId }: { label: string; descriptor?: string; testId?: string }) {
  return (
    <div
      className="mono flex items-center gap-3 py-2"
      style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}
    >
      <span data-testid={testId} style={{ fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
      {descriptor ? <span style={{ fontWeight: 600 }}>{descriptor}</span> : null}
    </div>
  )
}

/** The one sentence under the tiles. Three states, no superlative. */
function VerdictLine({ verdict }: { verdict: SeasonReportVerdict }) {
  const { text, tone } =
    verdict.kind === "tooEarly"
      ? {
          text: `TOO EARLY TO CALL — ${verdict.games.toLocaleString()} DECIDABLE GAMES SO FAR`,
          tone: "var(--term-text-muted)",
        }
      : verdict.kind === "inLine"
        ? {
            text: `IN LINE WITH THE ALL-SEASON NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
            tone: "var(--term-text)",
          }
        : {
            text: `${verdict.kind === "above" ? "ABOVE" : "BELOW"} THE NORM — ${verdict.winPct.toFixed(1)}% ±${verdict.band.toFixed(1)} VS ${verdict.norm.toFixed(1)}%`,
            tone: verdict.kind === "above" ? "var(--term-blue)" : "var(--term-red)",
          }

  return (
    <p className="mono" style={{ fontSize: 12, letterSpacing: "0.04em", fontWeight: 600, color: tone }}>
      {text}
    </p>
  )
}

export function SeasonReportContent() {
  const [season, setSeason] = useState(LATEST_SEASON)

  const { data, error, isLoading } = useSWR<SeasonReportResponse>(
    `/api/season-report?season=${season}`,
    apiFetcher,
    { revalidateOnFocus: false }
  )

  // The all-season baseline. Season-independent, so it is fetched once and never refetched
  // when the selector moves.
  const { data: analysis } = useSWR<AnalysisResponse>("/api/analysis", apiFetcher, {
    revalidateOnFocus: false,
  })

  const norm = useMemo(
    () => (analysis ? allSeasonNormExcluding(analysis.seasonWinRates, season) : null),
    [analysis, season]
  )

  const verdict = useMemo(
    () => (data ? seasonReportVerdict(data.overall, norm) : null),
    [data, norm]
  )

  if (error) {
    return (
      <p className="mono" role="alert" style={{ fontSize: 12, color: "var(--term-red)" }}>
        FAILED TO LOAD THE SEASON REPORT.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-12">
      <div style={{ ...termCardStyle, padding: 18 }}>
        <SeasonSelector id="season-report-season" season={season} onSeasonChange={setSeason} />
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              className="h-[92px] w-full bg-[var(--term-surface-2)]"
              style={{ borderRadius: "var(--term-radius)" }}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <RateTile label="REST ADVANTAGE WIN RATE" rate={data.overall} testId="season-rest-win-rate" />
            <RateTile label="WIN RATE · RA ≥ 2" rate={data.atLeastTwo} />
            <Tile
              label="SEASON PROGRESS"
              value={`${data.completedGames.toLocaleString()} / ${data.scheduledGames.toLocaleString()}`}
              sub={
                data.scheduledGames === 0
                  ? "NO GAMES SCHEDULED"
                  : `${Math.round((data.completedGames / data.scheduledGames) * 100)}% PLAYED`
              }
            />
          </div>

          <div className="flex flex-col gap-3">
            <SectionDivider
              label={`${data.season} VS HISTORY`}
              descriptor="EXCLUDES THIS SEASON FROM THE NORM"
              testId="season-vs-history-heading"
            />
            {verdict ? <VerdictLine verdict={verdict} /> : null}
            <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
              A season yields roughly 940 games with a decidable rest gap, which is worth about
              three percentage points either way. Seasons move inside that range more often than
              they move outside it.{" "}
              <a href="/analysis" style={{ color: "var(--term-blue)", fontWeight: 600 }}>
                See the full backtest →
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write the skeleton and the page**

Create `src/components/season-report-lazy.tsx`:

```tsx
"use client"

import { lazyContent } from "@/components/lazy-content"
import { Skeleton } from "@/components/ui/skeleton"
import { termCardStyle } from "@/lib/terminal-styles"

export const SeasonReportContentLazy = lazyContent(
  () => import("@/components/season-report-content").then((m) => m.SeasonReportContent),
  () => (
    <div className="flex flex-col gap-12">
      <div style={termCardStyle}>
        <Skeleton className="h-4 w-32 bg-[var(--term-surface-2)]" style={{ borderRadius: "var(--term-radius)" }} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-[92px] w-full bg-[var(--term-surface-2)]"
            style={{ borderRadius: "var(--term-radius)" }}
          />
        ))}
      </div>
    </div>
  )
)
```

Create `src/app/season/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SeasonReportContentLazy } from "@/components/season-report-lazy";

export const metadata: Metadata = {
  title: "Season Report",
};

export default function SeasonPage() {
  return (
    <div className="flex flex-col gap-12">
      {/* No season in the heading: the selector below reaches back to 1985-86, so a title that
          named one would be wrong as soon as it moved. The sections carry the label instead. */}
      <PageHeader
        eyebrow="ONE SEASON, DEEP"
        title="Season Report"
        description="One NBA season read through rest and fatigue: how the rest-advantage call scored against its own history, which teams turned a rest edge into wins, the games the model was loudest about, and what the schedule actually cost each team."
        descriptionMaxWidth="36rem"
      />

      <SeasonReportContentLazy />
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e tests to verify they pass**

Run: `pnpm test:e2e e2e/season.spec.ts e2e/about.spec.ts`
Expected: PASS.

If the `2015-16 VS HISTORY` assertion flakes, the selector changed before SWR resolved — the heading reads from `data.season`, not from local state, which is deliberate so the label can never describe a season whose numbers are not on screen. Playwright's auto-retry covers the gap.

- [ ] **Step 8: Full verification and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test:run && pnpm test:e2e
git add src/app/season/page.tsx src/components/season-report-content.tsx src/components/season-report-lazy.tsx src/lib/primary-navigation.ts e2e/season.spec.ts e2e/about.spec.ts
git commit -m "Add the Season Report page, its nav tab and the season scorecard"
```

---

### Task 6: Sections 3–6 — conversion, loudest calls, schedule tax, fatigue calendar

**Files:**
- Modify: `src/components/season-report-content.tsx`
- Modify: `e2e/season.spec.ts`

**Interfaces:**
- Consumes: `SeasonReportResponse.teams`, `.loudestCalls`, `.weeks`; `SectionDivider`, `signedPct` from Task 5; `ExploreGameDetailModal` from `@/components/explore-game-detail-modal` (props `{gameId: number | null, open: boolean, onOpenChange: (open: boolean) => void}` — nothing page-specific, so it reuses as-is).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the assertions first**

Append to the first test in `e2e/season.spec.ts`, before its closing brace. These go **after**
the existing `selectOption("2015-16")` line, and that ordering is the point: the default season
is whatever is current, so in the opening days of a season these counts are legitimately near
zero and an assertion against the default would go red every October. 2015-16 is finished and
was a 30-team season, so it pins exact counts forever.

```ts
    // Still on 2015-16 from the season switch above: a complete 30-team season.
    await expect(page.getByTestId("edge-conversion-row")).toHaveCount(30);
    await expect(page.getByTestId("schedule-tax-row")).toHaveCount(30);

    // Section 4 caps at ten however many decidable games a season holds.
    await expect(page.getByTestId("loudest-call-row")).toHaveCount(10);

    await expect(page.getByTestId("fatigue-calendar")).toBeVisible();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:e2e e2e/season.spec.ts`
Expected: FAIL — no element with `data-testid="edge-conversion-row"`.

- [ ] **Step 3: Add the four sections**

In `src/components/season-report-content.tsx`, extend the imports:

```tsx
import { ExploreGameDetailModal } from "@/components/explore-game-detail-modal"
import { termTdStyle, termThStyle } from "@/lib/terminal-styles"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { SeasonReportCall, SeasonReportTeamLabelled, SeasonReportWeek } from "@/lib/season-report"
```

Add these components above `SeasonReportContent`:

```tsx
/** Blue positive, red negative, grey exactly even — the diverging pair the other pages use. */
function swingColor(swing: number | null): string {
  if (swing === null || swing === 0) return "var(--term-neutral)"
  return swing > 0 ? "var(--term-blue)" : "var(--term-red)"
}

/** A win-rate arm, or an em dash when the team never played on that side of the split. */
function armText(wins: number, games: number, pct: number | null): string {
  if (pct === null) return "—"
  return `${wins}-${games - wins} (${pct.toFixed(0)}%)`
}

/**
 * Rest edge conversion.
 *
 * A record table, deliberately not a ranking. Each team is measured against its own
 * tired record rather than the league's, because raw win-rate-when-rested ranks team
 * quality — but the difference of two ~30-game proportions still carries roughly twelve
 * points of standard error, so nothing here is crowned and every row shows its n.
 */
function EdgeConversion({ teams }: { teams: SeasonReportTeamLabelled[] }) {
  const thin = teams.filter((t) => t.restedGames < 10 || t.tiredGames < 10).length

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="REST EDGE CONVERSION" descriptor="RECORDS, NOT A RANKING" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        How much better each team played as the fresher side than as the tireder one. A team is
        its own comparison here, because win rate when rested on its own mostly ranks how good
        the team was. Roughly thirty games sit behind each arm, so treat these as records rather
        than as a table of who manages rest well.
      </p>
      <div className="overflow-x-auto">
        <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              <th style={termThStyle}>TEAM</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>RESTED</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>TIRED</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>SWING</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const thinRow = t.restedGames < 10 || t.tiredGames < 10
              return (
                <tr key={t.teamId} data-testid="edge-conversion-row" style={{ opacity: thinRow ? 0.45 : 1 }}>
                  <td style={termTdStyle}>{t.abbreviation}</td>
                  <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                    {armText(t.restedWins, t.restedGames, t.restedWinPct)}
                  </td>
                  <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                    {armText(t.tiredWins, t.tiredGames, t.tiredWinPct)}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ ...termTdStyle, textAlign: "right", color: swingColor(t.swing), fontWeight: 700 }}
                  >
                    {t.swing === null ? "—" : signedPct(t.swing)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {thin > 0 ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {thin} {thin === 1 ? "TEAM HAS" : "TEAMS HAVE"} FEWER THAN 10 GAMES ON ONE SIDE AND {thin === 1 ? "IS" : "ARE"} DIMMED
        </p>
      ) : null}
    </div>
  )
}

/**
 * Loudest calls.
 *
 * Ranked by rest gap and not by margin, because the two are uncorrelated: a
 * margin ranking fills up with blowouts the model had no opinion about.
 */
function LoudestCalls({
  calls,
  abbrById,
}: {
  calls: SeasonReportCall[]
  abbrById: Map<number, string>
}) {
  const [openGameId, setOpenGameId] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="LOUDEST CALLS" descriptor="RANKED BY REST GAP" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        The games this season where the two teams arrived in the most different states, whether
        or not it worked out. Ranked by the size of the rest gap rather than by the final margin,
        because the two have nothing to do with each other.
      </p>
      <div className="flex flex-col gap-[2px]">
        {calls.map((c) => (
          <button
            key={c.gameId}
            type="button"
            data-testid="loudest-call-row"
            onClick={() => setOpenGameId(c.gameId)}
            className="mono flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--term-surface-2)]"
            style={{
              background: "var(--term-surface)",
              border: "1px solid var(--term-border)",
              borderLeft: `2px solid ${c.restedTeamWon ? "var(--term-blue)" : "var(--term-red)"}`,
              borderRadius: "var(--term-radius)",
              fontSize: 12,
            }}
          >
            <span className="tabular-nums" style={{ color: "var(--term-text-muted)", minWidth: 84 }}>
              {c.date}
            </span>
            <span style={{ flex: 1, color: "var(--term-text)", fontWeight: 600 }}>
              {abbrById.get(c.awayTeamId) ?? "—"} @ {abbrById.get(c.homeTeamId) ?? "—"}
            </span>
            <span className="tabular-nums" style={{ color: "var(--term-text-muted)", minWidth: 64 }}>
              {c.awayScore}-{c.homeScore}
            </span>
            <span className="tabular-nums" style={{ color: "var(--term-text)", minWidth: 76 }}>
              RA {c.restAdvantage.toFixed(2)}
            </span>
            <span
              style={{
                minWidth: 72,
                textAlign: "right",
                fontWeight: 700,
                color: c.restedTeamWon ? "var(--term-blue)" : "var(--term-red)",
              }}
            >
              {c.restedTeamWon ? "HIT" : "MISS"} {signedPct(c.restedMargin).replace(".0", "")}
            </span>
          </button>
        ))}
      </div>
      <ExploreGameDetailModal
        gameId={openGameId}
        open={openGameId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenGameId(null)
        }}
      />
    </div>
  )
}

/** Schedule tax — facts about what each team was asked to do. No inference, so no gate. */
function ScheduleTax({ teams }: { teams: SeasonReportTeamLabelled[] }) {
  const byMiles = [...teams].sort((a, b) => b.travelMiles - a.travelMiles || a.teamId - b.teamId)
  const most = byMiles[0]
  const least = byMiles[byMiles.length - 1]

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="SCHEDULE TAX" descriptor="COMPLETED GAMES ONLY" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        What the schedule asked of each team. These are counts, not estimates — nothing here is
        a claim about who won because of it.
      </p>
      {most && least ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          {most.abbreviation} FLEW THE MOST AT {most.travelMiles.toLocaleString()} MILES ·{" "}
          {least.abbreviation} THE LEAST AT {least.travelMiles.toLocaleString()}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr>
              <th style={termThStyle}>TEAM</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>MILES FLOWN</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>BACK-TO-BACKS</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>3-IN-4</th>
              <th style={{ ...termThStyle, textAlign: "right" }}>JET LAG</th>
            </tr>
          </thead>
          <tbody>
            {byMiles.map((t) => (
              <tr key={t.teamId} data-testid="schedule-tax-row">
                <td style={termTdStyle}>{t.abbreviation}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                  {t.travelMiles.toLocaleString()}
                </td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.backToBacks}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.threeInFours}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{t.jetLagGames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The league's fatigue curve across the season, in seven-day buckets from the first game. */
function FatigueCalendar({ weeks }: { weeks: SeasonReportWeek[] }) {
  const peak = weeks.reduce<SeasonReportWeek | null>(
    (best, w) => (best === null || w.avgFatigue > best.avgFatigue ? w : best),
    null
  )

  return (
    <div className="flex flex-col gap-3">
      <SectionDivider label="FATIGUE CALENDAR" descriptor="LEAGUE AVERAGE BY WEEK" />
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        Average fatigue across every team in every game, week by week. The season is not evenly
        hard — density, travel and back-to-backs pile up in stretches.
      </p>
      {peak ? (
        <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
          PEAK: WEEK {peak.week} OF {weeks.length}, FROM {peak.startDate}, AT {peak.avgFatigue.toFixed(2)}
        </p>
      ) : null}
      <div data-testid="fatigue-calendar" style={{ ...termCardStyle, height: 220, padding: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--term-text-muted)" }}
              stroke="var(--term-border)"
              width={32}
            />
            <Bar dataKey="avgFatigue" fill="var(--term-hardwood)" maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

Then in `SeasonReportContent`, add the abbreviation lookup beside the other memos:

```tsx
  const abbrById = useMemo(
    () => new Map((data?.teams ?? []).map((t) => [t.teamId, t.abbreviation])),
    [data]
  )
```

and render the four sections after the vs-history block, inside the same fragment:

```tsx
          <EdgeConversion teams={data.teams} />
          <LoudestCalls calls={data.loudestCalls} abbrById={abbrById} />
          <ScheduleTax teams={data.teams} />
          <FatigueCalendar weeks={data.weeks} />
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `pnpm test:e2e e2e/season.spec.ts`
Expected: PASS.

- [ ] **Step 5: Look at the page**

```bash
pnpm dev
```

Open `http://localhost:3000/season` and check four things the tests cannot:
1. The swing column reads blue above zero and red below, and the dimmed rows are the thin ones.
2. `LOUDEST CALLS` row one is BKN@UTA on 2026-01-30, `RA 8.69`, `MISS −10`.
3. The fatigue calendar's bars are legible and its peak caption matches the tallest bar.
4. Nothing on the page states a season count, and switching to 2015-16 relabels every heading.

- [ ] **Step 6: Full verification and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test:run && pnpm test:e2e
git add src/components/season-report-content.tsx e2e/season.spec.ts
git commit -m "Render rest edge conversion, loudest calls, schedule tax and the fatigue calendar"
```

---

### Task 7: Section 7 — zero-rest workload

**Files:**
- Modify: `src/lib/player-rest.ts`
- Modify: `src/lib/__tests__/player-rest.test.ts`
- Create: `src/components/zero-rest-workload.tsx`
- Modify: `src/components/season-report-content.tsx`

**Interfaces:**
- Consumes: `PlayerRestPayload`, `S` (column offsets) from `@/lib/player-rest`.
- Produces: `zeroRestWorkload(payload, seasonStartYear, limit)` returning `{ name: string; team: string; noRestFga: number; noRestEfg: number; games: number }[]`, plus the `ZeroRestWorkload` component.

**Why this section is a workload count and not a rest-effect leaderboard.** At ≥50 attempts per arm, 2025-26's biggest "rest effects" are Javon Small at −30.6pp and Anthony Davis at −23.5pp on 54 no-rest attempts. At ≥150 per arm only 58 players qualify and the tails are still noise. A single-season eFG% delta is not an estimate of anything. Attempts taken on no rest, by contrast, is a fact — and it answers a real question about who carries back-to-backs. The defensible career estimates already live on `/shooting`, which this section links to.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/player-rest.test.ts`:

```ts
import { zeroRestWorkload } from "@/lib/player-rest";

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/player-rest.test.ts`
Expected: FAIL — `zeroRestWorkload` is not exported.

- [ ] **Step 3: Implement it**

Append to `src/lib/player-rest.ts`:

```ts
/** One player's no-rest shooting volume in one season. */
export interface ZeroRestWorkloadRow {
  name: string
  team: string
  noRestFga: number
  noRestEfg: number
  games: number
}

/**
 * A season's players ranked by shot attempts taken on zero days' rest.
 *
 * Volume, deliberately not a rest *effect*. A single season's eFG% split is not an
 * estimate of anything — at 50 attempts per arm the extremes swing ±30pp and the top of
 * any such list is bench players with tiny samples, which is why the career `shrunk`
 * column exists. Attempts on no rest is a plain fact, and it answers the question worth
 * asking here: who is being asked to carry the back-to-backs.
 *
 * Ties break on name so the table is stable between renders.
 */
export function zeroRestWorkload(
  payload: PlayerRestPayload,
  seasonStartYear: number,
  limit: number
): ZeroRestWorkloadRow[] {
  return payload.seasons
    .filter((row) => row[S.YEAR] === seasonStartYear)
    .map((row) => ({
      name: payload.names[row[S.PLAYER]],
      team: payload.teams[row[S.TEAM]],
      noRestFga: row[S.NO_REST_FGA],
      noRestEfg: row[S.NO_REST_EFG],
      games: row[S.GAMES],
    }))
    .sort((a, b) => b.noRestFga - a.noRestFga || a.name.localeCompare(b.name))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/player-rest.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the section, loaded on scroll**

The payload is 782 KB. It must not be fetched for a visitor who never reaches section seven, so this component fetches on intersection rather than on mount.

Create `src/components/zero-rest-workload.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Skeleton } from "@/components/ui/skeleton"
import { parseSeasonStartYear } from "@/lib/nba-season"
import { zeroRestWorkload, type PlayerRestPayload } from "@/lib/player-rest"
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles"

const ROW_LIMIT = 15

// ponytail: the payload is a hand-run Python export, so this section goes stale mid-season
// while the rest of the page updates daily off the cron. The `generated` stamp is rendered so
// a reader can see how old it is. Upgrade path: move scripts/export_player_rest.py into the
// daily pipeline, at which point this comment and the stamp caveat both go away.
const PAYLOAD_URL = "/data/player-rest.json"

async function fetchPayload(url: string): Promise<PlayerRestPayload> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load player rest data: ${res.status}`)
  return res.json()
}

/** Formats the export's stamp for display: "2026-07-30" → "JUL 30, 2026". */
function stampLabel(generated: string): string {
  const date = new Date(`${generated}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return generated.toUpperCase()
  return date
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .toUpperCase()
}

export function ZeroRestWorkload({ season }: { season: string }) {
  const [visible, setVisible] = useState(false)
  const anchor = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = anchor.current
    if (node === null || visible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  const { data, error } = useSWR<PlayerRestPayload>(visible ? PAYLOAD_URL : null, fetchPayload, {
    revalidateOnFocus: false,
  })

  const rows = data ? zeroRestWorkload(data, parseSeasonStartYear(season), ROW_LIMIT) : []

  return (
    <div className="flex flex-col gap-3" ref={anchor}>
      <p style={{ fontSize: 14, color: "var(--term-text-muted)", maxWidth: "42rem", lineHeight: 1.55 }}>
        Who took the most shots on zero days' rest. This is volume, not a verdict on how well
        they shot — a single season's rest split is too small to say that.{" "}
        <a href="/shooting" style={{ color: "var(--term-blue)", fontWeight: 600 }}>
          Career rest splits live on Player Shooting →
        </a>
      </p>

      {error ? (
        <p className="mono" role="alert" style={{ fontSize: 12, color: "var(--term-red)" }}>
          FAILED TO LOAD PLAYER DATA.
        </p>
      ) : !data ? (
        <div style={{ ...termCardStyle, padding: 12 }}>
          <div className="flex flex-col gap-[2px]">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton
                key={i}
                className="h-[18px] w-full bg-[var(--term-surface-2)]"
                style={{ borderRadius: "var(--term-radius-bar)" }}
              />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="mono" style={{ fontSize: 12, color: "var(--term-text-muted)" }}>
          NO PLAYER DATA FOR {season}. THE EXPORT COVERS 1996-97 ONWARD.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="mono w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr>
                  <th style={termThStyle}>PLAYER</th>
                  <th style={termThStyle}>TEAM</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NO-REST FGA</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>NO-REST EFG%</th>
                  <th style={{ ...termThStyle, textAlign: "right" }}>GAMES</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} data-testid="zero-rest-row">
                    <td style={termTdStyle}>{r.name}</td>
                    <td style={termTdStyle}>{r.team}</td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                      {r.noRestFga.toLocaleString()}
                    </td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>
                      {r.noRestEfg.toFixed(1)}
                    </td>
                    <td className="tabular-nums" style={{ ...termTdStyle, textAlign: "right" }}>{r.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Stated, not hidden: this file is a hand-run export and will lag a live season. */}
          <p className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)" }}>
            PLAYER DATA THROUGH {stampLabel(data.generated)} · UPDATED SEPARATELY FROM THE FIGURES ABOVE
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Mount it**

In `src/components/season-report-content.tsx`, import it:

```tsx
import { ZeroRestWorkload } from "@/components/zero-rest-workload"
```

and render it last, after `<FatigueCalendar … />`:

```tsx
          <div className="flex flex-col gap-3">
            <SectionDivider label="ZERO-REST WORKLOAD" descriptor="VOLUME, NOT EFFECT" />
            <ZeroRestWorkload season={data.season} />
          </div>
```

- [ ] **Step 7: Verify the lazy fetch actually is lazy**

```bash
pnpm dev
```

Open `http://localhost:3000/season` with DevTools → Network filtered to `player-rest`. On load, with the page scrolled to the top, there must be **no** request. Scroll to the bottom and it appears once. If it fires on load, the `IntersectionObserver` is attached to a node already in view — check that the section really is below the fold.

Then confirm the content: the table shows 15 rows, and switching the selector to 2015-16 repopulates without refetching the payload (SWR caches it under one key).

- [ ] **Step 8: Full verification and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test:run && pnpm test:e2e
git add src/lib/player-rest.ts src/lib/__tests__/player-rest.test.ts src/components/zero-rest-workload.tsx src/components/season-report-content.tsx
git commit -m "Add the zero-rest workload section, loaded on scroll"
```

---

### Task 8: Repoint the Games page banner

**Files:**
- Modify: `src/app/page.tsx:167-190`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing.

This is the change the whole project started from: the off-season banner links to the 41-season backtest, which is not what a visitor arriving in the off-season wants.

- [ ] **Step 1: Rewrite the banner's link**

In `src/app/page.tsx`, replace the `<a>` inside `OffSeasonBanner`:

```tsx
      <a
        href="/season"
        className="transition-colors hover:underline"
        style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--term-blue)", fontWeight: 700 }}
      >
        SEE THE FULL SEASON REPORT →
      </a>
```

- [ ] **Step 2: Remove the now-unused import**

`NBA_SEASONS` was imported only for the `{NBA_SEASONS.length}-SEASON BACKTEST` copy. Check whether anything else in the file still uses it:

Run: `grep -n "NBA_SEASONS" src/app/page.tsx`

If the only remaining hit is the import, drop `NBA_SEASONS` from the `@/lib/nba-season` import list, keeping `currentDisplaySeason` and `isNbaOffSeason`. If `grep` shows another use, leave the import alone.

- [ ] **Step 3: Verify lint catches nothing and the banner renders**

```bash
pnpm lint && pnpm typecheck
```

Then, because the banner only renders in the off-season (it does today — `isNbaOffSeason()` is true on 2026-07-30), open `http://localhost:3000/` and confirm the banner reads `2025-26 SEASON COMPLETE — SHOWING FINAL SLATE` with `SEE THE FULL SEASON REPORT →` on the right, and that the link lands on `/season`.

- [ ] **Step 4: Full verification and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test:run && pnpm test:e2e
git add src/app/page.tsx
git commit -m "Point the off-season banner at the Season Report"
```

- [ ] **Step 5: Push**

```bash
git push
```

---

## Deferred, deliberately

Recorded here so it is a decision rather than an oversight.

- **Wiring `scripts/export_player_rest.py` into the daily pipeline.** Section 7 goes stale during a live season; the page states its data date instead. A pipeline project, not a page project.
- **`/season/[season]` shareable routes.** Every section is already season-parameterized, so this is additive whenever it is wanted.
- **A `behind-the-data` methodology section for `/season`.** `MethodLink` renders nothing until `BEHIND_THE_DATA_SECTIONS` gains an entry, so the page ships without one rather than with a component that renders null.
- **Demoting `MODEL RESULTS` to the OTHER menu.** Considered during design and declined for now: `/analysis` is where the all-season claim is proven, and this page links to it. Worth revisiting once the new page has been looked at.
