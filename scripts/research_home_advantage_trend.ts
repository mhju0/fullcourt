/**
 * Reproducible descriptive measurement of NBA home advantage by season.
 *
 * Population: getCompletedGamesWithFatigue(), which applies publishableGames()
 * (regular season and outside named abnormal stretches), final status, both
 * scores present, and inner joins to the latest fatigue score for both teams.
 *
 * This script makes one read-only database query, then derives every season,
 * era, trend, and validation row in memory.
 *
 * Usage:
 *   pnpm exec tsx scripts/research_home_advantage_trend.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "@/lib/load-env-local";
import {
  buildHistoricalBacktest,
  classifyRestAdvantage,
  isCalledSide,
  NEUTRAL_REST_ADVANTAGE_THRESHOLD,
  type HistoricalGameEvidenceRow,
} from "@/lib/rest-advantage-evidence";

const JSON_PATH = path.join(
  process.cwd(),
  "docs",
  "research",
  "2026-09-11-home-advantage-trend.json"
);
const CSV_PATH = path.join(
  process.cwd(),
  "docs",
  "research",
  "2026-09-11-home-advantage-trend.csv"
);
const PREVIOUS_REPORT_PATH = path.join(
  process.cwd(),
  "ml",
  "data",
  "rest_eras_report.txt"
);
const COVID_AFFECTED_SEASONS = new Set(["2019-20", "2020-21"]);

type Game = {
  season: string;
  startYear: number;
  date: string;
  homeWon: boolean;
  homeMargin: number;
  homeRested: boolean;
};

type SeasonRow = {
  season: string;
  startYear: number;
  firstGameDate: string;
  lastGameDate: string;
  allGames: number;
  homeWins: number;
  awayWins: number;
  homeWinPct: number;
  avgHomeMargin: number;
  homeRestedGames: number;
  homeRestedWins: number;
  homeRestedLosses: number;
  homeRestedWinPct: number;
  homeRestedAvgHomeMargin: number;
  homeRestedLiftVsSeasonBaselinePp: number;
};

type MetricName =
  | "homeWinPct"
  | "avgHomeMargin"
  | "homeRestedWinPct"
  | "homeRestedAvgHomeMargin"
  | "homeRestedLiftVsSeasonBaselinePp";

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function rate(wins: number, games: number): number {
  if (games === 0) throw new Error("Cannot calculate a rate with zero games");
  return (wins / games) * 100;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot calculate a mean over zero values");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seasonStartYear(season: string): number {
  const parsed = Number.parseInt(season.slice(0, 4), 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid season label: ${season}`);
  return parsed;
}

function summarizeSeason(season: string, games: readonly Game[]): SeasonRow {
  if (games.length === 0) throw new Error(`No games for ${season}`);
  const homeWins = games.filter((game) => game.homeWon).length;
  const homeRested = games.filter((game) => game.homeRested);
  const homeRestedWins = homeRested.filter((game) => game.homeWon).length;
  const homeWinPct = rate(homeWins, games.length);
  const homeRestedWinPct = rate(homeRestedWins, homeRested.length);
  const dates = games.map((game) => game.date).sort();

  return {
    season,
    startYear: seasonStartYear(season),
    firstGameDate: dates[0]!,
    lastGameDate: dates[dates.length - 1]!,
    allGames: games.length,
    homeWins,
    awayWins: games.length - homeWins,
    homeWinPct: round(homeWinPct),
    avgHomeMargin: round(mean(games.map((game) => game.homeMargin))),
    homeRestedGames: homeRested.length,
    homeRestedWins,
    homeRestedLosses: homeRested.length - homeRestedWins,
    homeRestedWinPct: round(homeRestedWinPct),
    homeRestedAvgHomeMargin: round(
      mean(homeRested.map((game) => game.homeMargin))
    ),
    homeRestedLiftVsSeasonBaselinePp: round(homeRestedWinPct - homeWinPct),
  };
}

function summarizeEra(key: string, label: string, rows: readonly SeasonRow[]) {
  if (rows.length === 0) throw new Error(`No seasons for era ${key}`);
  const allGames = rows.reduce((sum, row) => sum + row.allGames, 0);
  const homeWins = rows.reduce((sum, row) => sum + row.homeWins, 0);
  const homeRestedGames = rows.reduce(
    (sum, row) => sum + row.homeRestedGames,
    0
  );
  const homeRestedWins = rows.reduce(
    (sum, row) => sum + row.homeRestedWins,
    0
  );
  const homeMarginSum = rows.reduce(
    (sum, row) => sum + row.avgHomeMargin * row.allGames,
    0
  );
  const homeRestedMarginSum = rows.reduce(
    (sum, row) => sum + row.homeRestedAvgHomeMargin * row.homeRestedGames,
    0
  );
  const homeWinPct = rate(homeWins, allGames);
  const homeRestedWinPct = rate(homeRestedWins, homeRestedGames);

  return {
    key,
    label,
    firstSeason: rows[0]!.season,
    lastSeason: rows[rows.length - 1]!.season,
    seasons: rows.length,
    allGames,
    homeWins,
    homeWinPct: round(homeWinPct),
    avgHomeMargin: round(homeMarginSum / allGames),
    homeRestedGames,
    homeRestedWins,
    homeRestedWinPct: round(homeRestedWinPct),
    homeRestedAvgHomeMargin: round(homeRestedMarginSum / homeRestedGames),
    homeRestedLiftVsEraBaselinePp: round(homeRestedWinPct - homeWinPct),
  };
}

/** Unweighted OLS over season-level observations; x is season start year. */
function trend(rows: readonly SeasonRow[], metric: MetricName) {
  if (rows.length < 3) throw new Error(`Too few seasons for ${metric} trend`);
  const xs = rows.map((row) => row.startYear);
  const ys = rows.map((row) => row[metric]);
  const xMean = mean(xs);
  const yMean = mean(ys);
  const covariance = xs.reduce(
    (sum, x, index) => sum + (x - xMean) * (ys[index]! - yMean),
    0
  );
  const xSquared = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const ySquared = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const slopePerYear = covariance / xSquared;
  const pearsonR = covariance / Math.sqrt(xSquared * ySquared);

  return {
    metric,
    unit:
      metric.endsWith("Pct") || metric.endsWith("Pp")
        ? "percentage points"
        : "points per game",
    seasonWeighting: "each season weighted equally",
    nSeasons: rows.length,
    firstSeason: rows[0]!.season,
    lastSeason: rows[rows.length - 1]!.season,
    slopePerDecade: round(slopePerYear * 10),
    pearsonR: round(pearsonR),
    rSquared: round(pearsonR ** 2),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(rows: readonly SeasonRow[]): string {
  const columns: Array<keyof SeasonRow> = [
    "season",
    "startYear",
    "firstGameDate",
    "lastGameDate",
    "allGames",
    "homeWins",
    "awayWins",
    "homeWinPct",
    "avgHomeMargin",
    "homeRestedGames",
    "homeRestedWins",
    "homeRestedLosses",
    "homeRestedWinPct",
    "homeRestedAvgHomeMargin",
    "homeRestedLiftVsSeasonBaselinePp",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n") + "\n";
}

async function previousReportValidation() {
  try {
    const text = await readFile(PREVIOUS_REPORT_PATH, "utf8");
    const population = text.match(/population \(scored\)\s+([\d,]+)/)?.[1];
    const homeRested = text.match(/home-rested \(published\)\s+([\d,]+)/)?.[1];
    const homeRestedWins = text.match(/home-rested won\s+([\d,]+)/)?.[1];
    return {
      available: true,
      path: path.relative(process.cwd(), PREVIOUS_REPORT_PATH),
      population: population ? Number(population.replaceAll(",", "")) : null,
      homeRestedGames: homeRested
        ? Number(homeRested.replaceAll(",", ""))
        : null,
      homeRestedWins: homeRestedWins
        ? Number(homeRestedWins.replaceAll(",", ""))
        : null,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
    return {
      available: false,
      path: path.relative(process.cwd(), PREVIOUS_REPORT_PATH),
      population: null,
      homeRestedGames: null,
      homeRestedWins: null,
    };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { getCompletedGamesWithFatigue } = await import("@/lib/db/queries");

  // The only database read in this script. All later work is in memory.
  const rawRows: HistoricalGameEvidenceRow[] =
    await getCompletedGamesWithFatigue();
  const shipped = buildHistoricalBacktest(rawRows);
  const previousReport = await previousReportValidation();

  const games: Game[] = rawRows.map((row) => {
    if (row.homeScore === null || row.awayScore === null) {
      throw new Error(`Missing score after completed-game query: ${row.date}`);
    }
    if (row.homeScore === row.awayScore) {
      throw new Error(`Tied final score in ${row.season} on ${row.date}`);
    }
    const restAdvantage = classifyRestAdvantage(
      Number.parseFloat(row.homeFatigueScore),
      Number.parseFloat(row.awayFatigueScore)
    );
    return {
      season: row.season,
      startYear: seasonStartYear(row.season),
      date: row.date,
      homeWon: row.homeScore > row.awayScore,
      homeMargin: row.homeScore - row.awayScore,
      homeRested: isCalledSide(restAdvantage.advantageTeam),
    };
  });

  const seasons = [...new Set(games.map((game) => game.season))].sort();
  const perSeason = seasons.map((season) =>
    summarizeSeason(
      season,
      games.filter((game) => game.season === season)
    )
  );

  const firstFive = perSeason.slice(0, 5);
  const lastFive = perSeason.slice(-5);
  const lastTen = perSeason.slice(-10);
  const preCovid = perSeason.filter((row) => row.startYear <= 2018);
  const recentAfterDisruption = perSeason.filter((row) => row.startYear >= 2021);
  const fullExcludingCovid = perSeason.filter(
    (row) => !COVID_AFFECTED_SEASONS.has(row.season)
  );
  const recentExcludingCovid = lastTen.filter(
    (row) => !COVID_AFFECTED_SEASONS.has(row.season)
  );

  const eraDefinitions = [
    ["first_five", "First five seasons", firstFive],
    ["last_five", "Last five seasons", lastFive],
    ["last_ten", "Last ten seasons", lastTen],
    ["pre_covid", "Pre-COVID seasons through 2018-19", preCovid],
    [
      "recent_after_disruption",
      "Recent seasons after the disrupted 2020-21 season",
      recentAfterDisruption,
    ],
  ] as const;
  const eras = eraDefinitions.map(([key, label, rows]) =>
    summarizeEra(key, label, rows)
  );

  const metricNames: MetricName[] = [
    "homeWinPct",
    "avgHomeMargin",
    "homeRestedWinPct",
    "homeRestedAvgHomeMargin",
    "homeRestedLiftVsSeasonBaselinePp",
  ];
  const trendWindows = [
    ["full", "All seasons", perSeason],
    [
      "full_excluding_covid_affected",
      "All seasons excluding 2019-20 and 2020-21",
      fullExcludingCovid,
    ],
    ["recent_last_ten", "Last ten seasons", lastTen],
    [
      "recent_last_ten_excluding_covid_affected",
      "Last ten seasons excluding 2019-20 and 2020-21",
      recentExcludingCovid,
    ],
  ] as const;
  const trends = trendWindows.map(([key, label, rows]) => ({
    key,
    label,
    metrics: Object.fromEntries(
      metricNames.map((metric) => [metric, trend(rows, metric)])
    ),
  }));

  const homeWins = games.filter((game) => game.homeWon).length;
  const homeRested = games.filter((game) => game.homeRested);
  const homeRestedWins = homeRested.filter((game) => game.homeWon).length;
  const seasonValidation = perSeason.map((row) => {
    const shippedRow = shipped.seasonWinRates.find(
      (candidate) => candidate.season === row.season
    );
    return {
      season: row.season,
      matched: Boolean(
        shippedRow &&
          shippedRow.games === row.homeRestedGames &&
          shippedRow.restedTeamWins === row.homeRestedWins &&
          shippedRow.homeBaselinePct === round(row.homeWinPct, 1)
      ),
    };
  });

  const validation = {
    buildHistoricalBacktest: {
      populationGamesMatch: shipped.venueBaseline.games === games.length,
      homeWinsMatch: shipped.venueBaseline.homeWins === homeWins,
      homeRestedGamesMatch: shipped.totalGames === homeRested.length,
      homeRestedWinsMatch: shipped.overallWins === homeRestedWins,
      perSeasonRowsMatched: seasonValidation.filter((row) => row.matched).length,
      perSeasonRowsExpected: perSeason.length,
      allPerSeasonRowsMatch: seasonValidation.every((row) => row.matched),
    },
    previousRestErasReport: {
      ...previousReport,
      populationGamesMatch:
        previousReport.population === null
          ? null
          : previousReport.population === games.length,
      homeRestedGamesMatch:
        previousReport.homeRestedGames === null
          ? null
          : previousReport.homeRestedGames === homeRested.length,
      homeRestedWinsMatch:
        previousReport.homeRestedWins === null
          ? null
          : previousReport.homeRestedWins === homeRestedWins,
    },
  };

  if (
    !validation.buildHistoricalBacktest.populationGamesMatch ||
    !validation.buildHistoricalBacktest.homeWinsMatch ||
    !validation.buildHistoricalBacktest.homeRestedGamesMatch ||
    !validation.buildHistoricalBacktest.homeRestedWinsMatch ||
    !validation.buildHistoricalBacktest.allPerSeasonRowsMatch
  ) {
    throw new Error("Trend measurement disagrees with buildHistoricalBacktest");
  }

  const result = {
    generatedAt: new Date().toISOString(),
    script: "scripts/research_home_advantage_trend.ts",
    outputs: [
      "docs/research/2026-09-11-home-advantage-trend.json",
      "docs/research/2026-09-11-home-advantage-trend.csv",
    ],
    population: {
      label:
        "Published regular-season final games with both scores and both fatigue records",
      firstSeason: perSeason[0]!.season,
      lastSeason: perSeason[perSeason.length - 1]!.season,
      firstGameDate: [...games].sort((a, b) => a.date.localeCompare(b.date))[0]!
        .date,
      lastGameDate: [...games].sort((a, b) => b.date.localeCompare(a.date))[0]!
        .date,
      seasons: perSeason.length,
      games: games.length,
      homeWins,
      homeRestedGames: homeRested.length,
      homeRestedWins,
      classification: `Home-rested means classifyRestAdvantage() returns home at |RA| >= ${NEUTRAL_REST_ADVANTAGE_THRESHOLD}, then isCalledSide() admits it.`,
      inclusions: [
        "Regular-season games in the local database from 1985-86 through 2025-26.",
        "Shortened and shifted seasons remain included.",
        "The 971 pre-suspension games in 2019-20 remain included.",
      ],
      exclusions: [
        "Play-in and postseason games.",
        "The 2019-20 Orlando bubble abnormal stretch.",
        "Games that are not final or lack either score.",
        "Games lacking a latest fatigue record for either team because the source query uses inner joins.",
      ],
      caveats: [
        "This is not every league game; coverage is conditional on both fatigue records being present.",
        "Home means the designated home team. ESPN neutral_site coverage begins only in 2013, so earlier international or neutral-court games can remain labeled home and are not separately removed here.",
        "The local source does not establish whether a trend generalizes to other U.S. sports.",
        "Season-level correlation and OLS are descriptive. They do not adjust for team strength, opponent mix, arena, rules, travel, or other concurrent changes and do not establish causation.",
      ],
    },
    methodology: {
      baseline:
        "All designated-home wins among every population game in the same season, including neutral-rest games.",
      homeRestedRate:
        "Designated-home wins among games where the home side passes the canonical rest-advantage call.",
      lift:
        "Home-rested win percentage minus the all-home win percentage from that same season or pooled era.",
      averageHomeMargin:
        "Mean home score minus away score; positive values favor the designated home team.",
      eraRates:
        "Pooled from game-level counts; full seasons contribute in proportion to their game counts.",
      trends:
        "Unweighted OLS and Pearson correlation over season-level values against season start year. Slope is reported per decade.",
      covidSensitivity:
        "2019-20 and 2020-21 are removed in the excluding-COVID windows; the first remains pre-suspension only and the second had a shifted, shortened schedule.",
    },
    validation,
    overall: summarizeEra("full", "All seasons", perSeason),
    eras,
    trends,
    perSeason,
  };

  await writeFile(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(CSV_PATH, makeCsv(perSeason), "utf8");

  console.log(
    JSON.stringify(
      {
        wrote: [JSON_PATH, CSV_PATH],
        population: result.population,
        overall: result.overall,
        eras,
        trends,
        validation,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
