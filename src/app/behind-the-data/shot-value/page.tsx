import type { Metadata } from "next";
import { BehindTheDataShell } from "@/components/behind-the-data-shell";
import {
  Formula,
  LimitList,
  Note,
  Prose,
  Section,
  ValueGrid,
} from "@/components/behind-the-data-parts";

export const metadata: Metadata = {
  title: "Expected Shot Value · Behind the Data",
  description:
    "Expected shot value (xeFG%) by court location, its zone baseline, and the shooting context the model does not observe.",
};

const EVALUATED_ON = "2026-07-02";

export default function ShotValueMethodPage() {
  return (
    <BehindTheDataShell
      topic="shot-value"
      eyebrow="BEHIND THE DATA · SHOT VALUE"
      title="Expected Shot Value"
      description="A model estimate of shot value at each court location, fitted to league shooting data. Defender position and shooter skill are outside this model."
    >
      <Section label="WHAT IS COMPUTED" title="Expected value by court location">
        <Prose>
          The half court is divided into a grid of one-foot cells. For each cell, the model
          estimates make probabilities for two- and three-point attempts, then combines them
          using the league&rsquo;s observed mix of those attempts in that cell and season.
          Effective field goal percentage gives a made three-pointer 1.5 times the credit of
          a made two-pointer.
        </Prose>
        <Formula>
          {`r3 = three-point attempts / all attempts in the cell
xeFG% = 100 × [(1 − r3) × P(make two) + r3 × 1.5 × P(make three)]`}
        </Formula>
        <Prose>
          Expected eFG% describes the model&rsquo;s estimate for league shooting at a given
          spot. The difference view shows the <strong>location model minus the zone
          baseline</strong>, in percentage points. It compares the two models&rsquo; estimates,
          rather than a team&rsquo;s actual shooting with an expectation.
        </Prose>
        <Note>
          A three-pointer can have a lower make probability and still have a higher expected
          value than a two-pointer. The eFG% scale accounts for the extra point.
        </Note>
      </Section>

      <Section label="TWO SURFACES" title="Comparing the two location models" descriptor={`Evaluation recorded ${EVALUATED_ON}`} disclosure>
        <Prose>
          The page compares two models. The{" "}
          <strong>zone baseline</strong> uses the average make rate for each cell&rsquo;s
          official zone and distance-range category, then applies the cell&rsquo;s three-point
          weighting. A category absent from training falls back to the overall training make
          rate. The <strong>gradient-boosted model</strong> uses distance and angle from
          the basket, so its estimates can vary within a zone. Left and right are folded
          together for the location estimate.
        </Prose>
        <ValueGrid
          values={[
            { label: "Location model", value: "gbm-v1", sub: "gradient boosting" },
            { label: "Baseline", value: "baseline-zone-v1", sub: "official zone averages" },
            { label: "Model's edge", value: "~1%", sub: "log-loss / Brier" },
          ]}
        />
        <Prose>
          In the recorded season-by-season validation, the location model improved pooled
          log-loss and Brier score by roughly one percent over the zone baseline. Each
          validation season was predicted using earlier seasons only. Those metrics assess
          probability estimates; the improvement does not mean it predicts one percent more
          makes and misses correctly.
        </Prose>
        <Note>
          The displayed surfaces use models refitted on all seasons in the training data,
          including seasons shown on the map. They are retrospective reference surfaces,
          not the held-out predictions used in validation. Period is fixed at the training
          average and home/away at an even mix; neither varies by cell. New seasons require
          a separate data and surface update.
        </Note>
      </Section>

      <Section label="WHAT THIS IS NOT" title="Shot context the model cannot see" disclosure>
        <Prose>
          Defender distance, shot clock, touch time, and dribbles can help describe a shot.
          Those inputs are absent from the location data used here. A wide-open corner three
          and a contested one off the dribble receive the same expected value in the same
          cell and season.
        </Prose>
        <Prose>
          <strong>Shot value</strong> estimates what a shot from this location is worth on
          average. It cannot judge whether a particular attempt was a good shot.
        </Prose>
      </Section>

      <Section label="WHAT THIS CANNOT SEE" title="Full limitations" disclosure>
        <LimitList
          items={[
            "Defender distance and contest level.",
            "Shot clock, touch time, dribbles, and whether the shot was assisted.",
            "Shooter skill. Players with different shooting records receive the same expected value from the same cell.",
            "Displayed cell values do not vary with the score, period, or whether the possession was a scramble or a set play.",
            "Sparse cells have less observed shooting evidence. The estimates are model outputs, not direct make percentages from each cell; square size shows the observed attempt volume.",
          ]}
        />
      </Section>
    </BehindTheDataShell>
  );
}
