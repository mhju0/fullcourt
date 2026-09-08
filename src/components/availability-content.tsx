import {
  AVAILABILITY_BEST_OUT_BY_SEASON,
  AVAILABILITY_EFFECTS,
  AVAILABILITY_FREQUENCY,
  AVAILABILITY_NOISE,
  AVAILABILITY_SAMPLE,
  AVAILABILITY_SCHEDULE_HOLDS_UP,
} from "@/lib/availability-facts"
import { LEAD, termCardStyle, TRACK, TYPE, WIDTH } from "@/lib/terminal-styles"
import { DataTable } from "@/components/ui/data-table"
import { StatFigure } from "@/components/ui/stat-tile"

const BODY: React.CSSProperties = {
  fontSize: TYPE.body,
  color: "var(--term-text-muted)",
  lineHeight: LEAD.body,
  maxWidth: WIDTH.prose,
}
const LEAD_IN = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 py-1"
      style={{ fontSize: 18, color: "var(--term-text)" }}
    >
      <h2 style={{ fontWeight: 700 }}>{children}</h2>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

/**
 * The five effects share one track so their lengths are comparable, and the track runs to a
 * round number above the largest rather than to the largest itself — a bar pinned to 100% of
 * its own value would draw the top effect as total and everything else as a fraction of it.
 */
const SCALE_MAX_POINTS = Math.max(
  3,
  ...Object.values(AVAILABILITY_EFFECTS).map((e) => e.points)
)

function EffectBar({
  label,
  points,
  lit,
  note,
}: {
  label: string
  points: number
  lit?: boolean
  note?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span
          style={{
            fontSize: TYPE.body,
            fontWeight: lit ? 700 : 600,
            color: lit ? "var(--term-text)" : "var(--term-text-muted)",
          }}
        >
          {label}
        </span>
        <span
          className="mono tabular-nums"
          style={{
            fontSize: TYPE.stat,
            fontWeight: 700,
            lineHeight: LEAD.figure,
            color: lit ? "var(--term-blue)" : "var(--term-text)",
          }}
        >
          {points.toFixed(2)}
        </span>
      </div>
      <div
        style={{
          height: 12,
          background: "var(--term-surface-2)",
          borderRadius: "var(--term-radius-bar)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(points / SCALE_MAX_POINTS) * 100}%`,
            height: "100%",
            background: lit ? "var(--term-blue)" : "var(--term-neutral)",
          }}
        />
      </div>
      {note ? (
        <span
          className="mono"
          style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}
        >
          {note}
        </span>
      ) : null}
    </div>
  )
}

/** Section A — the finding, and the only number most readers will take away. */
function ScaleSection() {
  const e = AVAILABILITY_EFFECTS
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Missing a top player</SectionHeading>
      <div style={termCardStyle}>
        <StatFigure
          value={`${e.bestPlayerOut.points.toFixed(2)} points`}
          caption="LOWER FINAL MARGIN WITH A TOP PLAYER ABSENT · ASSOCIATION"
        />

        <div className="mt-6 flex flex-col gap-4">
          <EffectBar label="Best player out" points={e.bestPlayerOut.points} lit />
          <EffectBar label="Playing at home" points={e.homeCourt.points} />
          <EffectBar label="On a back-to-back" points={e.backToBack.points} />
          <EffectBar label="Visiting altitude" points={e.visitingAltitude.points} />
          <EffectBar label="Off an overtime" points={e.priorOvertime.points} />
        </div>

        <p className="mt-4" style={BODY}>
          <span style={LEAD_IN}>The best-player-out estimate is similar in size to the home-court estimate.</span>{" "}
          Bars compare the size of associations, not their direction: home court is associated with a higher margin, while the other conditions are associated with a lower margin. All are measured in points across{" "}
          {AVAILABILITY_SAMPLE.games.toLocaleString()}{" "}
          games, controlling for both teams&apos; prior records. These are regression
          associations, not isolated causal effects.
        </p>
      </div>
    </section>
  )
}

/** Section B — how often it happens, which is what makes the number above worth knowing. */
function FrequencySection() {
  const f = AVAILABILITY_FREQUENCY
  const cells = [
    { value: `${(f.gamesEitherSideMissingBest * 100).toFixed(1)}%`, label: "OF GAMES HAVE ONE SIDE MISSING ITS BEST PLAYER" },
    { value: `${(f.teamGamesMissingNobody * 100).toFixed(1)}%`, label: "OF TEAM-GAMES ARE MISSING NOBODY FROM THE ROTATION" },
    { value: f.meanRotationSize.toFixed(1), label: "PLAYERS IN A TYPICAL ROTATION" },
  ]
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>How often players are absent</SectionHeading>
      <div style={termCardStyle}>
        <div className="grid gap-6 sm:grid-cols-3">
          {cells.map((c) => (
            <StatFigure key={c.label} value={c.value} caption={c.label} size="stat" tone="var(--term-text)" />
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Section C — the trend.
 *
 * One series, so no legend and one hue. Columns rather than a line because the seasons are
 * discrete buckets, and the track runs from zero: a truncated axis would turn a real threefold
 * rise into a dramatic one. Only the endpoints are labelled — a number on all thirty columns is
 * a table pretending to be a chart. Each column carries its own `title`, so a reader can get any
 * season's figure without the page shipping a scrap of JavaScript.
 */
function TrendSection() {
  const seasons = AVAILABILITY_BEST_OUT_BY_SEASON
  const first = seasons[0]!
  const last = seasons.at(-1)!
  const max = Math.max(...seasons.map((s) => s.rate))

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Top-player absences over time</SectionHeading>
      <div style={termCardStyle}>
        <p style={BODY}>
          <span style={LEAD_IN}>
            Top-player absences are more than three times as common as in{" "}
            {first.season}.
          </span>{" "}
          That is context for every figure above: the same absence was a rare event across most of
          this sample and is an ordinary one now.
        </p>

        <figure className="mt-6 flex flex-col gap-2">
          <div
            className="flex items-end gap-[2px]"
            style={{ height: 96 }}
            role="img"
            aria-label={`Share of team-games played without the team's best player, by season. ${first.season}: ${(first.rate * 100).toFixed(1)} percent. ${last.season}: ${(last.rate * 100).toFixed(1)} percent.`}
          >
            {seasons.map((s) => (
              <div
                key={s.season}
                title={`${s.season} — ${(s.rate * 100).toFixed(1)}% of ${s.teamGames.toLocaleString()} team-games`}
                style={{
                  flex: 1,
                  height: `${(s.rate / max) * 100}%`,
                  background:
                    s.season === last.season ? "var(--term-blue)" : "var(--term-neutral)",
                  borderRadius: "var(--term-radius-bar) var(--term-radius-bar) 0 0",
                  minHeight: 2,
                }}
              />
            ))}
          </div>
          <figcaption className="flex items-baseline justify-between">
            <span
              className="mono tabular-nums"
              style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-text-muted)" }}
            >
              {first.season} · {(first.rate * 100).toFixed(1)}%
            </span>
            <span
              className="mono tabular-nums"
              style={{ fontSize: 11, letterSpacing: TRACK.sub, color: "var(--term-blue-text)", fontWeight: 700 }}
            >
              {last.season} · {(last.rate * 100).toFixed(1)}%
            </span>
          </figcaption>
        </figure>

        <p className="mt-4" style={BODY}>
          The climb is not steady. It dips in 2023-24, the season the league first required 65
          games for awards eligibility, and returns above the old line the year after.
        </p>
      </div>
    </section>
  )
}

/**
 * Section D — the defensive result, and the reason this measurement was worth taking.
 *
 * A table rather than bars: four rows of before/after where the point is that the pairs barely
 * differ. Bars would draw two near-identical lengths and make the reader measure them.
 */
function ScheduleHoldsUpSection() {
  const rows = [
    { label: "On a back-to-back", ...AVAILABILITY_SCHEDULE_HOLDS_UP.backToBack },
    { label: "Visiting altitude", ...AVAILABILITY_SCHEDULE_HOLDS_UP.visitingAltitude },
    { label: "Off an overtime", ...AVAILABILITY_SCHEDULE_HOLDS_UP.priorOvertime },
    { label: "Schedule density", ...AVAILABILITY_SCHEDULE_HOLDS_UP.scheduleDensity },
  ]
  const worst = Math.max(...rows.map((r) => Math.abs(r.shiftPct)))

  return (
    // `data-shot-anchor`: where the README shot of this page ends (scripts/screenshots.mjs).
    <section className="flex flex-col gap-3" data-shot-anchor="schedule-still-counts">
      <SectionHeading>Schedule estimates after accounting for absences</SectionHeading>
      <div style={termCardStyle}>
        <p style={BODY}>
          <span style={LEAD_IN}>
            Measured absences change the schedule estimates little.
          </span>{" "}
          Adding absence value to the regression moves every schedule coefficient by
          under {Math.ceil(worst)}%. Unmeasured absences and changes in minutes can still matter.
        </p>

        <details className="fc-disclosure mt-4">
          <summary>Show coefficient comparison</summary>
        <DataTable
          wrapperClassName="mt-4 overflow-x-auto"
          minWidth={420}
          rows={rows}
          rowKey={(r) => r.label}
          columns={[
            // Named on 2026-08-24 (axe pass): an empty header leaves the row-label column
            // anonymous to a screen reader, which announces four situations as untitled cells.
            { label: "SITUATION", cell: (r) => r.label },
            {
              label: "SCHEDULE ONLY",
              unit: "PTS",
              numeric: true,
              cell: (r) => r.scheduleOnly.toFixed(3),
            },
            {
              label: "ABSENCE HELD FIXED",
              unit: "PTS",
              numeric: true,
              cell: (r) => r.absenceControlled.toFixed(3),
            },
            { label: "SHIFT", unit: "%", numeric: true, cell: (r) => r.shiftPct.toFixed(1) },
          ]}
        />
        </details>
      </div>
    </section>
  )
}

/**
 * Section E — the limits, stated on the page rather than buried in a method link.
 *
 * Two of them are load-bearing. This is a retrospective measurement and reads as a forecast if
 * nothing says otherwise, and the effects are precise but small against how noisy a basketball
 * game is. A page that publishes point values without both is overclaiming.
 */
function LimitsSection() {
  const n = AVAILABILITY_NOISE
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Limits of the comparison</SectionHeading>
      <div style={termCardStyle}>
        <p style={BODY}>
          <span style={LEAD_IN}>Availability is measured after the game.</span>{" "}
          Every figure here is worked out after the fact, from who actually took the floor. Lineups
          are not settled until shortly before tip, so none of this forecasts a game.
        </p>
        <p className="mt-3" style={BODY}>
          <span style={LEAD_IN}>Much of the margin remains unexplained.</span> Final margins have a standard deviation of{" "}
          {n.marginStdDev.toFixed(1)}{" "}
          points; the model&apos;s error after including team records, schedule, and absences is{" "}
          {n.rmseWithAbsence.toFixed(1)} points.
        </p>
        <p className="mt-3" style={BODY}>
          Absence is inferred from the rotation a team had actually been using, because a
          long-term injury can keep a player off the sheet entirely. Coverage starts in{" "}
          {AVAILABILITY_SAMPLE.firstSeason}, where the box scores this rests on begin.
        </p>
      </div>
    </section>
  )
}

export function AvailabilityContent() {
  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: WIDTH.wide }}>
      <ScaleSection />
      <FrequencySection />
      <TrendSection />
      <ScheduleHoldsUpSection />
      <LimitsSection />
    </div>
  )
}
