import type { Metadata } from "next";
import Link from "next/link";
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
import driftData from "@/data/referee-career-drift.json";
import legendsData from "@/data/referee-legends.json";
import styleData from "@/data/referee-foul-style.json";
import timingData from "@/data/referee-timing.json";
import {
  FOUL_COLUMNS,
  isNotable,
  MIN_GAMES,
  NOTABLE_Z,
  publishable,
  type FoulStyleColumns,
  type RefereeFoulStyle,
} from "@/lib/referee-foul-style";
import type { RefereeLegends } from "@/lib/referee-legends";
import type { RefereeTiming } from "@/lib/referee-timing";

export const metadata: Metadata = {
  title: "Referee Effect · Behind the Data",
  description:
    "How officiating tendencies are measured: why a figure belongs to a crew rather than a person, what a permutation null is doing, and why an extreme referee-and-player record is not evidence on its own.",
};

const style = styleData as RefereeFoulStyle;

/**
 * Type cells the published table bolds, counted the way the table bolds them: on the
 * one-decimal z the artifact stores. The drift script's own counts use unrounded z, so a cell
 * at 1.96 counted there as below the bar while the table printed it bold at 2.0.
 */
function boldTypeCells(pick: (row: RefereeFoulStyle["officials"][number]) => FoulStyleColumns): number {
  return publishable(style.officials).reduce(
    (n, row) => n + FOUL_COLUMNS.filter(({ key }) => isNotable(pick(row)[`${key}Z`])).length,
    0
  );
}
const WINDOW_BOLD_CELLS = boldTypeCells((row) => row);
const CAREER_BOLD_CELLS = boldTypeCells((row) => row.career);
/** Type cells in the published table, and about how many a |z| ≥ 2 bar bolds by chance alone. */
const TYPE_CELLS = publishable(style.officials).length * FOUL_COLUMNS.length;
const CHANCE_TYPE_CELLS = Math.round(TYPE_CELLS / 20);
const timing = timingData as RefereeTiming;
const legends = legendsData as RefereeLegends;
const floor = legends.noiseFloor;

export default function RefereeMethodPage() {
  return (
    <BehindTheDataShell
      topic="referees"
      eyebrow="BEHIND THE DATA · ARCHIVE"
      title="Archived referee methods"
      description="How foul patterns are compared across officials' games: season adjustments, sample bars, and tests against random assignment. Calls are credited to the whole crew."
    >
      <Link href="/behind-the-data/referees/archive" className="reference-button w-fit">Open the archived foul-pattern table →</Link>
      <Section label="THE UNIT IS A CREW'S GAME" title="What an official's row represents">
        <Prose>Three officials work each game, but the play-by-play does not say who made a call. So every foul is credited to the whole crew.</Prose>
        <Formula>{`each game counts for all 3 officials
  ⇒ a rate includes crewmates' calls
  ⇒ it cannot isolate one official`}</Formula>
        <Prose>Officials rotate partners over time, which softens any one crewmate&rsquo;s pull. That is not random assignment, so it does not remove every confound. The figures describe games an official worked, not calls they made.</Prose>
      </Section>
      <Section label="WHERE THE NUMBERS COME FROM" title="The research samples" disclosure>
        <Prose>
          The studies use saved ESPN play-by-play and box scores, so every test reads the same
          game records. They are archived studies through {style.lastSeason}, not a live
          officiating feed. The league&rsquo;s Last Two Minute reports are a separate source.
        </Prose>
        <Prose>
          There are <strong>three game counts</strong>, because each study needs different
          inputs and was extracted at a different time. Each reports its own total.
        </Prose>
        <ValueGrid
          values={[
            { label: "Foul mix", value: style.gamesCovered.toLocaleString(), sub: `needs a box score · ${style.gamesExcluded.toLocaleString()} excluded` },
            { label: "Timing", value: timing.gamesCovered.toLocaleString(), sub: "needs only the play stream" },
            { label: "Folklore", value: legends.regularSeasonGames.toLocaleString(), sub: `plus ${legends.playoffGames.toLocaleString()} playoff games` },
          ]}
        />
        <Note>
          Timing covers more games than the foul mix, because some games have a play stream but
          no box score. The folklore study covers more than either. It was rebuilt later and
          keeps games where ESPN lists a <em>standby fourth</em> official, which the earlier
          extracts dropped. Only the folklore study uses playoff games, and only for its
          playoff questions.
        </Note>
      </Section>

      <Section label="HOW A TENDENCY IS MEASURED" title="Comparing foul shares within each season" disclosure>
        <Prose>
          The rulebook changes, and so does the way games are called. {style.firstSeason} and{" "}
          {style.lastSeason} are different games. So each figure is a gap from the
          league&rsquo;s average <em>in the same season</em>. It uses <strong>shares</strong>{" "}
          of fouls, not counts, wherever game pace could pass for a tendency.
        </Prose>
        <Formula>
          {`gap = official's share of foul type
      − league share, same season

bold   when |z| ≥ ${NOTABLE_Z}
shown  when the official has ${MIN_GAMES}+ games`}
        </Formula>
        <ValueGrid
          values={[
            { label: "Emphasis bar", value: `|z| ≥ ${NOTABLE_Z}`, sub: "two standard errors" },
            { label: "Publication bar", value: `${MIN_GAMES} games`, sub: "minimum sample shown" },
            { label: "Officials shown", value: String(publishable(style.officials).length), sub: `of ${style.officials.length} in the data` },
          ]}
        />
        <Note>
          About one cell in twenty clears |z| ≥ {NOTABLE_Z} by chance alone. That is roughly{" "}
          {CHANCE_TYPE_CELLS} of the {TYPE_CELLS} cells in this table, so a bold cell does not
          prove an individual tendency, and the page does not lead with a name. Muted cells stay
          visible. A table of only the striking cells would hand the reader a pattern picked
          for them.
        </Note>
      </Section>

      <Section label="THE WINDOW" title="Why each row uses the latest 200 games" disclosure>
        <Prose>
          Careers here run from {MIN_GAMES} games to more than 600. A z-score bar moves with
          sample size: an effect that clears |z| ≥ {NOTABLE_Z} over 700 games may not over 200.
          Foul patterns also drift over a career.
        </Prose>
        <Prose>
          A pre-registered test split every official with {driftData.minCareerForSplit}+ games
          into their latest {driftData.windowGames} games and everything before.{" "}
          {driftData.drift.beyond} of {driftData.drift.cells} cells moved beyond |zΔ| ≥{" "}
          {NOTABLE_Z} ({driftData.drift.sharePct}%), where chance gives about{" "}
          {driftData.drift.chancePct}%. Career averages can hide real change.
        </Prose>
        <Prose>
          So since 2026-08-24, each official is scored on their{" "}
          <strong>latest {driftData.windowGames} games</strong>. Every row has the same sample
          and the same bar. That bar is harder to clear at {driftData.windowGames} games: the
          table bolds {WINDOW_BOLD_CELLS} cells, where career totals bolded{" "}
          {CAREER_BOLD_CELLS}. The career figures are in the same published file.
        </Prose>
        <Note>
          The same pre-registration tested a season-by-season split. It cleared its bars (
          {driftData.seasonSplit.sharePct}% of official-season cells beyond |z| ≥ {NOTABLE_Z};{" "}
          {driftData.seasonSplit.signAgreementPct}% sign agreement within an official). It is
          left out of the table only because a season axis would make it far larger. The
          published file keeps those results.
        </Note>
      </Section>

      <Section label="THE TEST THAT CARRIES THE VERDICT" title="Comparing officials with random assignments" disclosure>
        <Prose>
          Some officials will always clear a bar, so counting them proves nothing. The verdict
          comes from one question:{" "}
          <strong>are officials more spread out than the same games dealt out at random?</strong>
        </Prose>
        <Formula>
          {`observed  spread of official averages

null      reshuffle each official's
          games within the same seasons,
          2,000 times

verdict   how often the null spread
          reaches the observed one`}
        </Formula>
        <Prose>
          Reshuffling within seasons keeps the era out of it: two officials from different
          decades cannot look different just because league foul rates changed. And because it
          is <em>one</em> test, not one per official, it cannot single out a name by luck. Other
          questions on the page still need their own correction for multiple tests.
        </Prose>
      </Section>

      <Section label="INTERPRETING AN EXTREME PAIR" title="Unusual official-player records and chance" disclosure>
        <Prose>
          Check enough official-and-player pairs and some records will look extreme by chance.
          The folklore study compares each record with that expectation. An unusual record
          alone does not show bias.
        </Prose>
        <DataTable
          rows={[
            { label: "Pairs examined", value: floor.pairsTested.toLocaleString() },
            { label: "Minimum shared playoff games", value: String(floor.minSharedGames) },
            { label: "Smallest p expected from chance", value: String(floor.mostExtremePFromNoise) },
            { label: "The most famous pair", value: String(legends.legend.p) },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { label: "MEASURE", cell: (r) => r.label },
            { label: "VALUE", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.value },
          ]}
        />
        <DataTable
          rows={[
            { cutoff: "p < 0.01", found: floor.clearedPoint01, chance: floor.expectedPoint01 },
            { cutoff: "p < 0.05", found: floor.clearedPoint05, chance: floor.expectedPoint05 },
          ]}
          rowKey={(r) => r.cutoff}
          columns={[
            { label: "CUTOFF", cell: (r) => r.cutoff },
            { label: "PAIRS UNDER IT", unit: "FOUND", numeric: true, style: { fontWeight: 700 }, cell: (r) => r.found },
            { label: "BY CHANCE", unit: "EXPECTED", numeric: true, style: { color: "var(--term-text-muted)" }, cell: (r) => r.chance },
          ]}
        />
        <Prose>
          With {floor.pairsTested.toLocaleString()} pairs, the smallest p-value chance alone
          should produce is about {floor.mostExtremePFromNoise} (one divided by the number of
          pairs). The famous pair is less extreme than that. The chance counts are the number of
          pairs times each cutoff.
        </Prose>
        <Note>
          These are rough references, not a significance test. They assume independent pairs,
          and these pairs share games and players. One-sided and two-sided p-values also differ;
          the sweep is <strong>two-sided</strong>, so every pair is quoted two-sided too.
        </Note>
      </Section>

      <Section label="FIXED BEFORE ANYTHING WAS RUN" title="Preregistered questions and decision rules" disclosure>
        <Prose>
          Testing many questions and reporting only the good ones exaggerates the evidence. So
          the questions and decision rules were written down <strong>before</strong> any
          analysis ran.
        </Prose>
        <ValueGrid
          values={[
            { label: "Axes A · B · C", value: "ADR 0007", sub: "accepted 2026-08-06" },
            { label: "Player-level (D)", value: "Own file", sub: "committed before the playoff data existed" },
            { label: "Nulls published", value: "All of them", sub: "a null ships the page" },
          ]}
        />
        <Prose>
          Two results of that. The Q4 &ldquo;clutch&rdquo; question could only run if a broader
          per-quarter test passed first. It passed; the clutch test then came back null, and
          that is published. And the five famous claims were named in writing before the
          playoff data was even fetched, so none was chosen after seeing its result.
        </Prose>
        <Note>
          Every null is published: player foul rates, player win records, star foul trouble,
          crowd effects and make-up calls, including tests that missed their evidence bars.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "It cannot attribute a call to an individual. Each figure describes the games an official worked with two crewmates.",
            "It cannot judge whether a call was correct. The figures measure call frequency, not accuracy.",
            `It cannot see before ${style.firstSeason}. Named officials are available further back, but the play-by-play detail these measures need is not.`,
            "It cannot properly test the playoff legends. A pair shares only a handful of playoff games in a career; both eras of the most famous claim fall below this page's minimum for judging a pair.",
            "It cannot undo how a claim was found. A record spotted by scanning past results can only be confirmed on games nobody had seen yet, and there are rarely enough of those.",
            "It cannot separate officiating from changes in how teams play while leading or trailing. The score-state gradient is an association, not a causal estimate.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
