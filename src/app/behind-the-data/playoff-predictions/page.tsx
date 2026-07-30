import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
} from "@/components/behind-the-data-parts";
import { termTdStyle, termThStyle } from "@/lib/terminal-styles";

export const metadata: Metadata = {
  title: "Playoff Predictions — Behind the Data",
  description:
    "The playoff series model: its features, why the target is the home-court team, and why out-of-sample accuracy is published beside the in-sample number.",
};

/** The series-grain feature set, as stored on `playoff_series`. */
const FEATURES = [
  {
    name: "entry_rest_diff",
    what: "Days of rest each side carried into game one, differenced.",
    why: "The headline feature, and the only one descended from the rest model the rest of the site is built on.",
  },
  {
    name: "seed_diff",
    what: "Seed gap between the two teams.",
    why: "Derived as a win-percentage rank proxy rather than read from an official bracket seed.",
  },
  {
    name: "win_pct_diff",
    what: "Regular-season win percentage, differenced.",
    why: "The plainest available measure of which team is better.",
  },
  {
    name: "h2h_diff",
    what: "Regular-season head-to-head record between the two.",
    why: "Small samples — often three or four games — so it carries little weight.",
  },
  {
    name: "is_best_of_7",
    what: "Series format flag.",
    why: "First rounds were best-of-5 through 2001-02; a shorter series is more random.",
  },
] as const;

export default function PlayoffPredictionsMethodPage() {
  return (
    <BehindTheDataShell
      eyebrow="BEHIND THE DATA · PLAYOFF PREDICTIONS"
      title="Playoff predictions"
      description="A separate model from the regular-season one, at series grain rather than game grain. It predicts who wins a series, not who wins a night."
    >
      <Section label="WHAT IS PREDICTED" descriptor="SERIES GRAIN">
        <Prose>
          One row per playoff series. The model outputs the probability that the{" "}
          <strong>home-court team</strong> wins the series — not the higher seed, and not a
          named favourite. Home court is the reference because it is unambiguous in every era
          and needs no bracket lookup, which seeding does.
        </Prose>
        <Formula>
          {`P(home-court team wins the series)   →   ≥ 0.5 predicts them, otherwise the opponent`}
        </Formula>
        <Note>
          Playoff games are deliberately excluded from the regular-season fatigue model: a
          fixed two-team series breaks its travel assumptions, since the opponent never
          changes and the itinerary is known in advance. The two models share a lineage and a
          philosophy, not a code path.
        </Note>
      </Section>

      <Section label="THE FEATURES" descriptor={`${FEATURES.length} INPUTS`}>
        <div className="overflow-x-auto">
          <table className="mono w-full" style={{ fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={termThStyle}>FEATURE</th>
                <th style={termThStyle}>WHAT IT IS</th>
                <th style={termThStyle}>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.name}>
                  <td style={{ ...termTdStyle, fontWeight: 700, whiteSpace: "nowrap" }}>{f.name}</td>
                  <td style={termTdStyle}>{f.what}</td>
                  <td style={{ ...termTdStyle, color: "var(--term-text-muted)" }}>{f.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section label="WHY TWO ACCURACY NUMBERS" descriptor="THE IMPORTANT PART">
        <Prose>
          Every series carries two predictions. The <strong>in-sample</strong> one comes from a
          model that has already seen that series in training. The{" "}
          <strong>walk-forward, out-of-sample</strong> one comes from a model trained only on
          seasons that had already happened when the series was played.
        </Prose>
        <Prose>
          Only the second is evidence. In-sample accuracy on a small dataset is close to
          meaningless — it measures how well a model memorises, and with a few hundred series
          it can memorise a great deal. It is published anyway, beside the honest number, so
          the gap between them is visible rather than hidden.
        </Prose>
        <Note>
          The dataset is small by the standards of any modelling problem: a few hundred series
          across the covered seasons, against roughly forty-six thousand regular-season games.
          That is the central constraint here, and it is why the model stays deliberately
          simple rather than reaching for something expressive enough to overfit.
        </Note>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" descriptor="THE HONEST LIMITS">
        <LimitList
          items={[
            "Injuries, which decide playoff series more often than any feature in this model.",
            "Matchup and style. A team built to beat one opponent and not another is invisible to win percentage and seeding.",
            "In-series adjustments. Coaches change rotations and schemes between games; the model predicts once, before game one.",
            "Roster change between the regular season and the playoffs — a deadline acquisition counts only through whatever win percentage it produced.",
            "Seeds are derived from win-percentage rank rather than read from an official bracket, so they can disagree with the published seeding in tiebreak situations.",
            "A probability near 0.5 is the model saying it does not know. It is not a lean worth acting on.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
