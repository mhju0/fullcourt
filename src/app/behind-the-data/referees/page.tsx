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
import driftData from "@/data/referee-career-drift.json";
import legendsData from "@/data/referee-legends.json";
import styleData from "@/data/referee-foul-style.json";
import timingData from "@/data/referee-timing.json";
import { MIN_GAMES, NOTABLE_Z, type RefereeFoulStyle } from "@/lib/referee-foul-style";
import type { RefereeLegends } from "@/lib/referee-legends";
import type { RefereeTiming } from "@/lib/referee-timing";

export const metadata: Metadata = {
  title: "Referee Effect — Behind the Data",
  description:
    "How officiating tendencies are measured: why a figure belongs to a crew rather than a person, what a permutation null is doing, and why an extreme referee-and-player record is not evidence on its own.",
};

const style = styleData as RefereeFoulStyle;
const timing = timingData as RefereeTiming;
const legends = legendsData as RefereeLegends;
const floor = legends.noiseFloor;

export default function RefereeMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · REFEREE EFFECT"
      title="Referee effect"
      description="How officials are compared to one another without turning a difference in style into an accusation. Every figure describes a crew's game, never one person's judgement."
    >
      <Section label="WHERE THE NUMBERS COME FROM" descriptor="THREE POPULATIONS, ON PURPOSE">
        <Prose>
          Everything here is read from ESPN&rsquo;s play-by-play and box scores, cached game by
          game so a question can be re-asked without re-fetching. The NBA&rsquo;s own endpoints are
          unreachable from where this site is built, which is why ESPN is the source rather than
          the fallback.
        </Prose>
        <Prose>
          The page quotes <strong>three different game counts</strong>, and the difference is not
          an error. Each measurement keeps the games it can actually make its own claim from, and
          a page that silently pooled them would be quoting a denominator it did not have.
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
          official alongside the three who worked — a case the earlier extracts silently dropped.
          Playoff games are counted only there, and only for the questions that are about the
          postseason.
        </Note>
      </Section>

      <Section label="THE UNIT IS A CREW'S GAME" descriptor="NOT A PERSON'S JUDGEMENT">
        <Prose>
          This is the constraint every other decision on the page follows from.{" "}
          <strong>Three officials work every NBA game, and the play-by-play never records which
          one blew the whistle.</strong> A foul can be attributed to the crew and no further.
        </Prose>
        <Formula>
          {`a game credits all three officials equally
     ⇒ each published figure ≈ ⅓ of the real individual effect
     ⇒ the true spread between officials is WIDER than shown, never narrower`}
        </Formula>
        <Prose>
          What makes that survivable is that crews barely repeat. Partners are effectively
          reshuffled across a career, so a colleague&rsquo;s tendencies wash out as noise instead
          of accumulating as a shared signature. It is the reason a per-official figure means
          anything at all — and the reason it can never mean as much as it appears to.
        </Prose>
      </Section>

      <Section label="HOW A TENDENCY IS MEASURED" descriptor="AGAINST THE LEAGUE'S OWN SEASON">
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
            { label: "Publication bar", value: `${MIN_GAMES} games`, sub: "below it, a rate is noise" },
            { label: "Officials shown", value: String(timing.eligibleOfficials), sub: `of ${style.officials.length} in the data` },
          ]}
        />
        <Note>
          The bar cuts both ways and is meant to. At |z| ≥ {NOTABLE_Z}, about{" "}
          {timing.expectedByChance} of {timing.eligibleOfficials} officials clear it from noise
          alone — so a cell being bold is not a finding, and the page never leads with a name on
          that basis. Muted cells are shown rather than hidden, because a table of only the
          significant ones invites the reader to find a pattern that was selected for them.
        </Note>
      </Section>

      <Section label="THE WINDOW" descriptor="EVERY OFFICIAL'S LAST 200 GAMES">
        <Prose>
          Careers in this data run from {MIN_GAMES} games to more than 600, and a z-score bar
          moves with sample size: an identical quirk that clears |z| ≥ {NOTABLE_Z} at n = 700
          is out of reach at n = 200. Worse, whistles measurably <em>change</em>. A
          pre-registered drift test split every official with ≥{" "}
          {driftData.minCareerForSplit} games into their most recent{" "}
          {driftData.windowGames} games and everything earlier:{" "}
          {driftData.drift.beyond} of {driftData.drift.cells} cells sat beyond |zΔ| ≥{" "}
          {NOTABLE_Z} ({driftData.drift.sharePct}%), where chance produces about{" "}
          {driftData.drift.chancePct}% — careers are not stationary, and a career average
          smears real change.
        </Prose>
        <Prose>
          So since 2026-08-24 the table scores every official on their{" "}
          <strong>most recent {driftData.windowGames} games</strong> — the publication bar, so
          every published row is a full window, the same n and the same bolding bar on every
          line, answering &ldquo;what is this official like now&rdquo;. The price is stated
          rather than hidden: at n = {driftData.windowGames} the bar is harder to clear, so
          the table bolds {driftData.drift.windowBoldCells} type cells where the career basis
          bolded {driftData.drift.careerBoldCells}. The full-span figures ship alongside in
          the same artifact for anyone comparing.
        </Prose>
        <Note>
          The per-season split was measured in the same pre-registration and, against
          expectation, cleared its declared bars ({driftData.seasonSplit.sharePct}% of
          official-season cells beyond |z| ≥ {NOTABLE_Z};{" "}
          {driftData.seasonSplit.signAgreementPct}% within-official sign agreement). It still
          has no surface — a 74-official-by-season grid outweighs a browse page — and that is
          a design refusal recorded here, not a power failure.
        </Note>
      </Section>

      <Section label="THE TEST THAT CARRIES THE VERDICT" descriptor="ONE QUESTION, NO MULTIPLICITY">
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
          there is no multiplicity to correct — which is exactly what a count of extreme names
          cannot say for itself.
        </Prose>
      </Section>

      <Section label="WHY AN EXTREME PAIR PROVES NOTHING" descriptor="THE NOISE FLOOR">
        <Prose>
          The folklore chapter puts named officials beside named players, which is the most
          dangerous thing on this site. The safeguard is arithmetic rather than caution: every
          extreme record is published with the record chance produces at the same bar.
        </Prose>
        <Formula>
          {`pairs examined                       ${floor.pairsTested.toLocaleString()}
minimum shared playoff games        ${floor.minSharedGames}

most extreme p from PURE NOISE      ${floor.mostExtremePFromNoise}
the most famous pair actually       ${legends.legend.p}

cleared p < 0.01                    ${floor.clearedPoint01}   (chance predicts ${floor.expectedPoint01})
cleared p < 0.05                    ${floor.clearedPoint05}   (chance predicts ${floor.expectedPoint05})`}
        </Formula>
        <Prose>
          Line up {floor.pairsTested.toLocaleString()} pairs of coin flips and one of them finishes
          first. The most extreme p-value that process yields is about{" "}
          {floor.mostExtremePFromNoise} — so a real pair has to beat <em>that</em>, not 0.05, before
          it means anything. The sport&rsquo;s most famous referee grudge does not.
        </Prose>
        <Note>
          One-sided and two-sided p-values are not interchangeable here, and mixing them is how
          this page nearly shipped a claim twice as strong as its evidence. The noise floor is the
          expected minimum of a <strong>two-sided</strong> sweep, so every pair compared against it
          is quoted two-sided too. A test fails if that ever stops being true.
        </Note>
      </Section>

      <Section label="FIXED BEFORE ANYTHING WAS RUN" descriptor="THE PRE-REGISTRATIONS">
        <Prose>
          The cached corpus makes asking one more question nearly free, which is precisely the
          hazard: a sweep across officials will always return something writeable. So what could
          be asked was written down and committed <strong>before</strong> any of it was run.
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
          to spend the sample if the broad one earned it — it did not, and the null is published.
          And the five famous claims were named in writing before the postseason was even fetched,
          which is the only reason the one that came back lopsided carries any weight at all.
        </Prose>
        <Note>
          The rule that mattered most was the least glamorous: <strong>a null still ships the
          page.</strong> Most of what was asked came back empty — player foul rates, player win
          records, star foul trouble, crowd effects, make-up calls — and all of it is published.
          The finished surface is built around the emptiest result of the lot.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "It cannot attribute a call. Three officials work every game and the record never says which one made it, so every figure is roughly a third of the individual effect and none of it names a person's judgement.",
            "It cannot tell a correct call from an incorrect one. Nothing here is a measurement of accuracy — only of how often a kind of call is made.",
            `It cannot see before ${style.firstSeason}. Named officials are available further back, but the play-by-play detail these measures need is not.`,
            "It cannot test the playoff legends properly. A pair shares a handful of postseason games in a lifetime; both eras of the most famous claim fall below the minimum this page requires before it will judge a pair at all.",
            "It cannot undo how a claim was found. A record the public discovered by scanning outcomes can only be confirmed on games nobody had seen when they found it, and there are rarely enough of those.",
            "It cannot separate a whistle from the basketball. Fouls tilt hard toward whoever is leading, but a trailing team attacks and a leading team protects — the page publishes the gradient and refuses the causal reading.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
