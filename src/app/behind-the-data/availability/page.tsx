import type { Metadata } from "next";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import { DataTable } from "@/components/ui/data-table";
import {
  AVAILABILITY_DEFINITION,
  AVAILABILITY_EFFECTS,
  AVAILABILITY_FREQUENCY,
  AVAILABILITY_NOISE,
  AVAILABILITY_SAMPLE,
  AVAILABILITY_SCHEDULE_HOLDS_UP,
} from "@/lib/availability-facts";

export const metadata: Metadata = {
  title: "Availability Cost · Behind the Data",
  description:
    "How missing rotation players are identified, valued using Game Score, and included in an analysis of final margin alongside schedule terms.",
};

const D = AVAILABILITY_DEFINITION;
const E = AVAILABILITY_EFFECTS;

/** The largest of the four shifts, so the prose cannot drift from the table it describes. */
const WORST_SHIFT = Math.max(
  ...Object.values(AVAILABILITY_SCHEDULE_HOLDS_UP).map((t) => Math.abs(t.shiftPct))
);

/** Reader-facing names for the four schedule terms in the absence check. */
const SCHEDULE_TERM_LABELS: Record<keyof typeof AVAILABILITY_SCHEDULE_HOLDS_UP, string> = {
  backToBack: "Back-to-back",
  visitingAltitude: "Altitude, visitor",
  priorOvertime: "Overtime last game",
  scheduleDensity: "Schedule density",
};

export default function AvailabilityMethodPage() {
  return (
    <BehindTheDataShell
      topic="availability"
      eyebrow="BEHIND THE DATA · AVAILABILITY COST"
      title="Availability cost"
      description="How missing rotation players relate to final margin. Absences are known only after a game is played, so nothing here forecasts tonight's lineup."
    >
      <Section label="WHAT COUNTS AS MISSING" title="Who counts as a missing player">
        <Prose>
          A missing player is someone in the team&rsquo;s recent rotation who did not play.
          The rotation comes from <strong>earlier games</strong>, because a box score can leave
          out players who sat.
        </Prose>
        <Formula>
          {`rotation  ${D.minAppearances}+ appearances with minutes
          in the team's last ${D.rotationWindowGames} games
          this season, averaging
          ${D.rotationMinutes}+ minutes

missing   in the rotation, but did
          not play tonight`}
        </Formula>
        <ValueGrid
          values={[
            { label: "Rotation window", value: `${D.rotationWindowGames} games`, sub: "earlier games this season" },
            { label: "Rotation threshold", value: `${D.rotationMinutes} min`, sub: "average per appearance" },
            { label: "Typical rotation", value: `${AVAILABILITY_FREQUENCY.meanRotationSize.toFixed(1)}`, sub: "players, measured" },
          ]}
        />
        <Prose>
          A long absence counts for at most its first four games. After four straight misses,
          the player no longer has {D.minAppearances} games in the window. A player with fewer
          recent games can drop out sooner.
        </Prose>
        <Note>
          The window restarts each season, so a team is measured from its sixth game, and
          players who left in the off-season never count as missing. The short window follows
          trades, coaching choices and injuries. It can miss a player whose minutes were
          already falling before an injury.
        </Note>
        <Note>
          A confirmed appearance counts as present even when its minutes are unclear. Games
          where unclear participation could change the result are left out, which thins older
          seasons most. An unclear box score is never read as proof of an absence.
        </Note>
      </Section>

      <Section label="WHAT AN ABSENCE IS WORTH" title="Estimating a player's missing contribution" disclosure>
        <Prose>
          Each absence is weighted by <strong>Game Score</strong>, a one-number summary of a
          box score. A player&rsquo;s value is their Game Score average over up to{" "}
          {D.qualityGames} earlier games with minutes (at least five), minus the team&rsquo;s
          rotation median.
        </Prose>
        <Formula>
          {`GmSc  = PTS + 0.4·FGM − 0.7·FGA
      − 0.4·(FTA − FTM)
      + 0.7·ORB + 0.3·DRB + STL
      + 0.7·AST + 0.7·BLK
      − 0.4·PF − TOV

value = max(0, GmSc average
               − rotation median)`}
        </Formula>
        <Prose>
          The average is taken from the player&rsquo;s last game in the window and ends before it, so that
          game&rsquo;s own line is not included. The rotation median stands in for a
          replacement. A player above it adds positive value; one at or below it adds zero. It
          does not say who actually took the minutes.
        </Prose>
        <Note>
          A rotation player without enough earlier games has no estimate and adds no value.
          They still count toward the rotation size.
        </Note>
        <Note>
          Five weightings were tried against the same baseline: minutes, points, raw Game
          Score, Game Score above replacement, and a simple best-player-out flag. Value above
          replacement fit best. Minutes alone was the weakest continuous measure. The comparison
          is in <code>ml/availability_quality.py</code>. It measures fit, not a held-out
          forecast.
        </Note>
      </Section>

      <Section label="TURNING THAT INTO POINTS" title="Estimating the association with final margin" disclosure>
        <Prose>
          Each estimate comes from a regression on the <strong>final score margin</strong>, so
          results are in points.
        </Prose>
        <Formula>
          {`home margin ~ home court
  + strength gap    (home − away)
  + season position (away − home)
  + schedule terms  (away − home)
  + absence value   (away − home)`}
        </Formula>
        <Prose>
          Each term is a gap between the teams, so equal values cancel. Team strength is each
          side&rsquo;s win rate in <em>earlier</em> games only, pulled toward .500 early in a
          season so an October record is not taken at face value. It keeps a better team&rsquo;s
          edge from being credited to the other side&rsquo;s absences.
        </Prose>
        <Prose>
          &ldquo;Best player&rdquo; is the rotation member with the highest Game Score average.
          The best-player-out estimate compares one side missing its best player with the
          other side not missing theirs. It is not a fixed penalty for every star.
        </Prose>
        <ValueGrid
          values={[
            { label: "Games measured", value: AVAILABILITY_SAMPLE.games.toLocaleString(), sub: `${AVAILABILITY_SAMPLE.firstSeason} through ${AVAILABILITY_SAMPLE.lastSeason}` },
            { label: "Best player out", value: `${E.bestPlayerOut.points.toFixed(2)} pts`, sub: `t = ${E.bestPlayerOut.t.toFixed(1)}` },
            { label: "Per point above replacement", value: `${E.missValuePerPoint.points.toFixed(2)} pts`, sub: `t = ${E.missValuePerPoint.t.toFixed(1)}` },
          ]}
        />
        <Note>
          The absence measures overlap heavily. Put in one model together, their estimates
          swing and one even flips sign. So each figure comes from its own model. Read them as
          separate answers, and never add them up.
        </Note>
        <Note>
          The t-values use plain regression standard errors, not adjusted for the same teams
          and players appearing again and again. These are observed associations, not proof
          that an absence caused the change in margin.
        </Note>
      </Section>

      <Section label="WHY THE SCHEDULE STILL COUNTS" title="Schedule results after accounting for absences" disclosure>
        <Prose>
          Teams sometimes rest players on the second night of a back-to-back. If that drove the
          schedule effects, adding absences to the model would shrink them. It barely does:
        </Prose>
        <DataTable
          rows={Object.entries(AVAILABILITY_SCHEDULE_HOLDS_UP).map(([name, t]) => ({
            name: SCHEDULE_TERM_LABELS[name as keyof typeof AVAILABILITY_SCHEDULE_HOLDS_UP],
            ...t,
          }))}
          rowKey={(r) => r.name}
          columns={[
            { label: "TERM", cell: (r) => r.name },
            { label: "ALONE", unit: "COEF.", numeric: true, cell: (r) => r.scheduleOnly.toFixed(3) },
            { label: "WITH ABSENCES", unit: "COEF.", numeric: true, cell: (r) => r.absenceControlled.toFixed(3) },
            { label: "CHANGE", unit: "%", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.shiftPct.toFixed(1) },
          ]}
        />
        <Prose>
          Each of the four moves by under {Math.ceil(WORST_SHIFT)}%. Measured absences explain
          little of the schedule effect here. That does not rule out unmeasured absences,
          changes in playing time, or other factors.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "It is not a forecast. Who sat is known only after the game. Lineups settle shortly before tip, so nothing here says who will play tonight.",
            "It does not know why a player was out. Injury, load management, suspension and personal reasons are one category here.",
            "It does not know who took the missing minutes. The team's rotation median is a stand-in, not the actual substitute.",
            "Game Score sees little defense and can undervalue a defensive player.",
            "Missing box-score fields are filled with zero for Game Score, which can skew estimates from incomplete records.",
            `Final margins have a standard deviation of ${AVAILABILITY_NOISE.marginStdDev.toFixed(1)} points. With records, schedule and absences included, the model's error is still ${AVAILABILITY_NOISE.rmseWithAbsence.toFixed(1)} points. Most of what decides a game is not here.`,
            `The margin comparison covers ${AVAILABILITY_SAMPLE.firstSeason} through ${AVAILABILITY_SAMPLE.lastSeason}, wherever sources support it. Both teams need usable histories for a game to count.`,
            "Coverage varies by season, and some early seasons are thin or missing. Yearly rates describe the games included, not a league-wide trend.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
