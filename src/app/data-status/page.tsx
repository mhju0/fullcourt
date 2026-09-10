import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import data from "@/data/officiating.json";
import { db } from "@/lib/db";
import {
  getDataAsOf,
  getLatestPublishedPlayoffSeason,
  getLatestPublishedShotQualitySeason,
  getPublishedScheduleCoverage,
} from "@/lib/db/queries";
import { isNbaOffSeason } from "@/lib/nba-season";
import { shootingHomeCoverage } from "@/lib/home-findings";
import { AVAILABILITY_SAMPLE } from "@/lib/availability-facts";
import type { ReviewSeason } from "@/lib/officiating";
import type { PlayerRestPayload } from "@/lib/player-rest";
import { getHistoricalBacktest } from "@/lib/rest-advantage-evidence-server";
import { termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Data Status",
  description: "Coverage and freshness information for FullCourt's published NBA data.",
};

export const dynamic = "force-dynamic";

async function readStatusValue<T>(
  label: string,
  operation: () => PromiseLike<T>
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[data-status/${label}]`, error);
    return null;
  }
}

function formatUtcTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function StatusCard({
  title,
  href,
  coverage,
  through,
  refresh,
}: {
  title: string;
  href: string;
  coverage: string;
  through: string;
  refresh: string;
}) {
  return (
    <article className="flex flex-col gap-3" style={termCardStyle}>
      <h2 style={{ fontSize: TYPE.emph, fontWeight: 700, color: "var(--term-text)" }}>
        <a href={href} className="underline decoration-[var(--term-border)] underline-offset-4 hover:decoration-[var(--term-accent)]">{title}</a>
      </h2>
      <dl className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        {[
          ["Coverage", coverage],
          ["Data through", through],
          ["Last successful refresh", refresh],
        ].map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700 }}>{term.toUpperCase()}</dt>
            <dd style={{ color: "var(--term-text-dim)" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default async function DataStatusPage() {
  const playerPayload = JSON.parse(
    await readFile(join(process.cwd(), "public/data/player-rest.json"), "utf8")
  ) as PlayerRestPayload;
  const officiatingSeasons = data.seasons as ReviewSeason[];
  const latestOfficiating = [...officiatingSeasons].sort((a, b) => a.season.localeCompare(b.season)).at(-1)!;
  const shootingCoverage = shootingHomeCoverage(playerPayload);

  const connection = await readStatusValue("database", () => db.execute(sql`select 1`));
  const databaseReachable = connection !== null;

  let game = null;
  let schedule = null;
  let analysis = null;
  let playoffSeason = null;
  let shotSeason = null;
  if (databaseReachable) {
    // Vercel uses one connection per function. These reads can stall that slot when queued
    // together, so keep their independent failure states while issuing them one at a time.
    game = await readStatusValue("games", getDataAsOf);
    schedule = await readStatusValue("schedule", getPublishedScheduleCoverage);
    analysis = await readStatusValue("analysis", () => getHistoricalBacktest(0));
    playoffSeason = await readStatusValue("playoffs", getLatestPublishedPlayoffSeason);
    shotSeason = await readStatusValue("shot-quality", getLatestPublishedShotQualitySeason);
  }

  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      <PageHeader
        eyebrow="COVERAGE · FRESHNESS · AVAILABILITY"
        title="Data Status"
        description="What each published view currently covers. Database availability and data freshness are separate checks."
      />

      <section className="flex flex-col gap-2" aria-labelledby="database-status">
        <h2 id="database-status" className="mono" style={{ fontSize: 12, letterSpacing: TRACK.label, color: "var(--term-text)", fontWeight: 700 }}>
          DATABASE · {databaseReachable ? "REACHABLE" : "UNAVAILABLE"}
        </h2>
        <p style={{ color: "var(--term-text-muted)", maxWidth: WIDTH.prose }}>
          This checks whether FullCourt can read its database. It does not prove that scores or research publications are current. The machine-readable liveness endpoint remains available at <a className="underline" href="/api/health">/api/health</a>.
        </p>
        {isNbaOffSeason() ? (
          <p role="status" style={{ color: "var(--term-text-muted)", maxWidth: WIDTH.prose }}>
            The NBA is between regular seasons. A final-result date from the completed season can be current while a published future schedule extends further.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4">
        <StatusCard
          title="Game results"
          href="/games"
          coverage={game ? `${game.finalGames.toLocaleString()} final regular-season games` : "Unavailable"}
          through={game?.latestFinalDate ?? "Unknown"}
          refresh="Not recorded."
        />
        <StatusCard
          title="Published schedules"
          href="/schedule"
          coverage={schedule ? `${schedule.games.toLocaleString()} regular-season games from ${schedule.firstDate ?? "unknown"} to ${schedule.lastDate ?? "unknown"}` : "Unavailable"}
          through={schedule?.lastDate ?? "Unknown"}
          refresh="Not recorded."
        />
        <StatusCard
          title="Model Results"
          href="/analysis"
          coverage={analysis ? `${analysis.venueBaseline.games.toLocaleString()} final games with fatigue evidence` : "Unavailable"}
          through={analysis?.latestEvidenceDate ?? "Unknown"}
          refresh="Not recorded."
        />
        <StatusCard
          title="Playoff Rest"
          href="/playoffs"
          coverage={playoffSeason ? `Brackets through ${playoffSeason}` : "Unavailable"}
          through={playoffSeason ?? "Unknown"}
          refresh="Not recorded."
        />
        <StatusCard
          title="Expected Shot Value"
          href="/shot-quality"
          coverage={shotSeason ? `League court surfaces through ${shotSeason}` : "Unavailable"}
          through={shotSeason ?? "Unknown"}
          refresh="Not recorded."
        />
        <StatusCard
          title="Shooting by Rest"
          href="/shooting"
          coverage={shootingCoverage ?? "Unavailable"}
          through={shootingCoverage?.split(" to ").at(-1) ?? "Unknown"}
          refresh={`Export generated ${playerPayload.generated}.`}
        />
        <StatusCard
          title="Availability Cost"
          href="/availability"
          coverage={`${AVAILABILITY_SAMPLE.games.toLocaleString()} games from ${AVAILABILITY_SAMPLE.firstSeason} to ${AVAILABILITY_SAMPLE.lastSeason}`}
          through={AVAILABILITY_SAMPLE.lastSeason}
          refresh="Not recorded."
        />
        <StatusCard
          title="Officiating"
          href="/officiating"
          coverage={`${officiatingSeasons[0]?.season ?? "Unknown"} to ${latestOfficiating.season}`}
          through={latestOfficiating.through}
          refresh={`NBA report index refreshed ${formatUtcTimestamp(latestOfficiating.refreshedAt)}.`}
        />
      </div>
    </div>
  );
}
