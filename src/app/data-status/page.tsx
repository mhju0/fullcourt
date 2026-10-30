import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { keepTogether } from "@/components/ui/keep-together";
import { db } from "@/lib/db";
import { loadPlayerRestPublication } from "@/lib/player-rest-publication-server";
import { loadOfficiatingPublication } from "@/lib/officiating-publication-server";
import { readDailyDatasetHistory } from "@/lib/daily-publication-server";
import { parseCurrentShotQualityArtifact, getCurrentShotQualitySnapshot } from "@/lib/shot-quality-publication";
import { currentDisplaySeason, formatEasternTimestamp } from "@/lib/nba-season";
import {
  getDataAsOf,
  getLatestPublishedPlayoffSeason,
  getLatestPublishedShotQualitySeason,
  getPublishedScheduleCoverage,
} from "@/lib/db/queries";
import { isNbaOffSeason } from "@/lib/nba-season";
import { shootingHomeCoverage } from "@/lib/home-findings";
import { AVAILABILITY_SAMPLE } from "@/lib/availability-facts";
import { getHistoricalEvidenceCoverage } from "@/lib/rest-advantage-evidence-server";
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
        <a href={href} className="inline-flex min-h-11 items-center underline decoration-[var(--term-border)] underline-offset-4 hover:decoration-[var(--term-accent)]">{title}</a>
      </h2>
      <dl className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        {[
          ["Coverage", coverage],
          ["Data through", through],
          ["Last successful refresh", refresh],
        ].map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="mono" style={{ fontSize: 11, letterSpacing: TRACK.label, color: "var(--term-text-muted)", fontWeight: 700 }}>{term.toUpperCase()}</dt>
            <dd style={{ color: "var(--term-text-dim)" }}>{keepTogether(value)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

async function readDatabaseStatus() {
  const connection = await readStatusValue("database", () => db.execute(sql`select 1`));
  const databaseReachable = connection !== null;
  if (!databaseReachable) {
    return { databaseReachable, game: null, schedule: null, analysis: null, playoffSeason: null, shotSeason: null };
  }
  // The hosted pool has one connection; publication fetches can overlap this sequential branch.
  const game = await readStatusValue("games", getDataAsOf);
  const schedule = await readStatusValue("schedule", getPublishedScheduleCoverage);
  const analysis = await readStatusValue("analysis", getHistoricalEvidenceCoverage);
  const playoffSeason = await readStatusValue("playoffs", getLatestPublishedPlayoffSeason);
  const shotSeason = await readStatusValue("shot-quality", getLatestPublishedShotQualitySeason);
  return { databaseReachable, game, schedule, analysis, playoffSeason, shotSeason };
}

export default async function DataStatusPage() {
  const [[playerPayload, officiating, shots], { databaseReachable, game, schedule, analysis, playoffSeason, shotSeason }] = await Promise.all([
    Promise.all([loadPlayerRestPublication(), loadOfficiatingPublication(), readDailyDatasetHistory("shotQuality")]),
    readDatabaseStatus(),
  ]);
  const officiatingSeasons = officiating.seasons;
  const shotCheck = shots.at(-1);
  const shotSnapshots = [getCurrentShotQualitySnapshot(), ...shots.map(entry => {
    const snapshot = parseCurrentShotQualityArtifact(entry.data);
    return snapshot && (!entry.season || entry.season === snapshot.season) ? snapshot : null;
  })].filter(snapshot => snapshot !== null).filter(snapshot => snapshot.season <= currentDisplaySeason())
    .sort((a, b) => a.season.localeCompare(b.season) || a.generatedAt.localeCompare(b.generatedAt));
  const latestOfficiating = [...officiatingSeasons].sort((a, b) => a.season.localeCompare(b.season)).at(-1)!;
  const shootingCoverage = shootingHomeCoverage(playerPayload);

  const candidate = shotSnapshots.at(-1);
  const currentShots = candidate && (!shotSeason || candidate.season >= shotSeason) ? candidate : null;
  const shotStatus = shotCheck?.data != null && !parseCurrentShotQualityArtifact(shotCheck.data) ? "failed" : shotCheck?.status ?? "bundled";

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

      <p style={{ fontSize: TYPE.body, color: "var(--term-text-muted)", maxWidth: WIDTH.prose }}>
        “Not recorded” means this view has no durable record of a successful refresh. Coverage dates and a reachable database do not confirm score sync or fatigue refresh.
      </p>

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
          coverage={analysis ? `${analysis.games.toLocaleString()} final regular-season games with fatigue evidence, neutral sites included` : "Unavailable"}
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
          coverage={currentShots ? `${currentShots.source.gameIds.length} observed games · ${currentShots.source.shotCount.toLocaleString()} source attempts` : shotSeason ? `League court surfaces through ${shotSeason}` : "Unavailable"}
          through={currentShots?.source.lastGameDate ?? shotSeason ?? "Unknown"}
          refresh={currentShots ? `Snapshot generated ${formatEasternTimestamp(currentShots.generatedAt) ?? "Not recorded"}. Latest check: ${shotStatus}.` : `Historical refresh not recorded. Latest current-season check: ${shotStatus}.`}
        />
        <StatusCard
          title="Player Shooting by Rest"
          href="/shooting"
          coverage={shootingCoverage ?? "Unavailable"}
          through={playerPayload.publication?.through ?? shootingCoverage?.split(" to ").at(-1) ?? "Unknown"}
          refresh={`Published observations generated ${formatEasternTimestamp(playerPayload.generated) ?? "Not recorded"}. Latest check: ${playerPayload.refresh?.status ?? "bundled"}.`}
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
          refresh={`NBA report index refreshed ${formatEasternTimestamp(latestOfficiating.refreshedAt) ?? "Not recorded"}. Latest check: ${officiating.publication.status}.`}
        />
      </div>
    </div>
  );
}
