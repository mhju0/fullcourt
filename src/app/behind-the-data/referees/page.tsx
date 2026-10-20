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
      description="How foul patterns are compared across officials' games, with season adjustments, sample thresholds, and tests against random assignments. Calls are recorded at crew level."
    >
      <Link href="/behind-the-data/referees/archive" className="reference-button w-fit">Open the archived foul-pattern table →</Link>
      <Section label="THE UNIT IS A CREW'S GAME" title="What an official's row represents">
        <Prose>Three officials work each game, but the play-by-play does not identify who made a call. Each foul is attributed to the crew.</Prose>
        <Formula>{`a game credits all three officials equally
     ⇒ an official's rate includes calls made by their crewmates
     ⇒ it does not isolate that official's individual effect`}</Formula>
        <Prose>Officials work with different partners over time. This can reduce the influence of one crewmate, but it does not establish random assignments or remove all confounding. The figures describe games an official worked, not calls they made.</Prose>
      </Section>
      <Section label="WHERE THE NUMBERS COME FROM" title="The research samples" disclosure>
        <Prose>
          The analysis uses cached ESPN play-by-play and box scores, so each test can use the
          same game records. These are archived studies through {style.lastSeason}, not a
          current-season officiating feed. The seasonal Last Two Minute reports use a
          separate collection and publication process.
        </Prose>
        <Prose>
          The <strong>three game counts</strong> reflect different input requirements and
          extraction dates. Each analysis reports its own denominator.
        </Prose>
        <ValueGrid
          values={[
            { label: "Foul mix", value: style.gamesCovered.toLocaleString(), sub: `needs a box score · ${style.gamesExcluded.toLocaleString()} excluded` },
            { label: "Timing", value: timing.gamesCovered.toLocaleString(), sub: "needs only the play stream" },
            { label: "Folklore", value: legends.regularSeasonGames.toLocaleString(), sub: `plus ${legends.playoffGames.toLocaleString()} playoff games` },
          ]}
        />
        <Note>
          Timing covers more games than the foul mix because a play stream survives in games whose
          box score does not. The folklore chapter covers more than either because it was rebuilt
          later, on a filter that admits the games where ESPN lists a <em>standby fourth</em>{" "}
          official alongside the three who worked, a case the earlier extracts dropped.
          Playoff games are counted only there, and only for the questions that are about the
          postseason.
        </Note>
      </Section>

      <Section label="HOW A TENDENCY IS MEASURED" title="Comparing foul shares within each season" disclosure>
        <Prose>
          Officiating changes with the rulebook. The league called a different game in{" "}
          {style.firstSeason} than in {style.lastSeason}, so comparing an official&rsquo;s raw
          rate to a pooled average would credit them with the era they happened to work in. Every
          figure is therefore a deviation from the league&rsquo;s <em>own</em> average in the
          same season, and on <strong>shares</strong> rather than counts wherever pace could
          otherwise masquerade as a tendency.
        </Prose>
        <Formula>
          {`deviation = official's share of foul type T
            − the league's share of T, that season

emphasised when |z| ≥ ${NOTABLE_Z}, at that official's own sample size
published only for officials with ≥ ${MIN_GAMES} games`}
        </Formula>
        <ValueGrid
          values={[
            { label: "Emphasis bar", value: `|z| ≥ ${NOTABLE_Z}`, sub: "two standard errors" },
            { label: "Publication bar", value: `${MIN_GAMES} games`, sub: "minimum sample shown" },
            { label: "Officials shown", value: String(publishable(style.officials).length), sub: `of ${style.officials.length} in the data` },
          ]}
        />
        <Note>
          The bar cuts both ways and is meant to. At |z| ≥ {NOTABLE_Z}, about one cell in
          twenty clears it from noise alone, roughly {CHANCE_TYPE_CELLS} of the {TYPE_CELLS}{" "}
          type cells in this table, so a bold cell does not establish an individual tendency. The page does not lead with a name on
          that basis. Muted cells are shown rather than hidden, because a table of only the
          significant ones invites the reader to find a pattern that was selected for them.
        </Note>
      </Section>

      <Section label="THE WINDOW" title="Why each row uses the latest 200 games" disclosure>
        <Prose>
          Careers in this data run from {MIN_GAMES} games to more than 600, and a z-score bar
          moves with sample size: an effect that clears |z| ≥ {NOTABLE_Z} at n = 700
          may not clear it at n = 200. The recorded foul mix also changes over time. A
          pre-registered drift test split every official with ≥{" "}
          {driftData.minCareerForSplit} games into their most recent{" "}
          {driftData.windowGames} games and everything earlier:{" "}
          {driftData.drift.beyond} of {driftData.drift.cells} cells sat beyond |zΔ| ≥{" "}
          {NOTABLE_Z} ({driftData.drift.sharePct}%), where chance produces about{" "}
          {driftData.drift.chancePct}%. This suggests that career averages can obscure changes
          over time.
        </Prose>
        <Prose>
          So since 2026-08-24 the table scores every official on their{" "}
          <strong>most recent {driftData.windowGames} games</strong>, the publication bar, so
          every published row is a full window, the same n and the same bolding bar on every
          line. At n = {driftData.windowGames} the bar is harder to clear, so
          the table bolds {WINDOW_BOLD_CELLS} type cells where the career basis
          bolded {CAREER_BOLD_CELLS}. The full-span figures ship alongside in
          the same artifact for anyone comparing.
        </Prose>
        <Note>
          The per-season split was measured in the same pre-registration and, against
          expectation, cleared its declared bars ({driftData.seasonSplit.sharePct}% of
          official-season cells beyond |z| ≥ {NOTABLE_Z};{" "}
          {driftData.seasonSplit.signAgreementPct}% within-official sign agreement). It still
          is not shown in the browse table because adding a season axis would make it much
          larger. The published artifact retains those results.
        </Note>
      </Section>

      <Section label="THE TEST THAT CARRIES THE VERDICT" title="Comparing officials with random assignments" disclosure>
        <Prose>
          Counting how many officials clear a bar is not enough to say officials differ, because
          some always will. The verdict comes instead from a single question asked once:{" "}
          <strong>is the spread between officials wider than the spread you get by dealing the
          same games out at random?</strong>
        </Prose>
        <Formula>
          {`observed:  the spread of per-official means
null:      redraw each official's games at random from the
           same seasons, holding games-per-season fixed
           (2,000 times)

verdict:   how often the null's spread reaches the observed one`}
        </Formula>
        <Prose>
          Holding games-per-season fixed is what stops an era doing the work: two officials who
          worked different decades cannot be made to differ by the league&rsquo;s foul rate
          changing between them. And because it is <em>one</em> test rather than one per official,
          the test does not select an individual official from many comparisons. Other
          questions on the page still need their own treatment of multiple testing.
        </Prose>
      </Section>

      <Section label="INTERPRETING AN EXTREME PAIR" title="Unusual official-player records and chance" disclosure>
        <Prose>
          The folklore chapter compares official-player records with the extremes expected
          from checking many pairs. An unusual record alone does not establish bias.
        </Prose>
        <Formula>
          {`pairs examined                       ${floor.pairsTested.toLocaleString()}
minimum shared playoff games        ${floor.minSharedGames}

approximate minimum-p reference     ${floor.mostExtremePFromNoise}
the most famous pair actually       ${legends.legend.p}

cleared p < 0.01                    ${floor.clearedPoint01}   (simple reference ${floor.expectedPoint01})
cleared p < 0.05                    ${floor.clearedPoint05}   (simple reference ${floor.expectedPoint05})`}
        </Formula>
        <Prose>
          Across {floor.pairsTested.toLocaleString()} pairs, a rough minimum-p reference is
          about {floor.mostExtremePFromNoise}. This 1/N reference approximates the expected
          minimum for independent tests with uniformly distributed null p-values. These
          pairs share games and players, so it is not a calibrated minimum-p distribution
          or an adjusted significance threshold. The featured pair’s result is less extreme
          than that reference. The count references use N multiplied by each p-value cutoff;
          they are descriptive comparisons, not a global significance test.
        </Prose>
        <Note>
          One-sided and two-sided p-values are not interchangeable. The reference accompanies
          a <strong>two-sided</strong> sweep, so every pair compared against it is quoted
          two-sided too. That consistency does not remove the approximation’s limitations.
        </Note>
      </Section>

      <Section label="FIXED BEFORE ANYTHING WAS RUN" title="Preregistered questions and decision rules" disclosure>
        <Prose>
          Testing many questions and reporting only favorable results can exaggerate the
          evidence. The questions and decision rules were committed <strong>before</strong>{" "}
          the analyses ran.
        </Prose>
        <ValueGrid
          values={[
            { label: "Axes A · B · C", value: "ADR 0007", sub: "accepted 2026-08-06" },
            { label: "Player-level (D)", value: "Own file", sub: "committed before the playoff data existed" },
            { label: "Nulls published", value: "All of them", sub: "a null ships the page" },
          ]}
        />
        <Prose>
          Two consequences are visible on the surface. The Q4 &ldquo;clutch&rdquo; question was{" "}
          <em>gated</em> behind a coarser per-quarter test, so the narrow window was only allowed
          to proceed if the broad test passed. It passed; the narrow window then ran and came
          back null, and that result is published.
          And the five famous claims were named in writing before the postseason was even fetched,
          reducing the risk of choosing claims after seeing their results.
        </Prose>
        <Note>
          The protocol required publishing null results. The reported tests include player
          foul rates, player win records, star foul trouble, crowd effects, and make-up calls,
          including those that did not meet their declared evidence thresholds.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "It cannot attribute a call to an individual. Each figure describes the games an official worked with two crewmates.",
            "It cannot judge whether a call was correct. The figures measure call frequency, not accuracy.",
            `It cannot see before ${style.firstSeason}. Named officials are available further back, but the play-by-play detail these measures need is not.`,
            "It cannot test the playoff legends properly. A pair shares a handful of postseason games in a lifetime; both eras of the most famous claim fall below the minimum this page requires before it will judge a pair at all.",
            "It cannot undo how a claim was found. A record the public discovered by scanning outcomes can only be confirmed on games nobody had seen when they found it, and there are rarely enough of those.",
            "It cannot separate officiating from changes in how teams play while leading or trailing. The score-state gradient is an association, not a causal estimate.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
